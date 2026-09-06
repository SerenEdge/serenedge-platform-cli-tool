import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeConfig } from "./config.js";
import { buildStatus } from "./status.js";

let home: string;
const originalXdg = process.env.XDG_CONFIG_HOME;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "serenedge-status-"));
  process.env.XDG_CONFIG_HOME = home;
});
afterEach(() => {
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalXdg;
  rmSync(home, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe("buildStatus", () => {
  it("reports not_signed_in with no config and never claims a url", async () => {
    const s = await buildStatus({ cwd: process.cwd(), offline: true });
    expect(s).toMatchObject({ installed: true, signedIn: false, state: "not_signed_in" });
    expect(s.url).toBeNull();
  });

  it("offline mode trusts the token and never makes a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    writeConfig({ url: "http://x", token: "t", user: { name: "A", email: "a@b.c" } });
    const s = await buildStatus({ cwd: process.cwd(), offline: true });
    expect(s.signedIn).toBe(true);
    expect(s.user).toEqual({ name: "A", email: "a@b.c" });
    expect(s.state).toBe("no_project");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports token_rejected on a 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    writeConfig({ url: "http://x", token: "t" });
    const s = await buildStatus({ cwd: process.cwd(), offline: false });
    expect(s.state).toBe("token_rejected");
    expect(s.signedIn).toBe(false);
  });

  it("reports unreachable when the request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    writeConfig({ url: "http://x", token: "t" });
    const s = await buildStatus({ cwd: process.cwd(), offline: false });
    expect(s.state).toBe("unreachable");
  });

  it("never includes the token in the payload", async () => {
    writeConfig({ url: "http://x", token: "super-secret-token" });
    const s = await buildStatus({ cwd: process.cwd(), offline: true });
    expect(JSON.stringify(s)).not.toContain("super-secret-token");
  });
});
