---
description: Set up SerenEdge on this machine and map this repo to a project
---

Get this machine ready to work SerenEdge tasks. Do the steps in order and stop
at the first one that fails, telling the user exactly what the error said.

1. Run `serenedge status --json`. If the command is not found, tell the user to
   install the SerenEdge CLI and stop.
   If `superpowers` is `missing`, tell the user the SerenEdge commands need the
   superpowers plugin, show them `claude plugin install superpowers@claude-plugins-official`,
   and stop. `unknown` is fine (it means Claude Code could not be asked).
2. If `state` is `not_signed_in`, run `serenedge login`. Run it with a timeout
   of at least 600 seconds (10 minutes): the device code lives for 10 minutes
   and the default 2 minute command timeout would kill the CLI while the user
   is still in the browser. If that happens after they have already approved,
   the approval succeeds on the server but no token is ever written, and
   `status` still reports `not_signed_in` with nothing to explain it.
   The command prints a URL and a short code and then waits. Show the user the
   URL and the code, tell them they have 10 minutes to approve the device in
   their browser, and wait for the command to finish.
   The CLI defaults to https://platform.serenedge.com. Only pass `--url` if the
   user explicitly asks for a different host.
3. If `state` is `token_rejected`, run `serenedge login` again, with the same
   10 minute timeout. If it is `unreachable`, report the URL and stop: nothing
   else will work.
4. Register the MCP server by running `serenedge install claude-code`. Tell the
   user that Claude Code must be restarted, or the server reconnected from
   `/mcp`, before the SerenEdge tools appear. Do not claim the tools are
   available in this session.
5. Map this repo to a project. If the SerenEdge MCP tools are already available,
   call `list_my_projects`; otherwise run `serenedge projects`. Show the user
   the list with each project's name, roles and open task count, and ask which
   one this repo is. Then call `switch_project`, or run
   `serenedge project use <slug>`.
6. Set up the repo's instructions. If the SerenEdge MCP tools are loaded,
   call `get_project_summary`: `project.can_plan_write` true means you are
   this project's Head. If they are not loaded yet, run `serenedge repo init`
   and read its result instead.
   - Head (`can_plan_write` is true, or `repo init` succeeded): run
     `serenedge repo init` if you have not already. Show the user
     `git status --short -- CLAUDE.md AGENTS.md` and
     `git diff -- CLAUDE.md AGENTS.md` (new files appear only in the status) and ask them to commit both files to
     the default branch, so every developer's agent loads them.
   - If `repo init` reports a broken block, show the message and stop: the
     markers must be fixed by hand.
   - Not a Head (`can_plan_write` is false, or `repo init` said
     `Only a Project Head can initialise this repo.`): run
     `serenedge repo status --json`. If either file is `missing`, `outdated`
     or `malformed`, tell the user to ask their Project Head to run
     `/serenedge:setup`. Do not edit those files yourself.
7. Run `serenedge status` and report the final state in one line.

When this finishes, `/serenedge next` is ready.
