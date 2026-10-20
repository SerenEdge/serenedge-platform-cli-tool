---
description: Pick up the next SerenEdge task and start working
---

You are working through the SerenEdge delivery platform. Do this in order:

0. Run `serenedge status --json`. If `superpowers` is `missing`, tell the
   user to run `claude plugin install superpowers@claude-plugins-official`
   and stop.
1. Call the `list_my_tasks` MCP tool with no arguments. It returns only the
   tasks in the project this repo is mapped to. If it reports that the repo is
   not mapped to a project, run `/serenedge project` first and stop.
2. If any task has `rework_pending: true`, a reviewer sent it back for
   changes. Tell the user and point them to `/serenedge rework`: it starts
   the rework clock, so do not start it for them here. Stop unless they say to
   pick up something else.
   If one of your tasks is already `in_progress`, that is the task. Otherwise
   choose a task: prefer one already `assigned` to you. If none is, call
   `list_ready_tasks` (it lists unclaimed `ready` tasks, highest points first; on a project without points, soonest due date first,
   which `list_my_tasks` does not) and take the first.
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
6. Build it with superpowers. If the `agent_prompt` ends with a
   `Plan: <path>#<anchor>` line, read that section of the plan document in
   this repo first. Run the superpowers executing-plans skill on the task
   (the plan section, or the agent prompt when there is none) and the
   test-driven-development skill for every change: failing test first. Work
   only on the branch from step 4. Do not touch other tasks.
7. KB entries marked `unreviewed from PROJ-12` (in the bundle's KB index, or
   as `reviewed: false` and `fromTask` in `ask_kb`, `query_kb` and `read_kb`)
   are live writes from another task that is not done yet. Use them, but if
   one disagrees with the code, the code wins.
8. If a later API response reports a `context_version` higher than the one
   you started with, the conventions or knowledge base changed: call
   `get_task` again and re-read the bundle before continuing.

When you are done, the user runs `/serenedge done`.
