import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearCurrentProject,
  configForLogin,
  configLocation,
  currentProject,
  normalizeRepoKey,
  readConfig,
  recordAuthResult,
  setCurrentProject,
  writeConfig,
} from "./config.js";

// The MSYS branch of normalizeRepoKey only runs on win32, and CI is Linux.
const itOnWindows = process.platform === "win32" ? it : it.skip;

// `vi.mock` is hoisted above the imports, so the switch it reads has to be
// hoisted too. Everything passes through to the real fs until a test flips it:
// the only way to prove the atomic write survives a failing rename is to make
// the rename fail. `vi.spyOn` cannot do it - a node builtin's ESM namespace is
// not configurable.
const fsControl = vi.hoisted(() => ({ failRename: false }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: actual,
    renameSync: (...args: Parameters<typeof actual.renameSync>) => {
      if (fsControl.failRename) throw new Error("ENOSPC: no space left on device");
      return actual.renameSync(...args);
    },
  };
});

let home: string;
const originalXdg = process.env.XDG_CONFIG_HOME;

beforeEach(() => {
  // configPath() checks XDG_CONFIG_HOME before APPDATA on every platform, so
  // this redirects config.json into a temp dir on Windows too.
  home = mkdtempSync(join(tmpdir(), "serenedge-cfg-"));
  process.env.XDG_CONFIG_HOME = home;
});

afterEach(() => {
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalXdg;
  rmSync(home, { recursive: true, force: true });
});

describe("normalizeRepoKey", () => {
  it("collapses the spellings of one repo to a single key", () => {
    const a = normalizeRepoKey(process.cwd());
    const b = normalizeRepoKey(`${process.cwd()}/`);
    expect(a).toBe(b);
    expect(a.endsWith("/")).toBe(false);
  });

  it("is idempotent", () => {
    const once = normalizeRepoKey(process.cwd());
    expect(normalizeRepoKey(once)).toBe(once);
  });

  itOnWindows("folds the Git Bash /d/... spelling onto the Windows one", () => {
    // The three ways one repo is spelled on this machine: Claude Code and
    // PowerShell use the first two, the session hook's bash the third.
    const backslash = normalizeRepoKey("D:\\Github\\serenedge-platform");
    expect(backslash).toBe("d:/github/serenedge-platform");
    expect(normalizeRepoKey("d:/github/serenedge-platform")).toBe(backslash);
    expect(normalizeRepoKey("/d/Github/serenedge-platform")).toBe(backslash);
    // Trailing separator and mixed separators fold onto the same key too.
    expect(normalizeRepoKey("/d/Github/serenedge-platform/")).toBe(backslash);
    expect(normalizeRepoKey("D:/Github\\serenedge-platform")).toBe(backslash);
  });

  itOnWindows("keeps a drive root a drive root", () => {
    expect(normalizeRepoKey("/d/")).toBe("d:/");
    expect(normalizeRepoKey("D:\\")).toBe("d:/");
  });
});

describe("projects map", () => {
  it("treats a config with no projects key as empty", () => {
    writeConfig({ url: "http://x", token: "t" });
    expect(readConfig()?.projects).toBeUndefined();
    expect(currentProject(process.cwd())).toBeNull();
  });

  it("round-trips a mapping and finds it from a subdirectory", () => {
    writeConfig({ url: "http://x", token: "t" });
    const repo = mkdtempSync(join(tmpdir(), "serenedge-repo-"));
    mkdirSync(join(repo, ".git"), { recursive: true });
    const nested = join(repo, "packages", "cli");
    mkdirSync(nested, { recursive: true });

    setCurrentProject(nested, "acme");
    // Mapped at the repo root (nearest .git ancestor), not at the cwd.
    expect(readConfig()?.projects).toEqual({ [normalizeRepoKey(repo)]: "acme" });
    // Found by walking up from a subdirectory.
    expect(currentProject(nested)).toBe("acme");
    expect(currentProject(repo)).toBe("acme");

    rmSync(repo, { recursive: true, force: true });
  });

  it("falls back to the cwd when there is no .git ancestor", () => {
    writeConfig({ url: "http://x", token: "t" });
    const plain = mkdtempSync(join(tmpdir(), "serenedge-plain-"));
    setCurrentProject(plain, "solo");
    expect(currentProject(plain)).toBe("solo");
    rmSync(plain, { recursive: true, force: true });
  });

  it("clears the mapping the lookup would have matched", () => {
    writeConfig({ url: "http://x", token: "t" });
    const repo = mkdtempSync(join(tmpdir(), "serenedge-clear-"));
    mkdirSync(join(repo, ".git"), { recursive: true });
    setCurrentProject(repo, "acme");
    expect(clearCurrentProject(repo)).toBe(true);
    expect(currentProject(repo)).toBeNull();
    expect(clearCurrentProject(repo)).toBe(false);
    rmSync(repo, { recursive: true, force: true });
  });

  it("preserves the token and cached user when writing a mapping", () => {
    writeConfig({ url: "http://x", token: "t", user: { name: "A", email: "a@b.c" } });
    const repo = mkdtempSync(join(tmpdir(), "serenedge-keep-"));
    setCurrentProject(repo, "acme");
    const config = readConfig();
    expect(config?.token).toBe("t");
    expect(config?.user).toEqual({ name: "A", email: "a@b.c" });
    rmSync(repo, { recursive: true, force: true });
  });

  it("keeps every repo mapping when a re-login rewrites the config", () => {
    writeConfig({ url: "http://x", token: "old" });
    const repo = mkdtempSync(join(tmpdir(), "serenedge-relogin-"));
    mkdirSync(join(repo, ".git"), { recursive: true });
    setCurrentProject(repo, "acme");

    // What `serenedge login` writes on a second run. Dropping `projects` here
    // would silently unmap every repo on the machine.
    writeConfig(
      configForLogin({ url: "http://x", token: "new", user: { name: "A", email: "a@b.c" } }),
    );

    const config = readConfig();
    expect(config?.token).toBe("new");
    expect(config?.projects).toEqual({ [normalizeRepoKey(repo)]: "acme" });
    expect(currentProject(repo)).toBe("acme");
    rmSync(repo, { recursive: true, force: true });
  });

  it("ignores a corrupt config file instead of throwing", () => {
    mkdirSync(join(home, "serenedge"), { recursive: true });
    writeFileSync(join(home, "serenedge", "config.json"), "{ not json");
    expect(readConfig()).toBeNull();
    expect(currentProject(process.cwd())).toBeNull();
  });
});

