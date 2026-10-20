import { describe, expect, it } from "vitest";
import {
  buildSteps,
  CI_FAILURE_EXCERPT_MAX_CHARS,
  ciConfigSchema,
  ciOverlap,
  ciReportInputSchema,
  culpritVerdict,
  fingerprintInput,
  matchesPattern,
  parseStepMarker,
} from "./ci-shared.js";

describe("parseStepMarker", () => {
  it("parses a pass marker", () => {
    expect(parseStepMarker("::serenedge-step name=unit tests status=pass::")).toEqual({
      name: "unit tests",
      status: "pass",
    });
    expect(parseStepMarker("  ::serenedge-step name=lint status=start::  ")).toEqual({
      name: "lint",
      status: "start",
    });
    expect(parseStepMarker("just a log line")).toBeNull();
    expect(parseStepMarker("::serenedge-step name=x status=weird::")).toBeNull();
  });
});

describe("buildSteps", () => {
  it("builds timed steps", () => {
    const steps = buildSteps(
      [
        { name: "lint", status: "start", atMs: 0 },
        { name: "lint", status: "pass", atMs: 1000 },
        { name: "test", status: "start", atMs: 1000 },
        { name: "test", status: "fail", atMs: 4000 },
      ],
      { command: "pnpm ci:local", exitCode: 1, startMs: 0, endMs: 4000 },
    );
    expect(steps).toEqual([
      { name: "lint", status: "pass", durationMs: 1000 },
      { name: "test", status: "fail", durationMs: 3000 },
    ]);
  });

  it("no markers gives one step", () => {
    expect(
      buildSteps([], { command: "pnpm ci:local", exitCode: 0, startMs: 0, endMs: 5000 }),
    ).toEqual([{ name: "pnpm ci:local", status: "pass", durationMs: 5000 }]);
  });

  it("closes an unclosed step from the exit code", () => {
    const run = { command: "c", exitCode: 2, startMs: 0, endMs: 900 };
    expect(buildSteps([{ name: "a", status: "start", atMs: 100 }], run)).toEqual([
      { name: "a", status: "fail", durationMs: 800 },
    ]);
  });
});

describe("fingerprintInput", () => {
  it("ignores order, CRLF and backslashes", () => {
    expect(
      fingerprintInput([
        { path: "b", content: "x\r\n" },
        { path: "a\\c", content: "y" },
      ]),
    ).toBe(
      fingerprintInput([
        { path: "a/c", content: "y" },
        { path: "b", content: "x\n" },
      ]),
    );
  });
});

describe("matchesPattern", () => {
  it("handles globs and literals", () => {
    expect(matchesPattern("packages/db/migrations/0084_x.sql", "packages/db/migrations/**")).toBe(
      true,
    );
    expect(matchesPattern("a/b.yml", "*.yml")).toBe(false);
    expect(matchesPattern("b.yml", "*.yml")).toBe(true);
    expect(matchesPattern("pnpm-lock.yaml", "pnpm-lock.yaml")).toBe(true);
    expect(matchesPattern("xpnpm-lock.yaml", "pnpm-lock.yaml")).toBe(false);
    expect(matchesPattern("pnpm-lockXyaml", "pnpm-lock.yaml")).toBe(false);
  });
});

describe("ciOverlap", () => {
  const base = { ciFiles: ["apps/web/**"], sharedFiles: ["pnpm-lock.yaml"] };
  it("is false for disjoint sets", () => {
    expect(ciOverlap({ ...base, devChanged: ["docs/a.md"], taskChanged: ["docs/b.md"] })).toEqual({
      overlap: false,
    });
  });
  it("reports common paths", () => {
    expect(
      ciOverlap({ ...base, devChanged: ["docs/a.md", "z"], taskChanged: ["docs/a.md"] }),
    ).toEqual({ overlap: true, paths: ["docs/a.md"] });
  });
  it("counts shared and ci files in dev", () => {
    expect(ciOverlap({ ...base, devChanged: ["pnpm-lock.yaml"], taskChanged: ["q"] })).toEqual({
      overlap: true,
      paths: ["pnpm-lock.yaml"],
    });
    expect(ciOverlap({ ...base, devChanged: [".serenedge/ci.json"], taskChanged: ["q"] })).toEqual({
      overlap: true,
      paths: [".serenedge/ci.json"],
    });
  });
});

