#!/usr/bin/env node
import 'dotenv/config';
import prompts from 'prompts';

import { parseArgs, parseIdList } from './src/libs/cli.js';
import { loadConfig, saveConfig, resolveUserDir, getBroUserDir } from './src/libs/config.js';
import { checkProxy, findWorkingProxies, type CheckEvent, type FoundProxy } from './src/libs/proxy.js';
import { openBrowser, ensureChromiumInstalled } from './src/libs/browser.js';
import type { Bro, Config } from './src/libs/types.js';

function printUsage(): void {
  console.log(`Usage: multibro [list] [url] [--country=DE | -c DE] [--protocol=http | -p http]

  list      bro ids to open, e.g. "1,2,4-6,7" (default: all bros in bros.json)
  url       page to open in each bro (optional)
  protocol  proxy protocol filter, e.g. "http" (default: "http"); pass ANY to disable

Examples:
  multibro 1,2,4-6,7
  multibro 1-5 https://google.com --country=DE
  multibro 1-5 --protocol=ANY
`);
}

// Strips the transient `latency` field measured during the speed check
// before persisting a proxy into bros.json.
function toStoredProxy(candidate: FoundProxy) {
  const { latency, ...proxy } = candidate;
  return proxy;
}

function logProxyCheck({ proxy, ok, latency, exitCountry, matched }: CheckEvent): void {
  const status = !ok ? 'DEAD' : matched ? 'OK' : `WRONG COUNTRY (${exitCountry ?? '?'})`;
  const timing = ok ? ` ${latency}ms` : '';
  console.log(`  Checking ${proxy.proxy} (${proxy.protocol})...${timing} ${status}`);
}

function assignProxy(
  config: Config,
  byId: Map<number, Bro>,
  id: number,
  candidate: FoundProxy,
  countryUsed?: string
): Bro {
  let bro = byId.get(id);
  if (!bro) {
    bro = { id, user_dir: `bro${id}` };
    config.bros.push(bro);
    byId.set(id, bro);
  }
  bro.proxy = toStoredProxy(candidate);
  if (countryUsed && countryUsed.toUpperCase() !== 'ANY') {
    bro.country = countryUsed;
  }
  return bro;
}

function effectiveCountry(
  id: number,
  byId: Map<number, Bro>,
  cliCountry: string | undefined,
  config: Config
): string | undefined {
  const bro = byId.get(id);
  return bro?.country || cliCountry || config.country;
}

// Protocol filter is global (not per-bro): --protocol/-p flag > bros.json's
// `protocol` field > "http" by default. Pass ANY to disable filtering.
function effectiveProtocol(cliProtocol: string | undefined, config: Config): string {
  return cliProtocol || config.protocol || 'http';
}

async function main(): Promise<void> {
  const { list, url, country: cliCountry, protocol: cliProtocol, help } = parseArgs(
    process.argv.slice(2)
  );

  if (help) {
    printUsage();
    return;
  }

  ensureChromiumInstalled();

  const config = loadConfig();
  const byId = new Map<number, Bro>(config.bros.map((b) => [b.id, b]));

  const requestedIds = list ? parseIdList(list) : [...byId.keys()].sort((a, b) => a - b);
  if (requestedIds.length === 0) {
    printUsage();
    console.error('No bro ids given and bros.json is empty.');
    process.exitCode = 1;
    return;
  }

  // Step 2: check proxies of existing bros; anything missing or dead needs a
  // fresh proxy assignment.
  const needsProxy: number[] = [];
  for (const id of requestedIds) {
    const bro = byId.get(id);
    if (!bro || !bro.proxy) {
      needsProxy.push(id);
      continue;
    }
    process.stdout.write(`Checking proxy for bro ${id} (${bro.proxy.proxy})... `);
    const { ok } = await checkProxy(bro.proxy);
    console.log(ok ? 'OK' : 'DEAD');
    if (!ok) needsProxy.push(id);
  }

  if (needsProxy.length > 0) {
    const protocol = effectiveProtocol(cliProtocol, config);
    const existingProxyUrls = new Set(
      config.bros.map((b) => b.proxy?.proxy).filter((p): p is string => Boolean(p))
    );

    // Group ids by the country that should be searched for them (per-bro
    // country > --country flag > global config country > ANY). Protocol is
    // global for the whole run, so it isn't grouped.
    const groups = new Map<string, number[]>(); // countryKey -> ids[]
    for (const id of needsProxy) {
      const country = effectiveCountry(id, byId, cliCountry, config);
      const key = country || 'ANY';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(id);
    }

    const unresolved: number[] = [];
    for (const [country, ids] of groups) {
      console.log(
        `Searching ${ids.length} proxy(ies) for country=${country}, protocol=${protocol}...`
      );
      const found = await findWorkingProxies(ids.length, country, protocol, existingProxyUrls, {
        onCheck: logProxyCheck,
      });
      const assignedCount = Math.min(found.length, ids.length);
      for (let i = 0; i < assignedCount; i++) {
        assignProxy(config, byId, ids[i], found[i], country);
        existingProxyUrls.add(found[i].proxy);
      }
      if (assignedCount < ids.length) {
        unresolved.push(...ids.slice(assignedCount));
      }
    }

    // Step 3.4: not enough proxies were found automatically — ask one by one.
    for (const id of unresolved) {
      const { inputCountry } = await prompts({
        type: 'text',
        name: 'inputCountry',
        message: `Not enough proxies found. Country for bro ${id}? (Enter = ANY)`,
      });
      const country = (inputCountry || '').trim() || 'ANY';
      const found = await findWorkingProxies(1, country, protocol, existingProxyUrls, {
        onCheck: logProxyCheck,
      });
      if (found.length > 0) {
        assignProxy(config, byId, id, found[0], country);
        existingProxyUrls.add(found[0].proxy);
      } else {
        console.warn(`No proxy found for bro ${id} (country=${country}). It will be skipped.`);
      }
    }

    saveConfig(config);
  }

  // Step 4: open the requested browsers.
  const launches: Promise<void>[] = [];
  for (const id of requestedIds) {
    const bro = byId.get(id);
    if (!bro?.proxy) {
      console.warn(`Skipping bro ${id}: no proxy assigned.`);
      continue;
    }
    const userDataDir = resolveUserDir(getBroUserDir(bro), config);
    launches.push(
      openBrowser({ userDataDir, proxy: bro.proxy, url }).then(
        () => undefined,
        (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`Failed to open bro ${id}: ${message}`);
        }
      )
    );
  }

  await Promise.all(launches);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
