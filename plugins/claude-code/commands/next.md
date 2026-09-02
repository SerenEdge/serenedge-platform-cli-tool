---
description: Pick up the next SerenEdge task and start working
---

You are working through the SerenEdge delivery platform. Do this in order:

1. Call the `list_my_tasks` MCP tool.
2. If one of your tasks is already `in_progress`, that is the task. Otherwise
   choose a `ready` or `assigned` task: prefer one already `assigned` to you,
   then the highest-points `ready` task whose due date is soonest.
3. If the chosen task is `ready`, call `claim_task` with its key. If that
   fails (claim cap reached, an overdue task in hand, join gates not
   accepted), tell the user exactly what the error said and stop.
4. Call `start_task` with the key. Use the `branch_name`, `target_branch` and
   `git` commands it returns to create your working branch.
5. Call `get_task` with the key. Its response includes a `bundle` (one
   markdown document with the task, acceptance criteria, definition of done,
   agent prompt, manual steps, dependencies, and the branch/git workflow) and
   a `context_version`. Read the whole bundle. Manual steps are human-only:
   do not perform them yourself.
6. Follow the task's `agent_prompt`. Work only on the branch from step 4. Do
   not touch other tasks.
7. If a later API response reports a `context_version` higher than the one
   you started with, the conventions or knowledge base changed: call
   `get_task` again and re-read the bundle before continuing.

When you are done, the user runs `/serenedge done`.
