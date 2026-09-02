# serenedge

The CLI and MCP server for the [SerenEdge](https://github.com/SerenEdge/serenedge-platform) delivery platform. It's how your coding agent claims, works and submits tasks: `serenedge` signs your machine in once via a device-flow login, then `serenedge install <agent>` wires an MCP server and a command pack into Claude Code or Codex so your agent can talk to your SerenEdge projects directly.

There's no platform AI. Every generative step (drafting a task, planning a revision, writing a knowledge-base proposal, summarising risk) happens inside your own coding agent, under your own subscription. This tool is a thin, open client: every command is a plain HTTP call to your SerenEdge instance's API, authenticated with a token scoped to your account. It holds no server-side logic and no direct database access.

## Install (build from source)

There's no published package yet - build it from this repository. The steps are the same shape on every OS; only how you get Node and pnpm differs.

Two things first, on every OS:

- Node.js 22 or newer
- pnpm 9, enabled through Corepack, which ships with Node

### Windows (PowerShell)

```powershell
# 1. Install Node.js 22+: https://nodejs.org, or:
winget install OpenJS.NodeJS.LTS

# 2. Enable pnpm
corepack enable
corepack prepare pnpm@9.15.9 --activate

# 3. Get the code and build
git clone https://github.com/SerenEdge/serenedge-platform-cli-tool.git
cd serenedge-platform-cli-tool
pnpm install
pnpm build

# 4. Make `serenedge` available everywhere
pnpm link --global
```

If PowerShell says "serenedge is not recognized" afterward, run `pnpm setup` once (it adds pnpm's global bin folder to your PATH) and open a new terminal.

### macOS (Terminal)

```bash
# 1. Install Node.js 22+
brew install node@22
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
# (Intel Macs: /usr/local/opt/node@22/bin instead of /opt/homebrew/...)

# 2. Enable pnpm
corepack enable
corepack prepare pnpm@9.15.9 --activate

# 3. Get the code and build
git clone https://github.com/SerenEdge/serenedge-platform-cli-tool.git
cd serenedge-platform-cli-tool
pnpm install
pnpm build

# 4. Make `serenedge` available everywhere
pnpm link --global
```

No Homebrew? Use nvm instead: install it from [nvm-sh/nvm](https://github.com/nvm-sh/nvm) (its README has the current one-line installer), then `nvm install 22 && nvm use 22` before step 2. If "command not found" after linking, run `pnpm setup`, then `source ~/.zshrc` or open a new terminal.

### Linux (bash/zsh)

```bash
# 1. Install Node.js 22+ - nvm is the most reliable across distros:
#    https://github.com/nvm-sh/nvm (README has the current one-line installer)
#    then, in a new shell:
nvm install 22

# 2. Enable pnpm
corepack enable
corepack prepare pnpm@9.15.9 --activate

# 3. Get the code and build
git clone https://github.com/SerenEdge/serenedge-platform-cli-tool.git
cd serenedge-platform-cli-tool
pnpm install
pnpm build

# 4. Make `serenedge` available everywhere
pnpm link --global
```

Your distro's own package manager (`apt`, `dnf`, ...) often ships an older Node than 22 - nvm avoids that. If "command not found" after linking, run `pnpm setup`, then `source ~/.bashrc` (or your shell's rc file) or open a new terminal.

Verify it worked:

```
serenedge --version
```

Rebuilding after a `git pull` is just `pnpm install` then `pnpm build` again - the global link stays put.

## Usage

Sign in once, then install the command pack for your agent:

```
serenedge login --url https://your-serenedge-instance.example
serenedge install claude-code
```

For Codex, run `serenedge install codex` instead: it merges an MCP server block into `~/.codex/config.toml` and prints an `AGENTS.md` snippet describing the claim, work and submit loop to add to your repo.

For Claude Code, `install claude-code` copies the plugin locally, registers it as a marketplace, and installs it from there (or prints the two commands if Claude Code isn't on your `PATH`). It registers the `serenedge` MCP server and this command pack:

| Command             | What it does                                                        |
| -------------------- | --------------------------------------------------------------------- |
| `/serenedge next`   | Pick the next task, claim and start it, load its full context.      |
| `/serenedge done`   | Run tests, satisfy the definition of done, submit for review.       |
| `/serenedge context` | Load the task's linked knowledge-base entries.                     |
| `/serenedge ask`    | Ask the project knowledge base a question.                          |
| `/serenedge plan`   | Draft or update the task plan (Project Head).                       |
| `/serenedge revise` | Plan revision tasks from a client request (Project Head).           |
| `/serenedge update` | Write a client-facing progress update (Project Head).               |
| `/serenedge risk`   | Write the project risk narrative (Project Head).                    |

Other commands:

| Command                                          | What it does                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `serenedge whoami`                               | Show the signed-in user.                                        |
| `serenedge logout`                               | Remove the stored token.                                        |
| `serenedge mcp`                                  | Start the MCP server over stdio (your agent runs this for you). |
| `serenedge env check --project <slug> --env <n>` | Report which required environment variables are missing.        |
| `serenedge update <id> [--set <file>]`           | Fetch a draft client update to rewrite, or post the rewrite back. |

Every call is authenticated with your device token and checked by the same permission engine as the web app: you only ever see tasks your roles can work. Signed-in devices show up under Settings, Connected devices, on the web app, where you can revoke one at any time.

## Repository layout

```
src/
  index.ts     CLI entry point (login, whoami, install, mcp, env, update)
  config.ts    Reads/writes the local token at ~/.config/serenedge/config.json
  mcp/
    index.ts   The MCP server: wraps the platform's /api/agent/* HTTP API as MCP tools
plugins/
  claude-code/ Command pack + plugin manifest for Claude Code
  codex/       MCP config block + AGENTS.md snippet for Codex
```

This is a standalone mirror of the CLI shipped from [SerenEdge/serenedge-platform](https://github.com/SerenEdge/serenedge-platform) (`packages/cli` and `packages/mcp-server`), split out so it can be built and distributed on its own without the rest of the platform's private source.
