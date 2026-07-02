import { chromium, type BrowserContext } from 'playwright';
import { getScreenSize } from './screen.js';
import type { ProxyEntry } from './types.js';

// Reference viewport for a 13" MacBook Air (default logical/CSS resolution).
const MACBOOK_AIR_13 = { width: 1440, height: 900 };

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Window size: random(85, 95)% of min(MacBook Air 13, actual screen size),
// so windows look plausibly human-sized and don't clip off-screen.
function computeWindowSize() {
  const screen = getScreenSize();
  const base = {
    width: Math.min(MACBOOK_AIR_13.width, screen.width),
    height: Math.min(MACBOOK_AIR_13.height, screen.height),
  };
  const pct = randomInt(85, 95) / 100;
  return {
    width: Math.round(base.width * pct),
    height: Math.round(base.height * pct),
  };
}

// Runs before any page script, on every document in the persistent context.
// Kills WebRTC entirely so a peer connection can never leak the real local
// or public IP behind the proxy (via STUN/ICE candidates).
const BLOCK_WEBRTC_SCRIPT = `(() => {
  const kill = (obj, prop) => {
    if (!obj || !(prop in obj)) return;
    try {
      Object.defineProperty(obj, prop, {
        get: () => undefined,
        set: () => {},
        configurable: true,
      });
    } catch {}
  };

  kill(window, 'RTCPeerConnection');
  kill(window, 'webkitRTCPeerConnection');
  kill(window, 'mozRTCPeerConnection');
  kill(window, 'RTCDataChannel');
  kill(window, 'RTCIceGatherer');
  kill(navigator, 'getUserMedia');
  kill(navigator, 'webkitGetUserMedia');
  kill(navigator, 'mozGetUserMedia');

  if (navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new Error('WebRTC is disabled'));
    navigator.mediaDevices.getDisplayMedia = () =>
      Promise.reject(new Error('WebRTC is disabled'));
    navigator.mediaDevices.enumerateDevices = () => Promise.resolve([]);
  }
})();`;

// Chromium flag: even if the JS override above were ever bypassed (e.g. by
// an extension), force any surviving WebRTC traffic to route only through
// the proxied connection instead of leaking a direct/non-proxied route.
const WEBRTC_LEAK_ARGS = [
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--webrtc-ip-handling-policy=disable_non_proxied_udp',
];

export interface OpenBrowserOptions {
  userDataDir: string;
  proxy?: ProxyEntry;
  url?: string;
  headless?: boolean;
}

export async function openBrowser({
  userDataDir,
  proxy,
  url,
  headless = false,
}: OpenBrowserOptions): Promise<BrowserContext> {
  const { width, height } = computeWindowSize();

  const launchOptions: Parameters<typeof chromium.launchPersistentContext>[1] = {
    headless,
    viewport: null,
    args: [...WEBRTC_LEAK_ARGS, `--window-size=${width},${height}`],
  };

  if (proxy?.proxy) {
    launchOptions.proxy = { server: proxy.proxy };
  }

  const context = await chromium.launchPersistentContext(userDataDir, launchOptions);
  await context.addInitScript(BLOCK_WEBRTC_SCRIPT);

  const page = context.pages()[0] ?? (await context.newPage());
  if (url) {
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Failed to open ${url}: ${message}`);
    });
  }

  return context;
}
