/**
 * The SerenEdge instructions block inside a client repo's CLAUDE.md and
 * AGENTS.md (A-200). Pure string work so every case is unit-tested without
 * touching disk; `serenedge repo init` does the file IO.
 */

export const REPO_BLOCK_VERSION = 3;
export const REPO_BLOCK_END = "<!-- serenedge:end -->";
const START_RE = /<!-- serenedge:start v(\d+) -->/g;

export type RepoBlockVars = { name: string; key: string; slug: string; url: string };
export type RepoBlockAction = "create" | "append" | "replace" | "unchanged";
export type RepoBlockState = "missing" | "current" | "outdated" | "malformed";

export function repoBlockStart(version: number = REPO_BLOCK_VERSION): string {
  return `<!-- serenedge:start v${version} -->`;
}

/** Fills `{{name}}`, `{{key}}`, `{{slug}}` and `{{url}}` and wraps the result in markers. */
export function renderRepoBlock(template: string, vars: RepoBlockVars): string {
  const body = template
    .replace(/\r\n/g, "\n")
    .replace(/\{\{(name|key|slug|url)\}\}/g, (_, k: keyof RepoBlockVars) => vars[k])
    .trim();
  return `${repoBlockStart()}\n${body}\n${REPO_BLOCK_END}`;
}

type Located = { start: number; end: number; version: number } | "none" | "malformed";

/** Finds the one block in LF-normalised text, or says why there is not exactly one. */
function locate(text: string): Located {
  const starts = [...text.matchAll(START_RE)];
  const endCount = text.split(REPO_BLOCK_END).length - 1;
  if (starts.length === 0 && endCount === 0) return "none";
  const [first] = starts;
  if (!first || starts.length !== 1 || endCount !== 1) return "malformed";
  const endIdx = text.indexOf(REPO_BLOCK_END);
  if (endIdx < first.index) return "malformed";
  return { start: first.index, end: endIdx + REPO_BLOCK_END.length, version: Number(first[1]) };
}

/**
 * Puts `block` into a file's text. A missing file gets just the block, a file
 * without markers gets it appended, a file with one block gets it replaced in
 * place. Anything else is refused so a person fixes it by hand. The file's
 * BOM and line endings are kept.
 */
export function applyRepoBlock(
  existing: string | null,
  block: string,
): { next: string; action: RepoBlockAction } | { error: string } {
  if (existing === null) return { next: `${block}\n`, action: "create" };
  const bom = existing.startsWith("﻿") ? "﻿" : "";
  const eol = existing.includes("\r\n") ? "\r\n" : "\n";
  const text = existing.slice(bom.length).replace(/\r\n/g, "\n");
  const found = locate(text);
  if (found === "malformed") {
    return {
      error:
        "has a broken SerenEdge block: the start and end markers do not pair up. Fix or remove them by hand, then run this again.",
    };
  }
  let next: string;
  let action: RepoBlockAction;
  if (found === "none") {
    const kept = text.replace(/\s+$/, "");
    next = kept.length === 0 ? `${block}\n` : `${kept}\n\n${block}\n`;
    action = "append";
  } else {
    next = text.slice(0, found.start) + block + text.slice(found.end);
    action = next === text ? "unchanged" : "replace";
  }
  return { next: bom + next.replace(/\n/g, eol), action };
}

/** Whether a file carries the current block, an older one, none, or a broken one. */
export function repoBlockState(existing: string | null): RepoBlockState {
  if (existing === null) return "missing";
  const found = locate(existing.replace(/\r\n/g, "\n"));
  if (found === "none") return "missing";
  if (found === "malformed") return "malformed";
  return found.version >= REPO_BLOCK_VERSION ? "current" : "outdated";
}
