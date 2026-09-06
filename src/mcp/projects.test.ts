import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer, type ContextResolver } from "./index.js";

function text(res: unknown): string {
  const content = (res as { content?: { text: string }[] }).content ?? [];
  return content[0]?.text ?? "";
}

async function connect(resolve: ContextResolver, writeProject = vi.fn()) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildServer(resolve, writeProject);
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, writeProject };
}

const SIGNED_OUT: ContextResolver = () => ({ error: "Not signed in to SerenEdge." });
const withProject =
  (project: string | null): ContextResolver =>
  () => ({
    url: "http://api.test",
    token: "tok-123",
    project,
    user: "Tester",
  });

describe("mcp server context resolution", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an actionable error from every tool when not signed in", async () => {
    const { client } = await connect(SIGNED_OUT);
    // Each tool gets arguments its own schema accepts. Sharing one argument
    // object across tools would let a zod rejection masquerade as the
    // not-signed-in error this test is actually asserting.
    const cases: [string, Record<string, unknown>][] = [
      ["list_my_tasks", {}],
      ["get_task", { key: "X-1" }],
      ["ask_kb", { question: "where is auth?" }],
      ["get_project_summary", {}],
      ["list_my_projects", {}],
      ["switch_project", { slug: "acme" }],
    ];
    for (const [name, args] of cases) {
      const res = await client.callTool({ name, arguments: args });
      expect(res.isError, `${name} should error`).toBe(true);
      expect(text(res), `${name} message`).toContain("Not signed in");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("defaults a project-scoped tool to the current project", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const { client } = await connect(withProject("acme"));
    await client.callTool({ name: "get_project_summary", arguments: {} });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/api/agent/projects/acme/summary",
      expect.anything(),
    );
  });

  it("lets an explicit project argument win over the current project", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const { client } = await connect(withProject("acme"));
    await client.callTool({ name: "get_project_summary", arguments: { project: "other" } });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/api/agent/projects/other/summary",
      expect.anything(),
    );
  });

  it("explains how to map the repo when no project is available", async () => {
    const { client } = await connect(withProject(null));
    const res = await client.callTool({ name: "get_project_summary", arguments: {} });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain("not mapped to a SerenEdge project");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks the current project in list_my_projects", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          projects: [
            { slug: "acme", name: "Acme", status: "active", roles: [], open_tasks: 2 },
            { slug: "other", name: "Other", status: "active", roles: [], open_tasks: 0 },
          ],
        }),
        { status: 200 },
      ),
    );
    const { client } = await connect(withProject("acme"));
    const res = await client.callTool({ name: "list_my_projects", arguments: {} });
    const payload = JSON.parse(text(res)) as {
      current: string | null;
      projects: { slug: string; current: boolean }[];
    };
    expect(payload.current).toBe("acme");
    expect(payload.projects.find((p) => p.slug === "acme")?.current).toBe(true);
    expect(payload.projects.find((p) => p.slug === "other")?.current).toBe(false);
  });

  it("switch_project writes a valid slug", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ projects: [{ slug: "acme", name: "Acme", status: "active" }] }),
        { status: 200 },
      ),
    );
    const { client, writeProject } = await connect(withProject(null));
    const res = await client.callTool({ name: "switch_project", arguments: { slug: "acme" } });
    expect(res.isError).toBeFalsy();
    expect(writeProject).toHaveBeenCalledWith("acme");
  });

  it("switch_project rejects a slug the user is not a member of", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ projects: [{ slug: "acme", name: "Acme", status: "active" }] }),
        { status: 200 },
      ),
    );
    const { client, writeProject } = await connect(withProject(null));
    const res = await client.callTool({ name: "switch_project", arguments: { slug: "nope" } });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain("acme");
    expect(writeProject).not.toHaveBeenCalled();
  });

  it("serenedge_status reports the resolved context without the token", async () => {
    const { client } = await connect(withProject("acme"));
    const res = await client.callTool({ name: "serenedge_status", arguments: {} });
    const body = text(res);
    expect(body).not.toContain("tok-123");
    expect(JSON.parse(body)).toMatchObject({ signedIn: true, project: "acme", user: "Tester" });
  });
});
