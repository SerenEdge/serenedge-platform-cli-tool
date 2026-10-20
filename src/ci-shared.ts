import { z } from "zod";

// Pure rules for the local CI gate. No node imports: this barrel is browser
// and Edge safe. Callers hash `fingerprintInput` with SHA-256 themselves.
// Local copy of packages/shared/src/ci.ts in the platform repo (this repo
// has no @serenedge/shared). Keep the two in step.

export const CI_CONFIG_PATH = ".serenedge/ci.json";

/** Longest `failureExcerpt` a report may carry, in characters. */
export const CI_FAILURE_EXCERPT_MAX_CHARS = 100_000;

export const ciConfigSchema = z.object({
  command: z.string().min(1),
  quickCommand: z.string().optional(),
  files: z.array(z.string()).default([]),
  sharedFiles: z.array(z.string()).default([]),
  timeoutMinutes: z.number().int().min(1).max(240).default(30),
});
export type CiConfig = z.infer<typeof ciConfigSchema>;

export type CiStepStatus = "pass" | "fail";
export type CiStep = { name: string; status: CiStepStatus; durationMs: number };

export const CI_REPORT_MODES = ["full", "quick"] as const;
export type CiReportMode = (typeof CI_REPORT_MODES)[number];

/** Body of `POST /api/agent/tasks/<key>/ci-report`, sent only by `serenedge ci`. */
export const ciReportInputSchema = z
  .object({
    headSha: z.string().min(1).max(64),
    baseSha: z.string().min(1).max(64),
    baseRef: z.string().min(1).max(255),
    behindBase: z.boolean(),
    mode: z.enum(CI_REPORT_MODES),
    configHash: z.string().min(1).max(128),
    passed: z.boolean(),
    steps: z
      .array(
        z.object({
          name: z.string().min(1).max(500),
          status: z.enum(["pass", "fail"]),
          durationMs: z.number().int().min(0),
        }),
      )
      .max(500),
    // The server keeps 200 lines; this bounds their length too.
    failureExcerpt: z.string().max(CI_FAILURE_EXCERPT_MAX_CHARS).nullable(),
    durationMs: z.number().int().min(0),
    cliVersion: z.string().min(1).max(64),
    os: z.string().min(1).max(64),
  })
  // A pass must be consistent: every step passed and there is no excerpt.
  .superRefine((r, ctx) => {
    if (!r.passed) return;
    if (r.steps.some((s) => s.status !== "pass")) {
      ctx.addIssue({
        code: "custom",
        path: ["steps"],
        message: "A passing report cannot contain a failed step",
      });
    }
    if (r.failureExcerpt !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["failureExcerpt"],
        message: "A passing report has no failure excerpt",
      });
    }
  });
export type CiReportInput = z.infer<typeof ciReportInputSchema>;

type MarkerStatus = "start" | "pass" | "fail";

const MARKER = /^::serenedge-step name=(.+?) status=(start|pass|fail)::$/;

export function parseStepMarker(line: string): { name: string; status: MarkerStatus } | null {
  const m = MARKER.exec(line.trim());
  if (!m) return null;
  return { name: m[1] as string, status: m[2] as MarkerStatus };
}

export function buildSteps(
  events: { name: string; status: MarkerStatus; atMs: number }[],
  run: { command: string; exitCode: number; startMs: number; endMs: number },
): CiStep[] {
  const runStatus: CiStepStatus = run.exitCode === 0 ? "pass" : "fail";
  if (events.length === 0) {
    return [{ name: run.command, status: runStatus, durationMs: run.endMs - run.startMs }];
  }
  const steps: CiStep[] = [];
  const open = new Map<string, number>();
  for (const e of events) {
    if (e.status === "start") {
      open.set(e.name, e.atMs);
      continue;
    }
    const started = open.get(e.name);
    open.delete(e.name);
    steps.push({
      name: e.name,
      status: e.status,
      durationMs: e.atMs - (started ?? e.atMs),
    });
  }
  for (const [name, started] of open) {
    steps.push({ name, status: runStatus, durationMs: run.endMs - started });
  }
  return steps;
}

function normPath(p: string): string {
  return p.replace(/\\/g, "/");
}

export function fingerprintInput(files: { path: string; content: string }[]): string {
  return files
    .map((f) => ({ path: normPath(f.path), content: f.content.replace(/\r\n/g, "\n") }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((f) => `${f.path}\n${f.content}\n\0`)
    .join("");
}

export function matchesPattern(path: string, pattern: string): boolean {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i] as string;
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        re += ".*";
        i++;
      } else {
        re += "[^/]*";
      }
    } else {
      re += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`).test(normPath(path));
}

export function ciOverlap(input: {
  devChanged: string[];
  taskChanged: string[];
  ciFiles: string[];
  sharedFiles: string[];
}): { overlap: false } | { overlap: true; paths: string[] } {
  const task = new Set(input.taskChanged);
  const patterns = [...input.ciFiles, ...input.sharedFiles, CI_CONFIG_PATH];
  const hits = new Set<string>();
  for (const p of input.devChanged) {
    if (task.has(p) || patterns.some((pat) => matchesPattern(p, pat))) hits.add(p);
  }
  if (hits.size === 0) return { overlap: false };
  return { overlap: true, paths: [...hits].sort() };
}

export type CulpritVerdict = "escape" | "interaction" | "environment" | "not_culprit";

export function culpritVerdict(i: {
  mergeFails: boolean;
  parentPasses: boolean;
  taskHeadFails: boolean;
  reportPassed: boolean;
  githubOnly: boolean;
}): CulpritVerdict {
  if (i.githubOnly) return "environment";
  if (!(i.mergeFails && i.parentPasses)) return "not_culprit";
  if (i.taskHeadFails && i.reportPassed) return "escape";
  return "interaction";
}
