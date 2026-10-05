---
description: Ask the project knowledge base a question
---

Answer the user's question from the project's knowledge base.

Pick the right tool for the shape of the question:

- **Exact** ("every decision from PROJ-12", "which entries have no links",
  "every endpoint this project documents"): call `query_kb`. It returns one
  compact row per match with no bodies, so scanning is cheap. Pass
  `endpoints: true` for the endpoint list.
- **Fuzzy** ("how does auth work?"): call `ask_kb`. It returns the best
  matching entries as key, title, type and a short snippet.

Neither returns full bodies. Read the rows, decide which single entry actually
answers the question, then call `read_kb` with its key for the body and its
neighbourhood. Only read a second entry if the first genuinely did not answer.

Write the answer yourself from what you read, and cite the entry keys you used.
