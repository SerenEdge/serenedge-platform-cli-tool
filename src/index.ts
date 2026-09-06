import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import { Command } from "commander";
import {
  clearConfig,
  configDir,
  configForLogin,
  configLocation,
  currentProject,
  readConfig,
  setCurrentProject,
  writeConfig,
} from "./config.js";
import { buildStatus } from "./status.js";

const PLUGINS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "plugins");

const DEFAULT_URL = process.env.SERENEDGE_URL ?? "https://platform.serenedge.com";

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // best effort; the user can open the URL by hand
  }
}

type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
};

async function login(opts: { url?: string }): Promise<void> {
  const url = (opts.url ?? DEFAULT_URL).replace(/\/$/, "");
  p.intro("serenedge login");

  const codeRes = await fetch(`${url}/api/device/code`, { method: "POST" });
  if (!codeRes.ok) {
    p.cancel(`Could not reach ${url} (${codeRes.status})`);
    process.exit(1);
  }
  const code = (await codeRes.json()) as DeviceCodeResponse;

  const verifyUrl = `${code.verification_url}?code=${encodeURIComponent(code.user_code)}`;
  p.note(`${verifyUrl}\n\nCode: ${code.user_code}`, "Open this page and approve the device");
  openBrowser(verifyUrl);

  const spin = p.spinner();
  spin.start("Waiting for approval");
  const deadline = Date.now() + code.expires_in * 1000;
  while (Date.now() < deadline) {
    await sleep(code.interval * 1000);
    const tokenRes = await fetch(`${url}/api/device/token`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-name": deviceName() },
      body: JSON.stringify({ device_code: code.device_code }),
    });
    const body = (await tokenRes.json().catch(() => ({}))) as {
      access_token?: string;
      error?: string;
    };
    if (tokenRes.ok && body.access_token) {
      // Cache the user so `status --offline` can name them without a request.
      let user: { name: string | null; email: string } | null = null;
      try {
        const meRes = await fetch(`${url}/api/agent/me`, {
          headers: { authorization: `Bearer ${body.access_token}` },
        });
        if (meRes.ok) ({ user } = (await meRes.json()) as { user: typeof user });
      } catch {
        // Not fatal: status without --offline re-checks against the server.
      }
      // configForLogin carries the existing per-repo project map forward, so
      // a re-login does not unmap every repo on the machine.
      writeConfig(configForLogin({ url, token: body.access_token, user }));
      spin.stop("Approved");
      p.outro(`Signed in. Token stored at ${configLocation()}`);
      return;
    }
    if (body.error && body.error !== "authorization_pending") {
      spin.stop("Failed");
      p.cancel(body.error === "expired_token" ? "The code expired. Run login again." : body.error);
      process.exit(1);
    }
  }
  spin.stop("Timed out");
  p.cancel("The code expired. Run login again.");
  process.exit(1);
}

function deviceName(): string {
  const host = process.env.HOSTNAME || process.env.COMPUTERNAME || "cli";
  return `serenedge CLI (${host})`;
}

async function whoami(): Promise<void> {
  const config = readConfig();
  if (!config) {
    console.error("Not signed in. Run `serenedge login`.");
    process.exit(1);
  }
  const res = await fetch(`${config.url}/api/agent/me`, {
    headers: { authorization: `Bearer ${config.token}` },
  });
  if (res.status === 401) {
    console.error("Token rejected. Run `serenedge login` again.");
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`Request failed (${res.status})`);
    process.exit(1);
  }
  const { user } = (await res.json()) as {
    user: { email: string; name: string | null; username: string | null } | null;
  };
  if (!user) {
    console.error("No user for this token.");
    process.exit(1);
  }
  console.log(user.name ?? (user.username ? `@${user.username}` : user.email));
  console.log(user.email);
}

