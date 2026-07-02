import fs from 'node:fs';
import path from 'node:path';
import type { Bro, Config } from './types.js';

// bros.json's own location can only depend on the .env HOME_DIR var, not on
// the `home_dir` field inside bros.json itself — that field can't be known
// until the file is already loaded, which is exactly what we're resolving.
function getConfigPath(): string {
  const homeDir = process.env.HOME_DIR;
  if (homeDir) {
    return path.resolve(process.cwd(), homeDir, 'bros.json');
  }
  return path.resolve(process.cwd(), 'bros.json');
}

export function loadConfig(): Config {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return { bros: [] };
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw) as Config;
  if (!Array.isArray(parsed.bros)) parsed.bros = [];
  return parsed;
}

export function saveConfig(config: Config): void {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  config.bros.sort((a, b) => a.id - b.id);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

// Resolves the persistent user-data-dir for a bro's browser profile.
// If HOME_DIR (.env) or home_dir (bros.json) is set and user_dir is relative,
// it's resolved as `${home_dir}/${user_dir}`; otherwise `${user_dir}` is
// resolved relative to the current working directory.
export function resolveUserDir(userDir: string, config: Config): string {
  if (path.isAbsolute(userDir)) return userDir;

  const homeDir = process.env.HOME_DIR || config.home_dir;
  if (homeDir) {
    return path.resolve(process.cwd(), homeDir, userDir);
  }
  return path.resolve(process.cwd(), userDir);
}

export function getBroUserDir(bro: Bro): string {
  return bro.user_dir || `bro${bro.id}`;
}
