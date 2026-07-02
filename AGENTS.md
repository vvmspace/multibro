Check AGENTS.local.md as actual version if exists.

Concept:
A console tool for managing browser-proxy bundles.

bro = browser
bros = browsers

Invocation examples:
npx multibro [list] [url] [--country=US/-c US] [--protocol=ANY/-p ANY]
npx multibro 1,2,4-6,7
npx multibro 1-5 https://ifconfig.me

Opens browsers with ids 1,2,4-6,7, creating any that are missing.

Creating/opening a browser:
1. Opens the bros.json config, shaped like

```
{
    "bros": [
        "id": 1,
        "country": "US", // optional
        "user_dir: "bro1", // `bro${id}` by default
        "proxy": {
            "proxy": "socks5://69.61.200.104:36181",
            "protocol": "socks5",
            "ip": "69.61.200.104",
            "port": 36181,
            "https": false,
            "anonymity": "transparent",
            "score": 1,
            "geolocation": {
            "country": "ZZ",
            "city": "Unknown"
            }
        }
    ],
    "home_dir": "tmp", // optional
    "country": "US", // optional, don't filter by country if ANY
    "protocol": "ANY" //optional, don't filter by protocol if ANY
}
```

2. Checks the proxies of existing bros
3. If one of the proxies isn't working, or a bro needs to be added, then:
3.1. Pulls https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/all/data.json
3.2. Checks proxies (5 threads, 30-second timeouts) via https://ipwho.is/, ones not already in the config, measuring speed, until it finds [NUMBER_OF_MISSING_PROXIES] * [SPEED_MULTIPLIER=2] proxies of the right country in the response (starting with the ones explicitly marked as such in the list) (if specified in bros.json or the --country/-c parameter) and protocol (if not ANY), or reaches the end of the list.
3.3. If enough proxies are found, assigns the fastest ones and updates bros.json
3.4. If there aren't enough proxies, assigns as many as there are, then starts asking one by one for a country to try; if you don't enter one and just press Enter, it's treated as ANY
4. Opens [list] browsers, with [url] if given, connected to the proxies from the config

Proxy checking:
- THREADS=5 threads via Promise.all(...) chunks
- TIMEOUT=30

Opening a page:
- window size: random(85, 95)% of min(MACBOOK AIR 13, SCREEN SIZE)

+ we cut off WebRTC and every possible IP leak

Approximate file structure and main components
skills
src
- libs
-- proxy.js
-- browser.js
tmp
index.js
package.json

user_dir, bros.json and HOME_DIR
if HOME_DIR is set in .env or home_dir in the config, and user_dir is relative, then it's treated as `${home_dir}/${user_dir}`; otherwise `${user_dir}` relative to the run directory
likewise for bros.json: `${home_dir}/bros.json` or `bros.json`