async function envCheck(opts: { project?: string; env?: string; url?: string }): Promise<void> {
  const config = readConfig();
  if (!config) {
    console.error("Not signed in. Run `serenedge login`.");
    process.exit(1);
  }
  if (!opts.project || !opts.env) {
    console.error("Usage: serenedge env check --project <slug> --env <name>");
    process.exit(1);
  }
  const base = (opts.url ?? config.url).replace(/\/$/, "");
  const res = await fetch(
    `${base}/api/agent/env/required?project=${encodeURIComponent(opts.project)}&env=${encodeURIComponent(
      opts.env,
    )}`,
    { headers: { authorization: `Bearer ${config.token}` } },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    console.error(body.error ?? `Request failed (${res.status})`);
    process.exit(1);
  }
  const { required } = (await res.json()) as { required: string[] };
  // Names only; this command never receives or prints values.
  const missing = required.filter((name) => !process.env[name]);
  console.log(
    `${opts.project} / ${opts.env}: ${required.length} required variable(s), ${missing.length} missing from this shell.`,
  );
  for (const name of missing) console.log(`  missing: ${name}`);
  if (missing.length > 0) process.exit(1);
}

function logout(): void {
  const removed = clearConfig();
  console.log(removed ? "Signed out." : "Was not signed in.");
}

async function updateCmd(id: string, opts: { set?: string; url?: string }): Promise<void> {
  const config = readConfig();
  if (!config) {
    console.error("Not signed in. Run `serenedge login`.");
    process.exit(1);
  }
  const base = (opts.url ?? config.url).replace(/\/$/, "");
  const endpoint = `${base}/api/agent/updates/${encodeURIComponent(id)}`;
  const authHeader = { authorization: `Bearer ${config.token}` };

  if (opts.set !== undefined) {
    const body = opts.set === "-" ? readFileSync(0, "utf8") : readFileSync(opts.set, "utf8");
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { ...authHeader, "content-type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; title?: string };
    if (!res.ok) {
      console.error(json.error ?? `Request failed (${res.status})`);
      process.exit(1);
    }
    console.log(
      `Updated draft "${json.title}". Review and publish it from the project Updates tab.`,
    );
    return;
  }

  const res = await fetch(endpoint, { headers: authHeader });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    title?: string;
    body?: string;
    periodStart?: string | null;
    periodEnd?: string | null;
    published?: boolean;
  };
  if (!res.ok) {
    console.error(json.error ?? `Request failed (${res.status})`);
    process.exit(1);
  }
  if (json.published) {
    console.log(`"${json.title}" is already published and cannot be rewritten.`);
    return;
  }
  console.log(`# ${json.title}`);
  if (json.periodStart && json.periodEnd) {
    console.log(`Period: ${json.periodStart} to ${json.periodEnd}`);
  }
  console.log("");
  console.log(json.body ?? "");
  console.log("");
  console.log("--- Rewrite the draft above in plain, friendly client language: short");
  console.log("--- paragraphs, no task keys, no internal jargon. Then post it back with:");
  console.log(`---   serenedge update ${id} --set <file>   (or --set - to read stdin)`);
}

async function mcp(): Promise<void> {
  // NOT_SIGNED_IN is shared with the MCP server so a missing token and a
  // rejected one read identically to the agent.
  const { NOT_SIGNED_IN, startStdioServer } = await import("./mcp/index.js");
  const cwd = process.cwd();
  await startStdioServer(
    () => {
      const config = readConfig();
      if (!config) {
        return { error: NOT_SIGNED_IN };
      }
      return {
        url: config.url,
        token: config.token,
        project: currentProject(cwd),
        user: config.user?.name ?? config.user?.email ?? null,
      };
    },
    (slug) => {
      setCurrentProject(cwd, slug);
    },
  );
}

