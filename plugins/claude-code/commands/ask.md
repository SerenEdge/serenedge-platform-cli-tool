---
description: Ask the project knowledge base a question
---

Call the `ask_kb` MCP tool with your question (for example "what is the
branch naming convention?" or "how are error codes formatted?"). It defaults
to the project this repo is mapped to; pass `project` only to search a
different one. It runs a hybrid semantic and keyword search and returns the
most relevant entries with their full bodies.

`ask_kb` does not write an answer for you: read the returned entries and
answer from them, staying consistent with what the project has already
decided.

Each returned entry carries a `links` list: the other entries it connects to,
with the relation and the note explaining it. When a link looks like the
answer, call `read_kb` with that key rather than searching again. Searching
twice for the same thing usually means an edge would have taken you there.
