import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./index.js";

const RESOLVE = () => ({
  url: "http://api.test",
  token: "tok-123",
  project: null as string | null,
  user: "Tester",
});

async function connectedClient() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildServer(RESOLVE, vi.fn());
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("mcp server", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes the SerenEdge tools", async () => {
    const client = await connectedClient();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "approve_and_merge",
      "ask_kb",
      "ask_linked_kb",
      "ask_task_question",
      "claim_task",
      "comment_review",
      "draft_kb_context",
      "draft_kb_proposals",
      "draft_tasks_context",
      "flag_blocked",
      "get_context",
      "get_project_summary",
      "get_release_status",
      "get_review_context",
      "get_review_queue",
      "get_revision",
      "get_risk_context",
      "get_task",
      "get_task_thread",
      "ignore_env_name",
      "link_kb",
      "linked_endpoints",
      "list_linked_projects",
      "list_my_projects",
      "list_my_tasks",
      "list_ready_tasks",
      "open_release_pr",
      "propose_kb",
      "query_kb",
      "read_kb",
      "read_linked_kb",
      "register_env_var",
      "report_ci_escape",
      "request_changes",
      "serenedge_status",
      "start_rework",
      "start_task",
      "submit_for_review",
      "submit_plan",
      "submit_risk_narrative",
      "switch_project",
      "unlink_kb",
      "write_kb",
    ]);
  });

  it("routes the linked-project tools to the linked agent API", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = await connectedClient();
    await client.callTool({ name: "list_linked_projects", arguments: { project: "mobile" } });
    await client.callTool({
      name: "ask_linked_kb",
      arguments: { project: "mobile", question: "auth routes", linked: "backend" },
    });
    await client.callTool({
      name: "read_linked_kb",
      arguments: { project: "mobile", linked: "backend", key: "auth-api", depth: 2 },
    });
    await client.callTool({
      name: "linked_endpoints",
      arguments: { project: "mobile", linked: "backend" },
    });
    await client.callTool({
      name: "ask_kb",
      arguments: { project: "mobile", question: "auth", includeLinked: false },
    });

    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "http://api.test/api/agent/linked/projects?project=mobile",
      "http://api.test/api/agent/linked/search?project=mobile&q=auth+routes&linked=backend",
      "http://api.test/api/agent/linked/entry?project=mobile&linked=backend&key=auth-api&depth=2",
      "http://api.test/api/agent/linked/endpoints?project=mobile&linked=backend",
      "http://api.test/api/agent/kb/ask?project=mobile&q=auth&linked=0",
    ]);
  });

  it("routes the release tools to the project's release API (A-241)", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ release: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = await connectedClient();
    await client.callTool({ name: "get_release_status", arguments: { project: "acme" } });
    await client.callTool({ name: "open_release_pr", arguments: { project: "acme" } });
    expect(fetchMock.mock.calls.map((c) => [c[0], (c[1] as { method: string }).method])).toEqual([
      ["http://api.test/api/agent/projects/acme/release", "GET"],
      ["http://api.test/api/agent/projects/acme/release", "POST"],
    ]);
  });

  it("routes report_ci_escape to the task's ci-escape API with the project (A-242)", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true, fix_task_key: "ACME-7-fix" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = await connectedClient();
    await client.callTool({
      name: "report_ci_escape",
      arguments: {
        project: "acme",
        task: "ACME-7",
        releasePrUrl: "https://github.com/o/r/pull/3",
        failingStep: "test",
        evidence: "fails",
        fixHours: 4,
      },
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe("http://api.test/api/agent/tasks/ACME-7/ci-escape");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      project: "acme",
      releasePrUrl: "https://github.com/o/r/pull/3",
      failingStep: "test",
      evidence: "fails",
      fixHours: 4,
    });
  });

  it("calls the web API with the device token and returns the payload", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ project: { slug: "acme" }, schedule: { status: "behind" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = await connectedClient();
    const res = await client.callTool({
      name: "get_project_summary",
      arguments: { project: "acme" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/api/agent/projects/acme/summary",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer tok-123" }),
      }),
    );
    const content = (res.content as { type: string; text: string }[])[0] ?? { text: "" };
    expect(JSON.parse(content.text)).toMatchObject({ schedule: { status: "behind" } });
  });

  it("surfaces an API error as an MCP tool error", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "You already hold 2 open tasks" }), { status: 409 }),
    );
    const client = await connectedClient();
    const res = await client.callTool({ name: "claim_task", arguments: { key: "ACME-1" } });
    expect(res.isError).toBe(true);
    const content = (res.content as { type: string; text: string }[])[0] ?? { text: "" };
    expect(content.text).toContain("You already hold 2 open tasks");
  });
});
