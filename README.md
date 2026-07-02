# multibro

A console tool for the discerning operator who requires several browsers, each behind its own proxy, opened without further ado. "bro" is short for browser; "bros" is simply more than one.

## What it does

Give `multibro` a list of numbers and, optionally, a URL, and it shall:

1. Read (or create) `bros.json`, a small ledger of your browsers and the proxy each is assigned.
2. Verify that existing proxies still answer. Any that have expired are quietly retired.
3. For every browser lacking a working proxy, fetch a fresh batch of candidates, check them for life, speed and true country of origin, and assign the finest available.
4. Launch each requested browser as its own persistent Chromium profile, proxied accordingly, with WebRTC leaks firmly nailed shut.

## Installation

```sh
npm install
```

Requires Node.js 18 or later, and a working Chromium (installed automatically by Playwright on first run if absent):

```sh
npx playwright install chromium
```

## Usage

```sh
npx multibro [list] [url] [--country=DE | -c DE] [--protocol=http | -p http]
```

- `list` — which bros to open, e.g. `1,2,4-6,7`. Omit it and every bro already in `bros.json` is opened. Any id not yet in the ledger is created on the spot.
- `url` — a page to open in each browser, entirely optional.
- `--country` / `-c` — restrict proxy sourcing to a given country (ISO code). Defaults to whatever `bros.json` specifies, or `ANY`.
- `--protocol` / `-p` — restrict proxy sourcing to a given protocol (`http`, `socks4`, `socks5`). Defaults to `http`; pass `ANY` to disable filtering.

### Examples

```sh
npx multibro 1,2,4-6,7
npx multibro 1-5 https://ifconfig.me
npx multibro 1-5 --country=US --protocol=ANY
```

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

## Proxy sourcing

When a bro needs a proxy, `multibro` pulls the [proxifly free proxy list](https://github.com/proxifly/free-proxy-list) and checks candidates five at a time, with a generous timeout per attempt, until it has gathered `SPEED_MULTIPLIER × (proxies still needed)` working candidates of the right protocol and country — or exhausts the list, whichever comes first. The fastest are assigned; the rest are left for another day.

Country matching is applied twice, for the avoidance of doubt: once cheaply against the list's own (occasionally optimistic) geolocation field, and once for real, by routing a request through the candidate proxy and asking [ipwho.is](https://ipwho.is/) where it actually emerged. A proxy claiming to be Russian that turns out to surface in the Netherlands is shown the door.

Should the automatic search come up short, `multibro` will ask, one bro at a time, which country to try next — press Enter for "any will do".

## Privacy

Every browser launches with WebRTC comprehensively disabled — no `RTCPeerConnection`, no `getUserMedia`, no STUN candidates sneaking your real IP address out from behind the proxy. Chromium is also flagged to route any WebRTC traffic that somehow survives exclusively through the proxied connection.

Window size is randomised to between 85% and 95% of the smaller of your actual screen and a 13" MacBook Air's resolution, so as not to advertise itself with suspiciously round numbers.

## Project layout

```
index.js            entry point
src/
  libs/
    cli.js           argv parsing
    config.js        bros.json + user_dir resolution
    proxy.js         proxy checking and sourcing
    browser.js       Chromium launch, WebRTC lockdown, window sizing
    screen.js        primary screen resolution detection
tmp/                 default home_dir (browser profiles, bros.json)
```
