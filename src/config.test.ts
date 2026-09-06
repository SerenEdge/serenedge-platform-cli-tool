import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearCurrentProject,
  configForLogin,
  configLocation,
  currentProject,
  normalizeRepoKey,
  readConfig,
  setCurrentProject,
  writeConfig,
} from "./config.js";

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
  it("leaves a valid parseable config and no temp file behind", () => {
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
});
