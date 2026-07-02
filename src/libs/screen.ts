import { execFileSync } from 'node:child_process';

export interface ScreenSize {
  width: number;
  height: number;
}

const FALLBACK_SIZE: ScreenSize = { width: 1920, height: 1080 };

let cached: ScreenSize | undefined;

function detect(): ScreenSize {
  try {
    if (process.platform === 'darwin') {
      const out = execFileSync('osascript', [
        '-e',
        'tell application "Finder" to get bounds of window of desktop',
      ])
        .toString()
        .trim();
      const [x0, y0, x1, y1] = out.split(',').map((s) => Number(s.trim()));
      if ([x0, y0, x1, y1].every(Number.isFinite)) {
        return { width: x1 - x0, height: y1 - y0 };
      }
    } else if (process.platform === 'win32') {
      const out = execFileSync('powershell', [
        '-NoProfile',
        '-Command',
        "Add-Type -AssemblyName System.Windows.Forms; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; \"$($b.Width)x$($b.Height)\"",
      ])
        .toString()
        .trim();
      const [w, h] = out.split('x').map(Number);
      if (w && h) return { width: w, height: h };
    } else {
      const out = execFileSync('sh', [
        '-c',
        "xrandr --current | grep '\\*' | awk '{print $1}' | head -n1",
      ])
        .toString()
        .trim();
      const [w, h] = out.split('x').map(Number);
      if (w && h) return { width: w, height: h };
    }
  } catch {
    // fall through to default below
  }
  return FALLBACK_SIZE;
}

// Detects the primary screen resolution; memoized since it can't change
// mid-run. Falls back to a sane default if detection fails (headless CI,
// missing xrandr, etc.).
export function getScreenSize(): ScreenSize {
  if (!cached) cached = detect();
  return cached;
}
