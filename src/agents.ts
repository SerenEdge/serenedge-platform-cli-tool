/**
 * The coding agents `serenedge install` can wire up. Claude Code and Codex
 * have their own installers in index.ts (command pack, TOML block). Every other
 * agent only needs the `serenedge mcp` server added to its MCP config file,
 * which is pure JSON work kept here so it is unit-tested without touching disk.
 */

export type JsonAgent = "cursor" | "gemini" | "windsurf" | "opencode" | "copilot";

export const AGENT_NAMES = [
  "claude-code",
  "codex",
  "cursor",
  "gemini",
  "windsurf",
  "opencode",
  "copilot",
] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

/** Alternative spellings people type, mapped to the canonical name. */
const ALIASES: Record<string, AgentName> = {
  claude: "claude-code",
  "gemini-cli": "gemini",
  "copilot-vscode": "copilot",
  vscode: "copilot",
  "github-copilot": "copilot",
};

export function resolveAgent(input: string): AgentName | null {
  const name = input.trim().toLowerCase();
  if ((AGENT_NAMES as readonly string[]).includes(name)) return name as AgentName;
  return ALIASES[name] ?? null;
}

export function isJsonAgent(agent: AgentName): agent is JsonAgent {
  return agent !== "claude-code" && agent !== "codex";
}

type Platform = NodeJS.Platform;

/** The user-level MCP config file each agent reads. */
export function mcpConfigPath(
  agent: JsonAgent,
  home: string,
  platform: Platform,
  appData?: string,
): string {
  const sep = platform === "win32" ? "\\" : "/";
  const join = (...parts: string[]) => parts.join(sep);
  switch (agent) {
    case "cursor":
      return join(home, ".cursor", "mcp.json");
    case "gemini":
      return join(home, ".gemini", "settings.json");
    case "windsurf":
      return join(home, ".codeium", "windsurf", "mcp_config.json");
    case "opencode":
      return join(home, ".config", "opencode", "opencode.json");
    case "copilot": {
      if (platform === "win32") {
        return join(appData ?? join(home, "AppData", "Roaming"), "Code", "User", "mcp.json");
      }
      if (platform === "darwin") {
        return join(home, "Library", "Application Support", "Code", "User", "mcp.json");
      }
      return join(home, ".config", "Code", "User", "mcp.json");
    }
  }
}

/**
 * How the agent is told to launch the server. Windows goes through `cmd /c`
 * because pnpm's global bin is `serenedge.CMD`, which Node cannot spawn bare.
 */
function launch(platform: Platform): { command: string; args: string[] } {
  return platform === "win32"
    ? { command: "cmd", args: ["/c", "serenedge", "mcp"] }
    : { command: "serenedge", args: ["mcp"] };
}

type Json = Record<string, unknown>;

/** The key under which each agent keeps its server map, and the entry shape. */
function entryFor(agent: JsonAgent, platform: Platform): { key: string; entry: Json } {
  const { command, args } = launch(platform);
  switch (agent) {
    case "opencode":
      return {
        key: "mcp",
        entry: { type: "local", command: [command, ...args], enabled: true },
      };
    case "copilot":
      return { key: "servers", entry: { type: "stdio", command, args } };
    default:
      return { key: "mcpServers", entry: { command, args } };
  }
}

export type McpMergeResult =
  | { next: string; action: "created" | "added" | "present" }
  | { error: string };

/**
 * Adds the serenedge server to an agent's config text, leaving every other
 * setting alone. A file that is not plain JSON (comments, trailing commas) is
 * refused so a person pastes the entry instead of us rewriting their file.
 */
export function mergeMcpServer(
  agent: JsonAgent,
  existing: string | null,
  platform: Platform,
): McpMergeResult {
  const { key, entry } = entryFor(agent, platform);
  let root: Json = {};
  if (existing !== null && existing.trim() !== "") {
    try {
      const parsed: unknown = JSON.parse(existing.replace(/^﻿/, ""));
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { error: "is not a JSON object." };
      }
      root = parsed as Json;
    } catch {
      return { error: "is not plain JSON (comments or trailing commas?)." };
    }
  }
  const current = root[key];
  if (current !== undefined && (current === null || typeof current !== "object")) {
    return { error: `has a "${key}" entry that is not an object.` };
  }
  const servers = { ...((current as Json | undefined) ?? {}) };
  if ("serenedge" in servers) {
    return { next: existing ?? "", action: "present" };
  }
  servers.serenedge = entry;
  const next = `${JSON.stringify({ ...root, [key]: servers }, null, 2)}\n`;
  return { next, action: existing === null ? "created" : "added" };
}

/** The entry as a pasteable snippet, for when the file cannot be merged. */
export function mcpSnippet(agent: JsonAgent, platform: Platform): string {
  const { key, entry } = entryFor(agent, platform);
  return JSON.stringify({ [key]: { serenedge: entry } }, null, 2);
}