describe("culpritVerdict", () => {
  const t = {
    mergeFails: true,
    parentPasses: true,
    taskHeadFails: false,
    reportPassed: false,
    githubOnly: false,
  };
  it("covers each verdict", () => {
    expect(culpritVerdict({ ...t, githubOnly: true })).toBe("environment");
    expect(culpritVerdict({ ...t, mergeFails: false })).toBe("not_culprit");
    expect(culpritVerdict({ ...t, parentPasses: false })).toBe("not_culprit");
    expect(culpritVerdict({ ...t, taskHeadFails: true, reportPassed: true })).toBe("escape");
    expect(culpritVerdict(t)).toBe("interaction");
  });
});

describe("ciConfigSchema", () => {
  it("defaults timeout and rejects empty command", () => {
    const c = ciConfigSchema.parse({ command: "pnpm ci:local" });
    expect(c.timeoutMinutes).toBe(30);
    expect(c.files).toEqual([]);
    expect(c.sharedFiles).toEqual([]);
    expect(ciConfigSchema.safeParse({ command: "" }).success).toBe(false);
  });
});

describe("ciReportInputSchema", () => {
  const valid = {
    headSha: "a".repeat(40),
    baseSha: "b".repeat(40),
    baseRef: "dev",
    behindBase: false,
    mode: "full",
    configHash: "c".repeat(64),
    passed: true,
    steps: [{ name: "lint", status: "pass", durationMs: 1200 }],
    failureExcerpt: null,
    durationMs: 1200,
    cliVersion: "0.1.0",
    os: "linux",
  };

  it("accepts a complete report", () => {
    expect(ciReportInputSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an unknown mode and a bad step status", () => {
    expect(ciReportInputSchema.safeParse({ ...valid, mode: "slow" }).success).toBe(false);
    expect(
      ciReportInputSchema.safeParse({
        ...valid,
        steps: [{ name: "lint", status: "skipped", durationMs: 1 }],
      }).success,
    ).toBe(false);
  });

  it("rejects a pass whose steps include a failure", () => {
    const res = ciReportInputSchema.safeParse({
      ...valid,
      steps: [
        { name: "lint", status: "pass", durationMs: 1 },
        { name: "unit", status: "fail", durationMs: 1 },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("rejects a pass that carries a failure excerpt", () => {
    expect(ciReportInputSchema.safeParse({ ...valid, failureExcerpt: "boom" }).success).toBe(false);
  });

  it("accepts a failure with a failing step and an excerpt", () => {
    const res = ciReportInputSchema.safeParse({
      ...valid,
      passed: false,
      steps: [{ name: "unit", status: "fail", durationMs: 1 }],
      failureExcerpt: "boom",
    });
    expect(res.success).toBe(true);
  });

  it("caps the failure excerpt at 100k characters", () => {
    const failed = {
      ...valid,
      passed: false,
      steps: [{ name: "unit", status: "fail", durationMs: 1 }],
    };
    const at = (n: number) =>
      ciReportInputSchema.safeParse({ ...failed, failureExcerpt: "x".repeat(n) }).success;
    expect(at(CI_FAILURE_EXCERPT_MAX_CHARS)).toBe(true);
    expect(at(CI_FAILURE_EXCERPT_MAX_CHARS + 1)).toBe(false);
  });

  it("rejects a missing head sha and a negative duration", () => {
    const { headSha: _drop, ...noHead } = valid;
    expect(ciReportInputSchema.safeParse(noHead).success).toBe(false);
    expect(ciReportInputSchema.safeParse({ ...valid, durationMs: -1 }).success).toBe(false);
  });
});
