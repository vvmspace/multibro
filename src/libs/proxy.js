import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

const PROXY_LIST_URL =
  'https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/all/data.json';
// https: many free "http" proxies use SSL-only ports (443/8443/...) and
// reject plain-HTTP forward-proxy requests outright, which made a plain-HTTP
// check target (e.g. ip-api.com over http://) look instantly DEAD even for
// live proxies. Going through HTTPS (CONNECT tunnel) sidesteps that. Also
// doubles as the source of truth for a proxy's real exit country, since the
// static geolocation field in the free-proxy list is frequently stale or
// "ZZ".
const CHECK_URL = 'https://ipwho.is/';
const CHECK_TIMEOUT = 30000;
const CANDIDATE_CHECK_TIMEOUT = 30000;
const LIST_TIMEOUT = 15000;
const THREADS = 5;
const SPEED_MULTIPLIER = 2;

function buildAgent(proxy) {
  if (proxy.protocol && proxy.protocol.toLowerCase().startsWith('socks')) {
    return new SocksProxyAgent(proxy.proxy);
  }
  return new HttpsProxyAgent(proxy.proxy);
}

// Verifies a proxy is alive, measures its latency (ms), and reports the
// country it actually exits through (via ipwho.is's response, not the
// proxy list's static geolocation field).
export async function checkProxy(proxy, { timeout = CHECK_TIMEOUT } = {}) {
  const agent = buildAgent(proxy);
  const start = Date.now();
  try {
    // axios's `timeout` only bounds the request once a socket exists; a
    // proxy that never completes its TCP/CONNECT handshake can hang far
    // past `timeout`. AbortSignal.timeout forcibly kills it regardless of
    // which stage it's stuck in.
    const { data } = await axios.get(CHECK_URL, {
      httpAgent: agent,
      httpsAgent: agent,
      proxy: false,
      timeout,
      signal: AbortSignal.timeout(timeout),
    });
    if (data?.success !== true) return { ok: false, latency: null, country: null };
    return { ok: true, latency: Date.now() - start, country: data.country_code ?? null };
  } catch {
    return { ok: false, latency: null, country: null };
  }
}

export async function fetchProxyList() {
  const { data } = await axios.get(PROXY_LIST_URL, { timeout: LIST_TIMEOUT });
  return Array.isArray(data) ? data : [];
}

export function filterByCountry(list, country) {
  if (!country || country.toUpperCase() === 'ANY') return list;
  return list.filter(
    (p) => p.geolocation?.country?.toUpperCase() === country.toUpperCase()
  );
}

export function filterByProtocol(list, protocol) {
  if (!protocol || protocol.toUpperCase() === 'ANY') return list;
  return list.filter(
    (p) => p.protocol?.toUpperCase() === protocol.toUpperCase()
  );
}

// Searches the free-proxy list for working proxies of the given country and
// protocol, checking candidates (in THREADS-wide concurrent batches) until
// either `needed * SPEED_MULTIPLIER` working proxies are found or the
// candidate list is exhausted. Country is applied twice: first as a cheap
// static pre-filter on the list's own geolocation field, then again as a
// live check against each candidate's actual ip-api.com exit country — some
// proxies (SOCKS ones in particular) are mistagged in the static list, so
// the live check catches those before they get assigned. Returns the
// working, country-confirmed proxies sorted by ascending latency (fastest
// first).
export async function findWorkingProxies(
  needed,
  country,
  protocol,
  excludeProxyUrls = new Set(),
  { concurrency = THREADS, onProgress, onCheck } = {}
) {
  if (needed <= 0) return [];

  const all = await fetchProxyList();
  const candidates = filterByProtocol(filterByCountry(all, country), protocol).filter(
    (p) => p.proxy && !excludeProxyUrls.has(p.proxy)
  );
  const wantCountry = country && country.toUpperCase() !== 'ANY' ? country.toUpperCase() : null;

  const target = needed * SPEED_MULTIPLIER;
  const found = [];
  let checked = 0;

  for (let i = 0; i < candidates.length && found.length < target; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (p) => {
        const { ok, latency, country: exitCountry } = await checkProxy(p, {
          timeout: CANDIDATE_CHECK_TIMEOUT,
        });
        const matched = ok && (!wantCountry || exitCountry?.toUpperCase() === wantCountry);
        onCheck?.({ proxy: p, ok, latency, exitCountry, matched });
        if (!ok) return null;
        if (wantCountry && exitCountry?.toUpperCase() !== wantCountry) return null;
        return { ...p, latency };
      })
    );
    checked += batch.length;
    for (const r of results) if (r) found.push(r);
    onProgress?.({ checked, total: candidates.length, found: found.length });
  }

  found.sort((a, b) => a.latency - b.latency);
  return found;
}
