import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { release, tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSteps,
  CI_CONFIG_PATH,
  CI_FAILURE_EXCERPT_MAX_CHARS,
  type CiConfig,
  type CiReportInput,
  type CiStep,
  ciConfigSchema,
  fingerprintInput,
  matchesPattern,
  parseStepMarker,
} from "./ci-shared.js";
import { readConfig, recordAuthResult } from "./config.js";

/** Trailing lines of the failing step's output kept for the report (spec 5.2). */
const EXCERPT_LINES = 200;

/**
 * `git status --porcelain` output describes a clean tree when every line is
 * empty or an ignored entry (`!!`). Untracked (`??`) files count as dirty: the
 * report must describe a commit, and an untracked file could change the run.
 */
export function isTreeClean(statusPorcelain: string): boolean {
  return statusPorcelain
    .split(/\r?\n/)
    .every((line) => line.trim() === "" || line.startsWith("!!"));
}

/**
 * The task key in a `task/<KEY>-slug` (or `issue/<KEY>-slug`) branch. Same
 * rule as `taskKeyFromRef` in packages/github/src/webhooks.ts, copied because
 * the CLI does not depend on @serenedge/github. Keep the two in step.
 */
export function taskKeyFromBranch(branch: string): string | null {
  const trimmed = branch.trim();
  // A CI escape fix task (A-242) has the exact branch `task/<KEY>-fix` or
  // `task/<KEY>-fix-<n>`, with no slug, so its key is read whole.
  const fix = /^(?:refs\/heads\/)?task\/([A-Z0-9]{1,8}-\d+-fix(?:-\d+)?)$/.exec(trimmed);
  if (fix?.[1]) return fix[1];
  const match = /^(?:refs\/heads\/)?(?:task|issue)\/([A-Z0-9]{1,8}-\d+)(?:-|$)/.exec(trimmed);
  return match?.[1] ?? null;
}

/** `4m 12s`, or `12s` under a minute. */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** True only when the command exited 0 and no step reported a failure. */
export function runPassed(exitCode: number, steps: CiStep[]): boolean {
  return exitCode === 0 && steps.every((s) => s.status === "pass");
}

/** Splits `git ... -z` output: NUL-terminated entries, paths never quoted. */
export function splitNul(out: string): string[] {
  return out.split("\0").filter((p) => p.length > 0);
}

type SignalName = "SIGINT" | "SIGTERM";
type SignalTarget = {
  once(event: SignalName, listener: () => void): unknown;
  off(event: SignalName, listener: () => void): unknown;
};

const SIGNAL_EXIT: Record<SignalName, number> = { SIGINT: 130, SIGTERM: 143 };

/**
 * While the CI command runs, Ctrl-C or a kill of `serenedge ci` must also stop
 * the command (on POSIX it runs in its own process group, so the signal does
 * not reach it) and remove any --at worktree. Returns a function that removes
 * the handlers once the command ends normally.
 */
export function watchSignals(h: {
  pid: () => number | undefined;
  kill: (pid: number) => void;
  cleanup: () => void;
  exit: (code: number) => void;
  target?: SignalTarget;
}): () => void {
  const target: SignalTarget = h.target ?? process;
  const handlers = new Map<SignalName, () => void>();
  const dispose = () => {
    for (const [event, fn] of handlers) target.off(event, fn);
    handlers.clear();
  };
  for (const event of ["SIGINT", "SIGTERM"] as const) {
    const fn = () => {
      dispose();
      const pid = h.pid();
      if (pid !== undefined) h.kill(pid);
      h.cleanup();
      h.exit(SIGNAL_EXIT[event]);
    };
    handlers.set(event, fn);
    target.once(event, fn);
  }
  return dispose;
}

export type RunCiOptions = {
  quick?: boolean;
  dryRun?: boolean;
  task?: string;
  at?: string;
  cwd?: string;
  version: string;
};

function git(cwd: string, args: string[]): { ok: boolean; out: string; err: string } {
  const res = spawnSync("git", args, { cwd, encoding: "utf8" });
  return {
    ok: res.status === 0,
    out: (res.stdout ?? "").trim(),
    err: (res.stderr ?? "").trim(),
  };
}

function gitRaw(cwd: string, args: string[]): string | null {
  const res = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return res.status === 0 ? (res.stdout ?? "") : null;
}

