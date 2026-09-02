import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

export type ServerOptions = { url: string; token: string };

type ApiResult = { ok: true; data: unknown } | { ok: false; error: string };

function makeApi({ url, token }: ServerOptions) {
  const base = url.replace(/\/$/, "");
  return async function api(
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<ApiResult> {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method: init?.method ?? "GET",
        headers: {
          authorization: `Bearer ${token}`,
          ...(init?.body ? { "content-type": "application/json" } : {}),
        },
        body: init?.body ? JSON.stringify(init.body) : undefined,
      });
    } catch (error) {
      return { ok: false, error: `Could not reach ${base}: ${(error as Error).message}` };
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { error: text };
    }
    if (!res.ok) {
      const message = (json as { error?: string }).error ?? `Request failed (${res.status})`;
      return { ok: false, error: message };
    }
    return { ok: true, data: json };
  };
}

function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

/** Builds the MCP server with the six SerenEdge tools bound to `opts`. */
export function buildServer(opts: ServerOptions): McpServer {
  const api = makeApi(opts);
  const server = new McpServer({ name: "serenedge", version: "0.0.0" });

  server.registerTool(
    "list_my_tasks",
    {
      description: "List tasks assigned to you, optionally filtered to one project slug.",
      inputSchema: { project: z.string().optional() },
    },
    async ({ project }) => {
      const res = await api(
        `/api/agent/tasks${project ? `?project=${encodeURIComponent(project)}` : ""}`,
      );
      return res.ok ? textResult(res.data) : errorResult(res.error);
    },
  );

  server.registerTool(
    "get_task",
    {
      description: "Get one task by key, including its manual steps and agent prompt.",
      inputSchema: { key: z.string() },
    },
    async ({ key }) => {
      const res = await api(`/api/agent/tasks/${encodeURIComponent(key)}`);
      return res.ok ? textResult(res.data) : errorResult(res.error);
    },
  );

  server.registerTool(
    "claim_task",
    {
      description:
        "Claim a ready task by key. Fails if you are at the claim cap or hold an overdue task.",
      inputSchema: { key: z.string() },
    },
    async ({ key }) => {
      const res = await api(`/api/agent/tasks/${encodeURIComponent(key)}/claim`, {
        method: "POST",
      });
      return res.ok ? textResult(res.data) : errorResult(res.error);
    },
  );

  server.registerTool(
    "start_task",
    {
      description:
        "Move your claimed task to in_progress. Returns the branch name and git instructions.",
      inputSchema: { key: z.string() },
    },
    async ({ key }) => {
      const res = await api(`/api/agent/tasks/${encodeURIComponent(key)}/start`, {
        method: "POST",
      });
      return res.ok ? textResult(res.data) : errorResult(res.error);
    },
  );

  server.registerTool(
    "submit_for_review",
    {
      description:
        "Move your task to in_review with a short summary. The KB contribution gate (A-033) runs first; pass kbWaiverReason to waive the KB proposal requirement when the work genuinely has no such change.",
      inputSchema: {
        key: z.string(),
        summary: z.string(),
        kbWaiverReason: z.string().optional(),
      },
    },
    async ({ key, summary, kbWaiverReason }) => {
      const res = await api(`/api/agent/tasks/${encodeURIComponent(key)}/submit`, {
        method: "POST",
        body: { summary, ...(kbWaiverReason ? { kbWaiverReason } : {}) },
      });
      return res.ok ? textResult(res.data) : errorResult(res.error);
    },
  );

  server.registerTool(
    "ask_task_question",
    {
      description:
        "Post a question on a task's Q&A thread. Notifies the Architect. Requires full visibility of the task.",
      inputSchema: { key: z.string(), text: z.string() },
    },
    async ({ key, text }) => {
      const res = await api(`/api/agent/tasks/${encodeURIComponent(key)}/thread`, {
        method: "POST",
        body: { text },
      });
      return res.ok ? textResult(res.data) : errorResult(res.error);
    },
  );

  server.registerTool(
    "get_task_thread",
    {
      description: "Read a task's Q&A thread (questions and answers, oldest first).",
      inputSchema: { key: z.string() },
    },
    async ({ key }) => {
      const res = await api(`/api/agent/tasks/${encodeURIComponent(key)}/thread`);
      return res.ok ? textResult(res.data) : errorResult(res.error);
    },
  );

  server.registerTool(
    "get_project_summary",
    {
      description: "Schedule status, milestone progress and task counts for a project slug.",
      inputSchema: { project: z.string() },
    },
    async ({ project }) => {
      const res = await api(`/api/agent/projects/${encodeURIComponent(project)}/summary`);
      return res.ok ? textResult(res.data) : errorResult(res.error);
    },
  );

  // --- Knowledge base (A-034) ---------------------------------------------

  server.registerTool(
    "get_context",
    {
      description:
        "Knowledge-base context for a task: entries linked to it plus every active project convention. Read these before writing code and follow them exactly.",
      inputSchema: { key: z.string() },
    },
    async ({ key }) => {
      const res = await api(`/api/agent/kb/context?task=${encodeURIComponent(key)}`);
      return res.ok ? textResult(res.data) : errorResult(res.error);
    },
  );

  server.registerTool(
    "ask_kb",
    {
      description:
        "Search a project's knowledge base for a question and get back the most relevant entries (key, title, body). No answer is synthesized: read the entries and write the answer yourself.",
      inputSchema: { project: z.string(), question: z.string() },
    },
    async ({ project, question }) => {
      const res = await api(
        `/api/agent/kb/ask?project=${encodeURIComponent(project)}&q=${encodeURIComponent(question)}`,
      );
      return res.ok ? textResult(res.data) : errorResult(res.error);
    },
  );

  server.registerTool(
    "propose_kb",
    {
      description:
        "File a knowledge-base change proposal linked to the current task. Omit entryKey for a new entry; set it to change an existing one. A kb.approve holder reviews it.",
      inputSchema: {
        taskKey: z.string(),
        type: z.enum([
          "decision",
          "interface",
          "convention",
          "ui_system",
          "environment",
          "error",
          "glossary",
        ]),
        title: z.string(),
        body: z.string(),
        entryKey: z.string().optional(),
        diff: z.string().optional(),
      },
    },
    async ({ taskKey, type, title, body, entryKey, diff }) => {
      const res = await api("/api/agent/kb/proposals", {
        method: "POST",
        body: {
          taskKey,
          type,
          title,
          body,
          ...(entryKey ? { entryKey } : {}),
          ...(diff ? { diff } : {}),
        },
      });
      return res.ok ? textResult(res.data) : errorResult(res.error);
    },
  );

  server.registerTool(
    "draft_kb_context",
    {
      description:
        "Get the raw materials to draft KB proposals from your task's diff: the diff itself, the project's existing interface/decision entries, and the drafter prompt. Draft proposals yourself and submit confirmed ones with propose_kb. Requires kb.propose.",
      inputSchema: { key: z.string() },
    },
    async ({ key }) => {
      const res = await api(`/api/agent/kb/draft-context?task=${encodeURIComponent(key)}`);
      return res.ok ? textResult(res.data) : errorResult(res.error);
    },
  );

  server.registerTool(
    "draft_kb_proposals",
    {
      description:
        "Optional: draft KB proposals from your task's diff server-side (only works when the project's optional ANTHROPIC_API_KEY path is on). Review the drafts, then submit confirmed ones with propose_kb yourself - this does not create proposals directly.",
      inputSchema: { key: z.string() },
    },
    async ({ key }) => {
      const res = await api("/api/agent/kb/draft-proposals", {
        method: "POST",
        body: { taskKey: key },
      });
      return res.ok ? textResult(res.data) : errorResult(res.error);
    },
  );

  // --- Environment registry (A-037) ------------------------------------------

  server.registerTool(
    "register_env_var",
    {
      description:
        "Register an environment variable your task introduces, so it stops blocking submit_for_review. `environments` lists the environments it is required in.",
      inputSchema: {
        taskKey: z.string(),
        name: z.string(),
        description: z.string().optional(),
        isSecret: z.boolean().optional(),
        source: z.enum(["client", "devops", "generated"]).optional(),
        environments: z.array(z.string()).optional(),
      },
    },
    async ({ taskKey, name, description, isSecret, source, environments }) => {
      const res = await api("/api/agent/env/register", {
        method: "POST",
        body: {
          taskKey,
          name,
          ...(description ? { description } : {}),
          ...(isSecret === undefined ? {} : { isSecret }),
          ...(source ? { source } : {}),
          ...(environments ? { environments } : {}),
        },
      });
      return res.ok ? textResult(res.data) : errorResult(res.error);
    },
  );

  server.registerTool(
    "ignore_env_name",
    {
      description:
        "Tell the env scanner to stop flagging a name for this project (a false positive, or a variable owned elsewhere). Needs a reason.",
      inputSchema: { taskKey: z.string(), name: z.string(), reason: z.string() },
    },
    async ({ taskKey, name, reason }) => {
      const res = await api("/api/agent/env/ignore", {
        method: "POST",
        body: { taskKey, name, reason },
      });
      return res.ok ? textResult(res.data) : errorResult(res.error);
    },
  );

  server.registerTool(
    "submit_plan",
    {
      description:
        "Validate a project plan (milestones, tasks, conventions) and diff it against existing tasks. apply:false (default) is a dry run - review the diff, then call again with apply:true (requires plan.write) to create/update the tasks, dependencies, env vars and KB entries.",
      inputSchema: { project: z.string(), plan: z.any(), apply: z.boolean().optional() },
    },
    async ({ project, plan, apply }) => {
      const res = await api("/api/agent/plan", {
        method: "POST",
        body: { project, plan, apply: apply ?? false },
      });
      return res.ok ? textResult(res.data) : errorResult(res.error);
    },
  );

  server.registerTool(
    "draft_tasks_context",
    {
      description:
        "Get the raw materials to draft plan-schema tasks from a description: project conventions, the closest KB entries, an example plan, and the drafter prompt. Draft the tasks yourself, then call submit_plan with apply:false to preview and apply:true once approved. Requires task.create.",
      inputSchema: { project: z.string(), intent: z.string() },
    },
    async ({ project, intent }) => {
      const res = await api("/api/agent/draft-tasks-context", {
        method: "POST",
        body: { project, intent },
      });
      return res.ok ? textResult(res.data) : errorResult(res.error);
    },
  );

  server.registerTool(
    "get_risk_context",
    {
      description:
        "Compute a fresh risk summary (stale in-review tasks, over-capacity developers, the longest blocked chain, overdue tasks, KB entries that may be out of date) and get a prompt to write a short narrative from it. Write the narrative yourself, then call submit_risk_narrative. Requires plan.write.",
      inputSchema: { project: z.string() },
    },
    async ({ project }) => {
      const res = await api(`/api/agent/risk/context?project=${encodeURIComponent(project)}`);
      return res.ok ? textResult(res.data) : errorResult(res.error);
    },
  );

  server.registerTool(
    "submit_risk_narrative",
    {
      description:
        "Post the narrative you wrote for a risk summary (from get_risk_context's summaryId) back to the platform.",
      inputSchema: { summaryId: z.string(), narrative: z.string() },
    },
    async ({ summaryId, narrative }) => {
      const res = await api(`/api/agent/risk/${encodeURIComponent(summaryId)}`, {
        method: "POST",
        body: { narrative },
      });
      return res.ok ? textResult(res.data) : errorResult(res.error);
    },
  );

  server.registerTool(
    "get_revision",
    {
      description:
        "Read a client revision request by key (e.g. REV-3) for a project slug, so you can plan the tasks it needs. Requires revision.plan.",
      inputSchema: { project: z.string(), key: z.string() },
    },
    async ({ project, key }) => {
      const res = await api(
        `/api/agent/revisions/${encodeURIComponent(key)}?project=${encodeURIComponent(project)}`,
      );
      return res.ok ? textResult(res.data) : errorResult(res.error);
    },
  );

  return server;
}

/** Entry point for `serenedge mcp`: serve the tools over stdio. */
export async function startStdioServer(opts: ServerOptions): Promise<void> {
  const server = buildServer(opts);
  await server.connect(new StdioServerTransport());
}
