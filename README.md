# multibro

**A Node.js CLI for multi-browser proxy management** — spin up any number of persistent, WebRTC-leak-proof Chromium profiles, each routed through its own automatically-sourced and health-checked proxy, with one command. Built on [Playwright](https://playwright.dev/).

"bro" is short for browser; "bros" is simply more than one. It's silly. It's also exactly what you type fifty times a day if you do this for a living.

```sh
npx multibro 1-10 --country=DE
```

Ten Chromium windows. Ten different German exit IPs. Zero manual proxy shopping. That's the whole pitch.

## Why multibro exists

Anyone running more than one browser profile at a time — for scraping, QA, ad verification, marketplace accounts, affiliate testing — eventually builds the same janky pile of scripts: a config file mapping profiles to proxies, a health-checker that pings each proxy before use, some duct tape around WebRTC so the "proxied" browser doesn't just leak your real IP anyway, and a manual routine for sourcing new proxies when old ones die (they always die).

multibro *is* that pile of scripts, already written, with the duct tape replaced by something sturdier.

## What it's good for

- **Web scraping & data collection** — rotate exit IPs per profile without hand-managing a proxy pool
- **Multi-accounting** — marketplaces, social platforms, ad accounts, each in its own isolated, persistently-logged-in profile
- **Geo-testing & localisation QA** — check what a page, price or ad actually looks like from a given country
- **Ad verification & affiliate/CPA testing** — see the creative, landing page or redirect chain a real visitor in that country would see
- **SEO rank tracking across regions** — query search results as they appear from different countries
- **Browser automation at scale** — a scriptable base for anything built on Playwright that needs many concurrent, distinct identities

## See it work

```sh
npx multibro 1,2,4-6,7                       # open bros 1,2,4,5,6,7 (creating any that don't exist yet)
npx multibro 1-5 https://ifconfig.me         # ...and load a URL in each, to eyeball the exit IPs
npx multibro 1-5 --country=US --protocol=ANY # restrict sourcing to US proxies, any protocol
```

Run it. Watch five real Chromium windows open, each quietly proving it's coming from somewhere else.

## Installation

```sh
git clone git@github.com:vvmspace/multibro.git
cd multibro
npm install          # also builds the TypeScript sources (see `npm run build`)
npx playwright install chromium
```

Requires Node.js 18+.

## Usage

```sh
npx multibro [list] [url] [--country=DE | -c DE] [--protocol=http | -p http]
```

| Argument | Meaning |
| --- | --- |
| `list` | Bro ids to open, e.g. `1,2,4-6,7`. Omit it to open every bro already in `bros.json`. Any id not yet in the ledger is created on the spot. |
| `url` | A page to load in each browser. Optional. |
| `--country`, `-c` | ISO country code to restrict proxy sourcing to. Defaults to whatever `bros.json` specifies, or `ANY`. |
| `--protocol`, `-p` | Proxy protocol to restrict sourcing to (`http`, `socks4`, `socks5`). Defaults to `http`; pass `ANY` to disable filtering. |

## Configuration: `bros.json`

Created and maintained automatically, but entirely hand-editable should the fancy take you:

```jsonc
{
  "bros": [
    {
      "id": 1,
      "country": "DE",        // optional; overrides the global country for this bro
      "user_dir": "bro1",     // optional; defaults to `bro${id}`
      "proxy": {
        "proxy": "socks5://69.61.200.104:36181",
        "protocol": "socks5",
        "ip": "69.61.200.104",
        "port": 36181,
        "https": false,
        "anonymity": "transparent",
        "score": 1,
        "geolocation": { "country": "ZZ", "city": "Unknown" }
      }
    }
  ],
  "home_dir": "tmp",   // optional; base directory for relative user_dirs and bros.json itself
  "country": "ANY",    // optional global country filter
  "protocol": "ANY"    // optional global protocol filter
}
```

### `home_dir` and profile locations

If `HOME_DIR` is set in `.env`, or `home_dir` is set in `bros.json`, a relative `user_dir` resolves to `${home_dir}/${user_dir}`; otherwise it resolves relative to wherever you happen to be running the command. The same rule governs where `bros.json` itself lives: `${HOME_DIR}/bros.json` if `HOME_DIR` is set, `./bros.json` otherwise.

Copy `.env.example` to `.env` to set `HOME_DIR`:

```sh
cp .env.example .env
```

## How proxy sourcing actually works

No paid proxy subscription required to get started: when a bro needs a proxy, multibro pulls the [proxifly free proxy list](https://github.com/proxifly/free-proxy-list) and checks candidates five at a time, with a generous timeout per attempt, until it has gathered `SPEED_MULTIPLIER × (proxies still needed)` working candidates of the right protocol and country — or exhausts the list, whichever comes first. The fastest survivors are assigned; the rest are left for another day.

Country matching is applied twice, for the avoidance of doubt: once cheaply against the list's own (occasionally optimistic) geolocation field, and once for real, by routing a request through the candidate proxy and asking [ipwho.is](https://ipwho.is/) where it actually emerged. A proxy claiming to be German that turns out to surface in the Netherlands is shown the door — free proxy lists lie about this more often than you'd like.

Should the automatic search come up short, multibro asks, one bro at a time, which country to try next — press Enter for "any will do".

Naturally, nothing stops you plugging in your own paid/residential proxies by hand-editing `bros.json` — multibro will happily health-check and reuse whatever's already there before it goes shopping for more.

## Privacy: no WebRTC leaks

Every browser launches with WebRTC comprehensively disabled — no `RTCPeerConnection`, no `getUserMedia`, no STUN candidates sneaking your real IP address out from behind the proxy. Chromium is also flagged to route any WebRTC traffic that somehow survives exclusively through the proxied connection. A proxy that leaks your real IP through WebRTC isn't a proxy, it's a liability — multibro treats that as a bug worth closing, not a footnote.

Window size is randomised to between 85% and 95% of the smaller of your actual screen and a 13" MacBook Air's resolution, so as not to advertise itself with suspiciously round numbers.

## Project layout

```
index.ts             entry point
src/
  libs/
    cli.ts            argv parsing
    config.ts          bros.json + user_dir resolution
    proxy.ts            proxy checking and sourcing
    browser.ts           Chromium launch, WebRTC lockdown, window sizing
    screen.ts             primary screen resolution detection
    types.ts               shared types
dist/                 compiled output (npm run build)
tmp/                  default home_dir (browser profiles, bros.json)
```

Written in strict TypeScript. `npm run build` compiles; `npm run dev` runs straight off the `.ts` sources via `tsx`; `npm run typecheck` checks types without emitting.

## Contributing

Issues and pull requests welcome at [github.com/vvmspace/multibro](https://github.com/vvmspace/multibro). If you've got a proxy source, a detection vector, or a use case multibro doesn't cover yet, that's exactly the sort of thing worth opening a ticket about.