async function statusCmd(opts: { json?: boolean; offline?: boolean }): Promise<void> {
  const payload = await buildStatus({ cwd: process.cwd(), offline: opts.offline === true });
  if (opts.json) {
    console.log(JSON.stringify(payload));
    return;
  }
  if (!payload.signedIn) {
    // `unreachable` is not a sign-in problem: the stored token is untouched
    // and a re-login would only fail against the same unreachable host.
    if (payload.state === "unreachable") {
      console.log(`${payload.url} is unreachable from this machine.`);
      console.log("The stored token is unchanged. Try again once the host is back.");
      return;
    }
    if (payload.state === "token_rejected") {
      console.log(`The stored token was rejected by ${payload.url}.`);
      console.log("Run `serenedge login` again.");
      return;
    }
    console.log("Not signed in. Run `serenedge login`.");
    return;
  }
  const who = payload.user?.name ?? payload.user?.email ?? "unknown user";
  console.log(`Signed in as ${who} at ${payload.url}`);
  console.log(payload.project ? `Project: ${payload.project}` : "No project mapped to this repo.");
}

/** Shape of one entry from `GET /api/agent/projects` (A-080). */
type AgentProject = {
  slug: string;
  name: string;
  status: string;
  roles: string[];
  open_tasks: number;
};

async function fetchProjects(): Promise<AgentProject[]> {
  const config = readConfig();
  if (!config) {
    console.error("Not signed in. Run `serenedge login`.");
    process.exit(1);
  }
  const res = await fetch(`${config.url.replace(/\/$/, "")}/api/agent/projects`, {
    headers: { authorization: `Bearer ${config.token}` },
  });
  if (!res.ok) {
    console.error(`Could not list projects (${res.status})`);
    process.exit(1);
  }
  const { projects } = (await res.json()) as { projects: AgentProject[] };
  return projects;
}

async function projectsCmd(opts: { json?: boolean }): Promise<void> {
  const projects = await fetchProjects();
  const current = currentProject(process.cwd());
  if (opts.json) {
    console.log(JSON.stringify({ current, projects }));
    return;
  }
  if (projects.length === 0) {
    console.log("You are not a member of any project.");
    return;
  }
  for (const p of projects) {
    const mark = p.slug === current ? "*" : " ";
    const roles = p.roles.length > 0 ? ` [${p.roles.join(", ")}]` : "";
    console.log(`${mark} ${p.slug}  ${p.name}${roles}  ${p.open_tasks} open`);
  }
}

async function projectUseCmd(slug: string): Promise<void> {
  const projects = await fetchProjects();
  const valid = projects.map((p) => p.slug);
  if (!valid.includes(slug)) {
    console.error(
      `You are not a member of "${slug}". Your projects: ${valid.join(", ") || "(none)"}.`,
    );
    process.exit(1);
  }
  const key = setCurrentProject(process.cwd(), slug);
  console.log(`${key} -> ${slug}`);
}

function projectShowCmd(opts: { json?: boolean }): void {
  const current = currentProject(process.cwd());
  if (opts.json) {
    console.log(JSON.stringify({ current }));
    return;
  }
  console.log(current ?? "No project mapped to this repo. Run `serenedge project use <slug>`.");
}

function registerMcpServer(): void {
  // Windows: a bare `spawn("serenedge")` is ENOENT (pnpm's global bin holds
  // serenedge.CMD, and Node 20+ refuses to spawn a .CMD without a shell), so
  // the registered command goes through cmd /c.
  const args =
    process.platform === "win32"
      ? ["mcp", "add", "-s", "user", "serenedge", "--", "cmd", "/c", "serenedge", "mcp"]
      : ["mcp", "add", "-s", "user", "serenedge", "--", "serenedge", "mcp"];

  const added = spawnSync("claude", args, { stdio: "inherit" });
  if (added.status === 0) {
    console.log("Registered the serenedge MCP server under user scope.");
    console.log("Restart Claude Code (or reconnect it from /mcp) before the tools appear.");
    return;
  }
  console.log("\nCould not register the MCP server. Run this yourself:");
  console.log(`  claude ${args.join(" ")}`);
}

