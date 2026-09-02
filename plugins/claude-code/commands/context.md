---
description: Load the knowledge-base context for the current task
---

Call the `get_context` MCP tool with the current task key. It returns the
knowledge-base entries linked to the task plus every active project
convention (branch naming, commit format, error-code format, architecture
notes). Read them before you write code and follow them exactly.

If you need something that is not in the linked entries, call `ask_kb` with a
question to search the rest of the knowledge base.
