import { describe, expect, it } from "vitest";
import {
  applyRepoBlock,
  REPO_BLOCK_END,
  REPO_BLOCK_VERSION,
  renderRepoBlock,
  repoBlockStart,
  repoBlockState,
} from "./repo-block.js";

const vars = {
  name: "Acme Shop",
  key: "ACME",
  slug: "acme-shop",
  url: "https://platform.serenedge.com",
};
const block = renderRepoBlock("Project {{name}} ({{key}}) at {{url}}/projects/{{slug}}\n", vars);

function ok(result: ReturnType<typeof applyRepoBlock>) {
  if ("error" in result) throw new Error(result.error);
  return result;
}

describe("renderRepoBlock", () => {
  it("fills every placeholder and wraps the body in markers", () => {
    expect(block).toBe(
      `${repoBlockStart()}\nProject Acme Shop (ACME) at https://platform.serenedge.com/projects/acme-shop\n${REPO_BLOCK_END}`,
    );
  });

  it("normalises CRLF in the template", () => {
    expect(renderRepoBlock("a\r\nb\r\n", vars)).toBe(
      `${repoBlockStart()}\na\nb\n${REPO_BLOCK_END}`,
    );
  });
});

describe("applyRepoBlock", () => {
  it("creates a missing file with just the block", () => {
    expect(ok(applyRepoBlock(null, block))).toEqual({ next: `${block}\n`, action: "create" });
  });

  it("appends to a file without markers, keeping its content", () => {
    const r = ok(applyRepoBlock("# My repo\n\nNotes.\n\n\n", block));
    expect(r.action).toBe("append");
    expect(r.next).toBe(`# My repo\n\nNotes.\n\n${block}\n`);
  });

  it("appends to an empty file without leading blank lines", () => {
    expect(ok(applyRepoBlock("", block)).next).toBe(`${block}\n`);
  });

  it("replaces an existing block in place and leaves the rest alone", () => {
    const old = `# Top\n\n${repoBlockStart()}\nold body\n${REPO_BLOCK_END}\n\n## Bottom\n`;
    const r = ok(applyRepoBlock(old, block));
    expect(r.action).toBe("replace");
    expect(r.next).toBe(`# Top\n\n${block}\n\n## Bottom\n`);
  });

  it("replaces an older template version", () => {
    const old = `${repoBlockStart(0)}\nold\n${REPO_BLOCK_END}\n`;
    expect(ok(applyRepoBlock(old, block)).next).toBe(`${block}\n`);
  });

  it("is idempotent", () => {
    const first = ok(applyRepoBlock("# Repo\n", block)).next;
    expect(ok(applyRepoBlock(first, block))).toEqual({ next: first, action: "unchanged" });
  });

  it("keeps CRLF line endings and a BOM", () => {
    const r = ok(applyRepoBlock("﻿# Repo\r\nText\r\n", block));
    expect(r.next.startsWith("﻿# Repo\r\nText\r\n\r\n")).toBe(true);
    expect(r.next.replace(/\r\n/g, "").includes("\n")).toBe(false);
    expect(ok(applyRepoBlock(r.next, block)).action).toBe("unchanged");
  });

  it("refuses a start marker with no end marker", () => {
    expect(applyRepoBlock(`${repoBlockStart()}\nhalf`, block)).toHaveProperty("error");
  });

  it("refuses an end marker before the start marker", () => {
    expect(applyRepoBlock(`${REPO_BLOCK_END}\n${repoBlockStart()}\n`, block)).toHaveProperty(
      "error",
    );
  });

  it("refuses two blocks, for example a doc quoting the marker", () => {
    const two = `${block}\n\nSee ${repoBlockStart()} above.\n\n${block}\n`;
    expect(applyRepoBlock(two, block)).toHaveProperty("error");
  });
});

describe("repoBlockState", () => {
  it("reports missing, current, outdated and malformed", () => {
    expect(repoBlockState(null)).toBe("missing");
    expect(repoBlockState("# Repo\n")).toBe("missing");
    expect(repoBlockState(`${block}\n`)).toBe("current");
    expect(repoBlockState(`${repoBlockStart(0)}\nx\n${REPO_BLOCK_END}\n`)).toBe("outdated");
    expect(repoBlockState(`${repoBlockStart(1)}\nx\n${REPO_BLOCK_END}\n`)).toBe("outdated");
    expect(repoBlockState(`${repoBlockStart(REPO_BLOCK_VERSION)}\nx\n${REPO_BLOCK_END}\n`)).toBe(
      "current",
    );
    expect(repoBlockState(`${repoBlockStart()}\nno end`)).toBe("malformed");
  });

  it("reads CRLF files", () => {
    expect(repoBlockState(`${block}\n`.replace(/\n/g, "\r\n"))).toBe("current");
  });
});
