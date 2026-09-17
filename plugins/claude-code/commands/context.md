---
description: Load the knowledge-base context for the current task
---

Call the `get_context` MCP tool with the current task key. It returns the
knowledge-base entries linked to the task plus every active project
convention (branch naming, commit format, error-code format, architecture
notes). Read them before you write code and follow them exactly.

The response also carries a `map`: a one-hop view of what the task's entries
connect to, as `from`, `to` and `relation`. Read the map before opening
anything else. It tells you which parts of the knowledge base this task
actually touches.

If you need something the map does not cover, call `ask_kb` with a question,
then `read_kb` to follow the edges it returns.