describe("atomic writes", () => {
  it("writes the new contents and leaves no temp file behind", () => {
    writeConfig({ url: "http://x", token: "t", projects: { "d:/repo": "acme" } });
    writeConfig({ url: "http://y", token: "t2", projects: { "d:/repo": "other" } });

    const raw = readFileSync(configLocation(), "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(readConfig()).toEqual({
      url: "http://y",
      token: "t2",
      projects: { "d:/repo": "other" },
    });
    // The write goes via a sibling temp file that is renamed over the target,
    // so nothing else may be left in the config directory.
    expect(readdirSync(join(home, "serenedge"))).toEqual(["config.json"]);
  });

  it("keeps the previous config intact when the write fails mid-way", () => {
    writeConfig({ url: "http://x", token: "keep-me", projects: { "d:/repo": "acme" } });
    const before = readFileSync(configLocation(), "utf8");

    // The failure a plain writeFileSync could not survive: the file is
    // already open/being replaced when the operation dies. With an in-place
    // truncating write the token would be gone; with temp-file-then-rename
    // the old file is never touched until the rename succeeds.
    fsControl.failRename = true;
    try {
      expect(() => writeConfig({ url: "http://y", token: "new", projects: {} })).toThrow("ENOSPC");
    } finally {
      fsControl.failRename = false;
    }

    expect(readFileSync(configLocation(), "utf8")).toBe(before);
    expect(readConfig()).toEqual({
      url: "http://x",
      token: "keep-me",
      projects: { "d:/repo": "acme" },
    });
    // The failed write cleans its own temp file up.
    expect(readdirSync(join(home, "serenedge"))).toEqual(["config.json"]);
  });
});

describe("recordAuthResult", () => {
  it("stamps a rejection on a 401 and clears it on a success", () => {
    writeConfig({ url: "http://x", token: "t" });
    expect(readConfig()?.tokenRejectedAt).toBeUndefined();

    recordAuthResult(false);
    const stamped = readConfig()?.tokenRejectedAt;
    expect(typeof stamped).toBe("string");
    expect(Number.isNaN(Date.parse(stamped as string))).toBe(false);

    recordAuthResult(true);
    expect(readConfig()?.tokenRejectedAt).toBeUndefined();
    // Clearing the flag must not disturb anything else.
    expect(readConfig()?.token).toBe("t");
  });

  it("keeps the first rejection timestamp and the repo mappings", () => {
    writeConfig({ url: "http://x", token: "t", projects: { "d:/repo": "acme" } });
    recordAuthResult(false);
    const first = readConfig()?.tokenRejectedAt;
    recordAuthResult(false);
    expect(readConfig()?.tokenRejectedAt).toBe(first);
    expect(readConfig()?.projects).toEqual({ "d:/repo": "acme" });
  });

  it("does nothing when this machine is not signed in", () => {
    expect(() => recordAuthResult(false)).not.toThrow();
    expect(readConfig()).toBeNull();
  });

  it("a fresh login clears a recorded rejection", () => {
    writeConfig({ url: "http://x", token: "old" });
    recordAuthResult(false);
    expect(readConfig()?.tokenRejectedAt).toBeTruthy();

    writeConfig(configForLogin({ url: "http://x", token: "new" }));
    expect(readConfig()?.tokenRejectedAt).toBeUndefined();
    expect(readConfig()?.token).toBe("new");
  });
});
