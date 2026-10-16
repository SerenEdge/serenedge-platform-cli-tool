## SerenEdge

This repo is the **{{name}}** project on the SerenEdge delivery platform
({{url}}/projects/{{slug}}). Task keys look like `{{key}}-12`. The `serenedge`
MCP server is configured (`serenedge mcp`).

### How work happens here

- All work is a SerenEdge task. Start: call `list_my_tasks`, pick the task
  already `in_progress`, else one `assigned` to you, else the highest-points
  `ready` task due soonest. Call `claim_task`, then `start_task`, branch off
  the returned `branch_name`, then `get_task` and read the whole bundle.
- Use the superpowers skills (required): follow the task's plan section if
  its agent prompt has a `Plan:` line, write the failing test first, and run
  the full test suite before submitting.
- Finish: satisfy every definition-of-done item, register new env vars
  (`register_env_var`), write the KB entries the work produced
  (`propose_kb`), commit (`<KEY>: short imperative summary`, no AI or agent
  attribution), push, open the PR into the task's `target_branch` with
  `gh pr create`, then call `submit_for_review` with the key, a 3 to 6
  sentence summary and the PR URL.
- Never commit to the default branch or `dev`. Never touch a task that is not
  yours.
- If you cannot go on, call `flag_blocked` with a specific reason. Reviewers
  use `get_review_queue`, `get_review_context`, `approve_and_merge` (Auto
  Mode), `request_changes` (Auto Mode) and `comment_review`.

### Knowledge base

- The KB is the project's record. Search it (`query_kb`, `ask_kb`) before
  designing anything and read what you rely on (`read_kb`).
- Record what lands: `interface`, `decision`, `ui_system`, `environment`.
  Every new entry links to a related one with a `[[wikilink]]`. To edit an
  entry pass its `entryKey` and the `baseVersion` you read.
- Project Head or admin: `write_kb` changes the KB outside any task (live and
  reviewed). Developers use `propose_kb` inside a task.
- Conventions are rules. An entry marked unreviewed (`reviewed: false`) is
  usable, but the code wins if they disagree.

### Rules

- Manual steps in a task are for a person. Do not perform them.
- Never commit secrets or `.env` files. No new dependencies without asking.