function installClaudeCode(): void {
  const source = join(PLUGINS_DIR, "claude-code");
  if (!existsSync(source)) {
    console.error(`Plugin files not found at ${source}`);
    process.exit(1);
  }
  const target = join(configDir(), "plugins", "claude-code");
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
  console.log(`Copied the SerenEdge command pack to ${target}`);

  const added = spawnSync("claude", ["plugin", "marketplace", "add", target], {
    stdio: "inherit",
  });
  if (added.status === 0) {
    const installed = spawnSync("claude", ["plugin", "install", "serenedge@serenedge", "-y"], {
      stdio: "inherit",
    });
    if (installed.status === 0) {
      console.log("Registered the plugin with Claude Code.");
      registerMcpServer();
      return;
    }
  }
  console.log("\nRun these to finish (Claude Code was not on PATH or a command failed):");
  console.log(`  claude plugin marketplace add ${target}`);
  console.log("  claude plugin install serenedge@serenedge");
  registerMcpServer();
}

function installCodex(): void {
  const configToml = join(homedir(), ".codex", "config.toml");
  const block = readFileSync(join(PLUGINS_DIR, "codex", "config.toml"), "utf8").trim();
  mkdirSync(dirname(configToml), { recursive: true });
  const current = existsSync(configToml) ? readFileSync(configToml, "utf8") : "";
  if (current.includes("[mcp_servers.serenedge]")) {
    console.log(`${configToml} already has the serenedge MCP server.`);
  } else {
    writeFileSync(configToml, `${current.trimEnd()}\n\n${block}\n`);
    console.log(`Added the serenedge MCP server to ${configToml}`);
  }
  console.log("\nAdd this to your repo's AGENTS.md so the agent knows the workflow:\n");
  console.log(readFileSync(join(PLUGINS_DIR, "codex", "AGENTS.md"), "utf8"));
}

function install(agent: string): void {
  if (agent === "claude-code") {
    installClaudeCode();
  } else if (agent === "codex") {
    installCodex();
  } else {
    console.error(`Unknown agent "${agent}". Try claude-code or codex.`);
    process.exit(1);
  }
}

const program = new Command();
program.name("serenedge").description("SerenEdge delivery platform CLI").version("0.0.0");

program
  .command("login")
  .description("Authorise this machine via the device flow")
  .option("--url <url>", "Base URL of the SerenEdge app", DEFAULT_URL)
  .action(login);

program.command("logout").description("Remove the stored token").action(logout);
program.command("whoami").description("Show the signed-in user").action(whoami);
program.command("mcp").description("Start the MCP server over stdio").action(mcp);

program
  .command("status")
  .description("Report whether this machine is set up and which project this repo maps to")
  .option("--json", "Machine-readable output")
  .option("--offline", "Skip the server check and trust the stored token")
  .action(statusCmd);

program
  .command("projects")
  .description("List the projects you can work in")
  .option("--json", "Machine-readable output")
  .action(projectsCmd);

const project = program
  .command("project")
  .description("Show the project mapped to this repo")
  .option("--json", "Machine-readable output")
  .action(projectShowCmd);
project
  .command("use")
  .argument("<slug>", "Project slug")
  .description("Map this repo to a project")
  .action(projectUseCmd);

const env = program.command("env").description("Environment registry helpers");
env
  .command("check")
  .description("Report which required variables for an environment are missing from this shell")
  .requiredOption("--project <slug>", "Project slug")
  .requiredOption("--env <name>", "Environment name (dev, staging, prod)")
  .option("--url <url>", "Base URL of the SerenEdge app")
  .action(envCheck);
program
  .command("update")
  .argument("<id>", "Update draft id (from the project Updates tab)")
  .description("Fetch a draft client update to rewrite, or post the rewrite back with --set")
  .option("--set <file>", "Post the file's contents as the new body (- for stdin)")
  .option("--url <url>", "Base URL of the SerenEdge app")
  .action(updateCmd);
program
  .command("install")
  .argument("<agent>", "claude-code | codex")
  .description("Install the SerenEdge command pack for a coding agent")
  .action(install);

program.parseAsync().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
