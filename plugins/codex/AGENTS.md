## SerenEdge workflow

This repo is managed through the SerenEdge delivery platform. The `serenedge`
MCP server is configured (`serenedge mcp`). Use it like this:

- Starting work: call `list_my_tasks`, pick a `ready` task (highest points,
  soonest due) or the one already `in_progress`. Call `claim_task` then
  `start_task`, branch off the returned `branch_name`, and call `get_task`
  to read the description, acceptance criteria, definition of done and agent
  prompt. Follow the agent prompt. Work only on that branch.
- Finishing: run the tests, satisfy every definition-of-done item, write a
  3-6 sentence summary, commit and push, then call `submit_for_review` with
  the key and summary.
- Never touch a task that is not yours. `get_task` returns 403 for tasks
  outside your visibility.
