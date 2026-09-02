import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type CliConfig = {
  url: string;
  token: string;
};

function configPath(): string {
  const base =
    process.env.XDG_CONFIG_HOME ??
    (process.platform === "win32"
      ? (process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"))
      : join(homedir(), ".config"));
  return join(base, "serenedge", "config.json");
}

export function readConfig(): CliConfig | null {
  try {
    const raw = readFileSync(configPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<CliConfig>;
    if (typeof parsed.url === "string" && typeof parsed.token === "string") {
      return { url: parsed.url, token: parsed.token };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeConfig(config: CliConfig): void {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // chmod is a no-op / may fail on Windows; the mode on write is best effort.
  }
}

export function clearConfig(): boolean {
  try {
    rmSync(configPath());
    return true;
  } catch {
    return false;
  }
}

export function configLocation(): string {
  return configPath();
}

/** The directory holding config.json (used for the installed command packs). */
export function configDir(): string {
  return dirname(configPath());
}
