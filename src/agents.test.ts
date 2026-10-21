import { describe, expect, it } from "vitest";
import { mcpConfigPath, mcpSnippet, mergeMcpServer, resolveAgent } from "./agents.js";

describe("resolveAgent", () => {
  it("accepts canonical names and aliases", () => {
    expect(resolveAgent("cursor")).toBe("cursor");
    expect(resolveAgent(" Gemini-CLI ")).toBe("gemini");
    expect(resolveAgent("vscode")).toBe("copilot");
    expect(resolveAgent("claude")).toBe("claude-code");
  });
  it("rejects unknown agents", () => {
    expect(resolveAgent("emacs")).toBeNull();
  });
});

describe("mcpConfigPath", () => {
  it("uses the per-OS VS Code user folder for copilot", () => {
    expect(mcpConfigPath("copilot", "C:\\u", "win32", "C:\\u\\AppData\\Roaming")).toBe(
      "C:\\u\\AppData\\Roaming\\Code\\User\\mcp.json",
    );
    expect(mcpConfigPath("copilot", "/Users/a", "darwin")).toBe(
      "/Users/a/Library/Application Support/Code/User/mcp.json",
    );
    expect(mcpConfigPath("copilot", "/home/a", "linux")).toBe("/home/a/.config/Code/User/mcp.json");
  });
  it("points the others at their home config", () => {
    expect(mcpConfigPath("cursor", "/h", "linux")).toBe("/h/.cursor/mcp.json");
    expect(mcpConfigPath("gemini", "/h", "linux")).toBe("/h/.gemini/settings.json");
    expect(mcpConfigPath("windsurf", "/h", "linux")).toBe("/h/.codeium/windsurf/mcp_config.json");
    expect(mcpConfigPath("opencode", "/h", "linux")).toBe("/h/.config/opencode/opencode.json");
  });
});

describe("mergeMcpServer", () => {
  it("creates a file for a missing config", () => {
    const r = mergeMcpServer("cursor", null, "linux");
    if ("error" in r) throw new Error(r.error);
    expect(r.action).toBe("created");
    expect(JSON.parse(r.next)).toEqual({
      mcpServers: { serenedge: { command: "serenedge", args: ["mcp"] } },
    });
  });
  it("keeps other settings and servers", () => {
    const existing = JSON.stringify({ theme: "dark", mcpServers: { other: { command: "x" } } });
    const r = mergeMcpServer("gemini", existing, "linux");
    if ("error" in r) throw new Error(r.error);
    const out = JSON.parse(r.next);
    expect(out.theme).toBe("dark");
    expect(Object.keys(out.mcpServers)).toEqual(["other", "serenedge"]);
  });
  it("is a no-op when serenedge is already there", () => {
    const existing = JSON.stringify({ mcpServers: { serenedge: { command: "mine" } } });
    const r = mergeMcpServer("windsurf", existing, "linux");
    expect(r).toEqual({ next: existing, action: "present" });
  });
  it("uses the opencode and copilot shapes", () => {
    const oc = mergeMcpServer("opencode", null, "linux");
    const cp = mergeMcpServer("copilot", null, "linux");
    if ("error" in oc || "error" in cp) throw new Error("unexpected error");
    expect(JSON.parse(oc.next).mcp.serenedge).toEqual({
      type: "local",
      command: ["serenedge", "mcp"],
      enabled: true,
    });
    expect(JSON.parse(cp.next).servers.serenedge).toEqual({
      type: "stdio",
      command: "serenedge",
      args: ["mcp"],
    });
  });
  it("wraps the launch in cmd /c on Windows", () => {
    const r = mergeMcpServer("cursor", null, "win32");
    if ("error" in r) throw new Error(r.error);
    expect(JSON.parse(r.next).mcpServers.serenedge).toEqual({
      command: "cmd",
      args: ["/c", "serenedge", "mcp"],
    });
  });
  it("refuses a file it cannot parse or that has the wrong shape", () => {
    expect(mergeMcpServer("copilot", '{ // note\n "servers": {} }', "linux")).toHaveProperty(
      "error",
    );
    expect(mergeMcpServer("cursor", "[]", "linux")).toHaveProperty("error");
    expect(mergeMcpServer("cursor", '{"mcpServers": 3}', "linux")).toHaveProperty("error");
  });
  it("treats an empty file as new content", () => {
    const r = mergeMcpServer("cursor", "  \n", "linux");
    expect(r).toHaveProperty("action", "added");
  });
});

describe("mcpSnippet", () => {
  it("prints the entry under the agent's key", () => {
    expect(JSON.parse(mcpSnippet("opencode", "linux")).mcp.serenedge.type).toBe("local");
  });
});
