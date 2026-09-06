---
description: Set up SerenEdge on this machine and map this repo to a project
---

Get this machine ready to work SerenEdge tasks. Do the steps in order and stop
at the first one that fails, telling the user exactly what the error said.

1. Run `serenedge status --json`. If the command is not found, tell the user to
   install the SerenEdge CLI and stop.
2. If `state` is `not_signed_in`, run `serenedge login`. It prints a URL and a
   short code and then waits. Show the user the URL and the code, and tell them
   to approve the device in their browser. Wait for the command to finish.
   The CLI defaults to https://platform.serenedge.com. Only pass `--url` if the
   user explicitly asks for a different host.
3. If `state` is `token_rejected`, run `serenedge login` again. If it is
   `unreachable`, report the URL and stop: nothing else will work.
4. Register the MCP server by running `serenedge install claude-code`. Tell the
   user that Claude Code must be restarted, or the server reconnected from
   `/mcp`, before the SerenEdge tools appear. Do not claim the tools are
   available in this session.
5. Map this repo to a project. If the SerenEdge MCP tools are already available,
   call `list_my_projects`; otherwise run `serenedge projects`. Show the user
   the list with each project's name, roles and open task count, and ask which
   one this repo is. Then call `switch_project`, or run
   `serenedge project use <slug>`.
6. Run `serenedge status` and report the final state in one line.

When this finishes, `/serenedge next` is ready.
