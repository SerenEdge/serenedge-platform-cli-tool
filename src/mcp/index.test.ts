import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./index.js";

const OPTS = { url: "http://api.test", token: "tok-123" };

async function connectedClient() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildServer(OPTS);
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
      "ask_kb",
      "ask_task_question",
      "claim_task",
      "draft_kb_context",
      "draft_kb_proposals",
      "draft_tasks_context",
      "get_context",
      "get_project_summary",
      "get_revision",
      "get_risk_context",
      "get_task",
      "get_task_thread",
      "ignore_env_name",
      "list_my_tasks",
      "propose_kb",
      "register_env_var",
      "start_task",
      "submit_for_review",
      "submit_plan",
      "submit_risk_narrative",
    ]);
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
