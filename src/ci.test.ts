import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  formatDuration,
  isTreeClean,
  runPassed,
  splitNul,
  taskKeyFromBranch,
  watchSignals,
} from "./ci.js";

describe("isTreeClean", () => {
  it("is clean with no status output", () => {
    expect(isTreeClean("")).toBe(true);
  });

  it("is dirty with an untracked file", () => {
    expect(isTreeClean("?? new.ts\n")).toBe(false);
  });

  it("ignores ignored files", () => {
    expect(isTreeClean("!! dist/\n")).toBe(true);
  });

  it("is dirty with a modified file", () => {
    expect(isTreeClean(" M a.ts\n")).toBe(false);
  });
});

describe("taskKeyFromBranch", () => {
  it("reads the key from a task branch", () => {
    expect(taskKeyFromBranch("task/ACME-12-login")).toBe("ACME-12");
  });

  it("reads a CI escape fix task key from its exact branch (A-242)", () => {
    expect(taskKeyFromBranch("task/ACME-12-fix")).toBe("ACME-12-fix");
    expect(taskKeyFromBranch("task/ACME-12-fix-3")).toBe("ACME-12-fix-3");
    expect(taskKeyFromBranch("task/ACME-12-fix-login")).toBe("ACME-12");
  });

  it("returns null for a branch outside the convention", () => {
    expect(taskKeyFromBranch("dev")).toBeNull();
  });
});

describe("formatDuration", () => {
  it("shows minutes and seconds, or seconds alone under a minute", () => {
    expect(formatDuration(252_000)).toBe("4m 12s");
    expect(formatDuration(12_400)).toBe("12s");
  });
});

describe("watchSignals", () => {
  function setup(childPid: number | null = 4321) {
    const pid = childPid ?? undefined;
    const target = new EventEmitter();
    const order: string[] = [];
    const kill = vi.fn((_pid: number) => order.push("kill"));
    const cleanup = vi.fn(() => order.push("cleanup"));
    const exit = vi.fn((_code: number) => order.push("exit"));
    const dispose = watchSignals({ pid: () => pid, kill, cleanup, exit, target });
    return { target, order, kill, cleanup, exit, dispose };
  }

  it("on SIGINT kills the tree, cleans up, then exits 130", () => {
    const h = setup();
    h.target.emit("SIGINT");
    expect(h.kill).toHaveBeenCalledWith(4321);
    expect(h.cleanup).toHaveBeenCalledTimes(1);
    expect(h.exit).toHaveBeenCalledWith(130);
    expect(h.order).toEqual(["kill", "cleanup", "exit"]);
  });

  it("on SIGTERM exits 143 and removes the other handler", () => {
    const h = setup();
    h.target.emit("SIGTERM");
    expect(h.exit).toHaveBeenCalledWith(143);
    expect(h.target.listenerCount("SIGINT")).toBe(0);
    expect(h.target.listenerCount("SIGTERM")).toBe(0);
  });

  it("still cleans up and exits when the child has no pid", () => {
    const h = setup(null);
    h.target.emit("SIGINT");
    expect(h.kill).not.toHaveBeenCalled();
    expect(h.cleanup).toHaveBeenCalledTimes(1);
    expect(h.exit).toHaveBeenCalledWith(130);
  });

  it("removes both handlers after a normal exit", () => {
    const h = setup();
    expect(h.target.listenerCount("SIGINT")).toBe(1);
    expect(h.target.listenerCount("SIGTERM")).toBe(1);
    h.dispose();
    expect(h.target.listenerCount("SIGINT")).toBe(0);
    expect(h.target.listenerCount("SIGTERM")).toBe(0);
    h.target.emit("SIGINT");
    expect(h.cleanup).not.toHaveBeenCalled();
  });
});

describe("runPassed", () => {
  it("needs exit 0 and every step passing", () => {
    expect(runPassed(0, [{ name: "a", status: "pass", durationMs: 1 }])).toBe(true);
    expect(runPassed(1, [{ name: "a", status: "pass", durationMs: 1 }])).toBe(false);
    expect(
      runPassed(0, [
        { name: "a", status: "pass", durationMs: 1 },
        { name: "b", status: "fail", durationMs: 1 },
      ]),
    ).toBe(false);
  });
});

describe("splitNul", () => {
  it("splits NUL-terminated git output and keeps non-ASCII paths verbatim", () => {
    expect(splitNul("a.ts\0docs/caf\u00e9.md\0")).toEqual(["a.ts", "docs/caf\u00e9.md"]);
    expect(splitNul("")).toEqual([]);
  });
});
