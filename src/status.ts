import { currentProject, normalizeRepoKey, readConfig, recordAuthResult } from "./config.js";

export type StatusState =
  | "not_signed_in"
  | "unreachable"
  | "token_rejected"
  | "no_project"
  | "ready";

export type StatusPayload = {
  /** Always true: if the CLI were missing, nothing would print this at all. */
  installed: true;
  signedIn: boolean;
  url: string | null;
  user: { name: string | null; email: string } | null;
  repo: string | null;
  project: string | null;
  state: StatusState;
};

/**
 * The single state probe the session hook calls. Never prints or returns the
 * token. `offline` skips the /api/agent/me round trip so session start stays
 * local-only and cannot hang on a dead network.
 */
export async function buildStatus(opts: { cwd: string; offline: boolean }): Promise<StatusPayload> {
  const config = readConfig();
  const repo = normalizeRepoKey(opts.cwd);
  const project = currentProject(opts.cwd);

  if (!config) {
    return {
      installed: true,
      signedIn: false,
      url: null,
      user: null,
      repo,
      project: null,
      state: "not_signed_in",
    };
  }

  const base = { installed: true as const, url: config.url, repo, project };

  if (opts.offline) {
    // A token the server has already rejected outranks the ready/no_project
    // decision. Session start stays local-only, so the last recorded 401 from
    // an MCP tool or a CLI command is the only evidence available here.
    if (config.tokenRejectedAt) {
      return { ...base, signedIn: false, user: null, state: "token_rejected" };
    }
    return {
      ...base,
      signedIn: true,
      user: config.user ?? null,
      state: project ? "ready" : "no_project",
    };
  }

  let res: Response;
  try {
    res = await fetch(`${config.url.replace(/\/$/, "")}/api/agent/me`, {
      headers: { authorization: `Bearer ${config.token}` },
    });
  } catch {
    return { ...base, signedIn: false, user: config.user ?? null, state: "unreachable" };
  }
  if (res.status === 401) {
    recordAuthResult(false);
    return { ...base, signedIn: false, user: null, state: "token_rejected" };
  }
  if (!res.ok) {
    return { ...base, signedIn: false, user: config.user ?? null, state: "unreachable" };
  }
  recordAuthResult(true);
  const { user } = (await res.json().catch(() => ({ user: null }))) as {
    user: { name: string | null; email: string } | null;
  };
  return {
    ...base,
    signedIn: true,
    user,
    state: project ? "ready" : "no_project",
  };
}
