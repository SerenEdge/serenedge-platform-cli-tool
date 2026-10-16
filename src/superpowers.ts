import { spawnSync } from "node:child_process";

// Superpowers is required by the SerenEdge commands (A-201). Detection reads
// `claude plugin list --json`; anything unexpected is "unknown", never a crash,
// so a Codex-only machine or an older Claude Code still gets a status.

export type SuperpowersState = "installed" | "missing" | "unknown";

export const SUPERPOWERS_INSTALL = "claude plugin install superpowers@claude-plugins-official";

export function parseSuperpowers(json: string | null): SuperpowersState {
  if (json === null) return "unknown";
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return "unknown";
  }
  if (!Array.isArray(parsed)) return "unknown";
  const found = parsed.some(
    (p) =>
      typeof p === "object" &&
      p !== null &&
      typeof (p as { id?: unknown }).id === "string" &&
      (p as { id: string }).id.startsWith("superpowers@") &&
      (p as { enabled?: unknown }).enabled !== false,
  );
  return found ? "installed" : "missing";
}

function runClaudePluginList(): string | null {
  const r = spawnSync("claude", ["plugin", "list", "--json"], {
    encoding: "utf8",
    timeout: 15_000,
  });
  if (r.error || r.status !== 0) return null;
  return r.stdout;
}

export function detectSuperpowers(
  run: () => string | null = runClaudePluginList,
): SuperpowersState {
  return parseSuperpowers(run());
}
