---
description: Show or switch the SerenEdge project this repo is mapped to
---

Show the user which SerenEdge project this repo maps to, and switch it if they
ask.

1. Call `serenedge_status` (or run `serenedge project`) and tell the user the
   current project. If none is mapped, say so.
2. If they want to see the options or switch, call `list_my_projects`. Present
   every project with its name, your roles and open task count, marking the
   current one.
3. When they pick one, call `switch_project` with its slug. It takes effect on
   the next tool call, so no restart is needed. Confirm the new project.

The mapping is per repo, so switching here does not affect any other repo or
any other Claude Code session.