/** SHA-256 over ci.json and every CI-defining file, as committed at `sha` (spec 5.3). */
function configHash(cwd: string, sha: string, config: CiConfig): string {
  const tracked = splitNul(gitRaw(cwd, ["ls-tree", "-r", "-z", "--name-only", sha]) ?? "");
  const paths = new Set<string>([CI_CONFIG_PATH]);
  for (const pattern of config.files) {
    if (pattern.includes("*")) {
      for (const p of tracked) if (matchesPattern(p, pattern)) paths.add(p);
    } else {
      paths.add(pattern.replace(/\\/g, "/"));
    }
  }
  const files: { path: string; content: string }[] = [];
  for (const path of paths) {
    const content = gitRaw(cwd, ["show", `${sha}:${path}`]);
    // A listed file missing at this commit is left out of the hash.
    if (content !== null) files.push({ path, content });
  }
  return createHash("sha256").update(fingerprintInput(files), "utf8").digest("hex");
}

/** Kills the command and everything it started. */
function killTree(pid: number): void {
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    // already gone
  }
}

type RunResult = {
  exitCode: number;
  startMs: number;
  endMs: number;
  events: { name: string; status: "start" | "pass" | "fail"; atMs: number }[];
  excerpt: string | null;
  timedOut: boolean;
};

/**
 * Runs `command` through the shell, teeing its output to this terminal. Keeps
 * the last 200 lines of the current step (reset at each start marker), and
 * freezes them as the excerpt at the first failure.
 */
function runCommand(
  command: string,
  cwd: string,
  timeoutMinutes: number,
  onSignal: () => void,
): Promise<RunResult> {
  return new Promise((resolve) => {
    const startMs = Date.now();
    const events: RunResult["events"] = [];
    let current: string[] = [];
    let excerpt: string | null = null;
    let timedOut = false;
    const partial = { out: "", err: "" };

    const onLine = (line: string) => {
      const marker = parseStepMarker(line);
      if (marker) {
        events.push({ ...marker, atMs: Date.now() });
        if (marker.status === "start") current = [];
        else if (marker.status === "fail" && excerpt === null) excerpt = current.join("\n");
        return;
      }
      current.push(line);
      if (current.length > EXCERPT_LINES) current.shift();
    };
    const feed = (which: "out" | "err", chunk: Buffer) => {
      (which === "out" ? process.stdout : process.stderr).write(chunk);
      const text = partial[which] + chunk.toString("utf8");
      const lines = text.split("\n");
      partial[which] = lines.pop() ?? "";
      for (const l of lines) onLine(l.replace(/\r$/, ""));
    };

    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      // Own process group on POSIX so a timeout can kill the whole tree.
      detached: process.platform !== "win32",
    });
    const unwatch = watchSignals({
      pid: () => child.pid,
      kill: killTree,
      cleanup: onSignal,
      exit: (code) => process.exit(code),
    });
    child.stdout?.on("data", (c: Buffer) => feed("out", c));
    child.stderr?.on("data", (c: Buffer) => feed("err", c));

    const timer = setTimeout(
      () => {
        timedOut = true;
        if (child.pid !== undefined) killTree(child.pid);
      },
      timeoutMinutes * 60 * 1000,
    );

    const finish = (code: number) => {
      clearTimeout(timer);
      unwatch();
      for (const which of ["out", "err"] as const) {
        if (partial[which]) onLine(partial[which].replace(/\r$/, ""));
        partial[which] = "";
      }
      const exitCode = timedOut && code === 0 ? 1 : code;
      if (timedOut) current.push(`serenedge ci: timed out after ${timeoutMinutes} minutes`);
      if (exitCode !== 0 && excerpt === null) excerpt = current.slice(-EXCERPT_LINES).join("\n");
      resolve({ exitCode, startMs, endMs: Date.now(), events, excerpt, timedOut });
    };
    child.on("error", (error) => {
      current.push(`serenedge ci: could not start the command: ${error.message}`);
      finish(127);
    });
    child.on("close", (code) => finish(code ?? 1));
  });
}

