import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export type CliConfig = {
  url: string;
  token: string;
  /** Cached at login so `status --offline` can name the user without a request. */
  user?: { name: string | null; email: string } | null;
  /** Absolute normalised repo path -> project slug (A-079). */
  projects?: Record<string, string>;
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
      return {
        url: parsed.url,
        token: parsed.token,
        ...(parsed.user ? { user: parsed.user } : {}),
        ...(parsed.projects ? { projects: parsed.projects } : {}),
      };
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

/**
 * One canonical key per repo. Claude Code, PowerShell and Git Bash spell the
 * same directory three ways (`D:\Github\x`, `d:/github/x`, `/d/Github/x`), and
 * an unnormalised key would map one repo twice. Windows paths are lowercased
 * because the filesystem is case-insensitive; POSIX paths are not.
 */
export function normalizeRepoKey(input: string): string {
  let p = input.trim();
  if (process.platform === "win32") {
    // Git Bash / MSYS spelling: /d/Github/x -> D:/Github/x
    const msys = /^\/([a-zA-Z])\/(.*)$/.exec(p);
    if (msys) p = `${msys[1]}:/${msys[2]}`;
  }
  p = resolve(p);
  if (process.platform === "win32") p = p.replace(/\\/g, "/").toLowerCase();
  // Strip a trailing separator, but never turn "d:/" or "/" into nothing.
  if (p.length > 1 && !/^[a-z]:\/$/.test(p)) p = p.replace(/[/\\]+$/, "");
  return p;
}

/** Walks up the already-normalised key, so it never re-resolves mid-loop. */
function ancestors(key: string): string[] {
  const out: string[] = [];
  let current = key;
  for (;;) {
    out.push(current);
    const cut = current.lastIndexOf("/");
    if (cut <= 0) break;
    const parent = current.slice(0, cut);
    if (parent === current) break;
    current = parent;
  }
  return out;
}

/** Nearest ancestor of `cwd` containing `.git`, or null. */
function repoRoot(cwd: string): string | null {
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Project slug mapped to `cwd` or its nearest mapped ancestor, else null. */
export function currentProject(cwd: string = process.cwd()): string | null {
  const config = readConfig();
  if (!config?.projects) return null;
  for (const key of ancestors(normalizeRepoKey(cwd))) {
    const slug = config.projects[key];
    if (slug) return slug;
  }
  return null;
}

/** Maps the repo root containing `cwd` to `slug`. Returns the key written. */
export function setCurrentProject(cwd: string, slug: string): string {
  const config = readConfig();
  if (!config) throw new Error("Not signed in. Run `serenedge login`.");
  const key = normalizeRepoKey(repoRoot(cwd) ?? cwd);
  writeConfig({ ...config, projects: { ...(config.projects ?? {}), [key]: slug } });
  return key;
}

/** Removes the mapping `currentProject` would have matched. */
export function clearCurrentProject(cwd: string): boolean {
  const config = readConfig();
  if (!config?.projects) return false;
  for (const key of ancestors(normalizeRepoKey(cwd))) {
    if (config.projects[key]) {
      const { [key]: _removed, ...rest } = config.projects;
      writeConfig({ ...config, projects: rest });
      return true;
    }
  }
  return false;
}