function printSteps(steps: CiStep[]): void {
  const width = Math.max(4, ...steps.map((s) => s.name.length));
  console.log("");
  for (const s of steps) {
    console.log(
      `  ${s.status === "pass" ? "PASS" : "FAIL"}  ${s.name.padEnd(width)}  ${formatDuration(s.durationMs)}`,
    );
  }
  console.log("");
}

type TaskInfo = { key: string; targetBranch: string };

async function fetchTask(key: string): Promise<TaskInfo | { error: string }> {
  const config = readConfig();
  if (!config) return { error: "Not signed in. Run `serenedge login`." };
  const base = config.url.replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/api/agent/tasks/${encodeURIComponent(key)}`, {
      headers: { authorization: `Bearer ${config.token}` },
    });
  } catch {
    return { error: `${base} is unreachable from this machine.` };
  }
  if (res.status === 401) recordAuthResult(false);
  else if (res.ok) recordAuthResult(true);
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    task?: { key: string; target_branch: string };
  };
  if (!res.ok || !body.task) {
    return { error: body.error ?? `Could not load ${key} (${res.status})` };
  }
  return { key: body.task.key, targetBranch: body.task.target_branch };
}

async function uploadReport(key: string, report: CiReportInput, version: string): Promise<string> {
  const config = readConfig();
  if (!config) throw new Error("Not signed in. Run `serenedge login`.");
  const base = config.url.replace(/\/$/, "");
  const res = await fetch(`${base}/api/agent/tasks/${encodeURIComponent(key)}/ci-report`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
      "x-serenedge-client": `cli/${version}`,
    },
    body: JSON.stringify(report),
  });
  if (res.status === 401) recordAuthResult(false);
  else if (res.ok) recordAuthResult(true);
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!res.ok || !body.id) throw new Error(body.error ?? `Upload failed (${res.status})`);
  return body.id;
}

/**
 * `serenedge ci` (spec 5.1). Returns the process exit code: 0 on pass, 1 on a
 * failed run or any refusal. `--at <sha>` (dry runs only) runs the command in
 * a throwaway detached worktree under the OS temp dir.
 */
export async function runCi(opts: RunCiOptions): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const top = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (!top.ok) {
    console.error("Run this inside a git repository.");
    return 1;
  }
  const root = top.out;
  if (opts.at && !opts.dryRun) {
    console.error("--at only works with --dry-run: a report must describe your checked-out HEAD.");
    return 1;
  }

  const branch = git(root, ["branch", "--show-current"]).out;
  const key = opts.task ?? taskKeyFromBranch(branch);

  let workdir = root;
  let worktree: string | null = null;
  if (opts.at) {
    worktree = mkdtempSync(join(tmpdir(), "serenedge-ci-"));
    const added = git(root, ["worktree", "add", "--detach", "--", worktree, opts.at]);
    if (!added.ok) {
      rmSync(worktree, { recursive: true, force: true });
      console.error(`Could not check out ${opts.at}: ${added.err}`);
      return 1;
    }
    workdir = worktree;
  }

  let removed = false;
  const removeWorktree = () => {
    if (!worktree || removed) return;
    removed = true;
    git(root, ["worktree", "remove", "--force", worktree]);
    rmSync(worktree, { recursive: true, force: true });
    git(root, ["worktree", "prune"]);
  };
  try {
    return await runIn(workdir, key, opts, removeWorktree);
  } finally {
    removeWorktree();
  }
}

async function runIn(
  workdir: string,
  key: string | null,
  opts: RunCiOptions,
  onSignal: () => void,
): Promise<number> {
  // 1. Config.
  const configPath = join(workdir, CI_CONFIG_PATH);
  if (!existsSync(configPath)) {
    console.error("This repo has no SerenEdge CI yet; the CI foundation task adds it.");
    return 1;
  }
  let config: CiConfig;
  try {
    const parsed = ciConfigSchema.safeParse(JSON.parse(readFileSync(configPath, "utf8")));
    if (!parsed.success) {
      console.error(`${CI_CONFIG_PATH} is invalid:`);
      for (const i of parsed.error.issues) console.error(`  ${i.path.join(".")}: ${i.message}`);
      return 1;
    }
    config = parsed.data;
  } catch (error) {
    console.error(`${CI_CONFIG_PATH} is not valid JSON: ${(error as Error).message}`);
    return 1;
  }
  const command = opts.quick ? config.quickCommand : config.command;
  if (!command) {
    console.error(`${CI_CONFIG_PATH} has no quickCommand, so --quick cannot run.`);
    return 1;
  }

  // 2. Clean tree: the result must describe a commit.
  const status = gitRaw(workdir, ["status", "--porcelain"]);
  if (status === null || !isTreeClean(status)) {
    console.error(
      "The working tree has uncommitted or untracked changes. Commit (or remove) them first: a CI report must describe a commit.",
    );
    if (status) console.error(status.trimEnd());
    return 1;
  }

  // 3. Task.
  let targetBranch = "dev";
  if (!key) {
    if (!opts.dryRun) {
      console.error(
        "Could not tell the task from this branch (expected task/<KEY>-...). Pass --task <KEY>.",
      );
      return 1;
    }
  } else {
    const task = await fetchTask(key);
    if ("error" in task) {
      if (!opts.dryRun) {
        console.error(task.error);
        return 1;
      }
      console.log(
        `Note: ${task.error.replace(/\.?$/, ".")} Comparing against origin/${targetBranch}.`,
      );
    } else {
      targetBranch = task.targetBranch;
    }
  }

  // 4. Head and base.
  const headSha = git(workdir, ["rev-parse", "HEAD"]).out;
  const fetched = git(workdir, ["fetch", "origin", "--", targetBranch]);
  const base = git(workdir, ["rev-parse", "--verify", "--quiet", `origin/${targetBranch}`]);
  let baseSha = base.ok ? base.out : "";
  if (!fetched.ok || !baseSha) {
    if (!opts.dryRun) {
      console.error(`Could not fetch origin/${targetBranch}: ${fetched.err || "no such branch"}`);
      return 1;
    }
    console.log(`Note: could not fetch origin/${targetBranch}; the base is unknown.`);
    baseSha = baseSha || "unknown";
  }
  const behindBase =
    baseSha === "unknown" || !git(workdir, ["merge-base", "--is-ancestor", baseSha, "HEAD"]).ok;
  if (behindBase && baseSha !== "unknown") {
    console.log(
      `Note: this branch does not contain origin/${targetBranch}. The report is marked behind and cannot satisfy the merge guard; rebase first.`,
    );
  }

  // 5. Fingerprint.
  const hash = configHash(workdir, headSha, config);

  // 6. Run.
  console.log(`> ${command}`);
  const run = await runCommand(command, workdir, config.timeoutMinutes, onSignal);
  const steps = buildSteps(run.events, {
    command,
    exitCode: run.exitCode,
    startMs: run.startMs,
    endMs: run.endMs,
  });
  // A step that printed a fail marker fails the run even if the command exits 0.
  const passed = runPassed(run.exitCode, steps);
  const durationMs = run.endMs - run.startMs;

  // 7. Upload.
  let uploadError: string | null = null;
  if (!opts.dryRun && key) {
    const report: CiReportInput = {
      headSha,
      baseSha,
      baseRef: targetBranch,
      behindBase,
      mode: opts.quick ? "quick" : "full",
      configHash: hash,
      passed,
      steps,
      // Keep the end, where the error is, within what the server accepts.
      failureExcerpt: passed ? null : (run.excerpt?.slice(-CI_FAILURE_EXCERPT_MAX_CHARS) ?? null),
      durationMs,
      cliVersion: opts.version,
      os: `${process.platform} ${release()}`.slice(0, 64),
    };
    try {
      await uploadReport(key, report, opts.version);
    } catch (error) {
      uploadError = (error as Error).message;
    }
  }

  // 8. Verdict.
  printSteps(steps);
  if (passed) {
    console.log(`CI passed (${steps.length} steps, ${formatDuration(durationMs)})`);
  } else {
    const failed = steps.find((s) => s.status === "fail")?.name ?? command;
    console.log(
      `CI failed at ${failed}${run.timedOut ? ` (timed out after ${config.timeoutMinutes} minutes)` : ""}`,
    );
  }
  if (opts.dryRun) {
    console.log("Dry run: nothing was uploaded.");
  } else if (uploadError) {
    console.error(`The report could not be uploaded: ${uploadError}`);
    return 1;
  } else {
    console.log(`Report uploaded for ${key}.`);
  }
  return passed ? 0 : 1;
}
