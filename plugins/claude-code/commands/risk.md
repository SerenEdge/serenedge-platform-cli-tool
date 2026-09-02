---
description: Write the project risk narrative (Project Head only)
argument-hint: <project-slug>
---

You are the Project Head. `$ARGUMENTS` is the project slug.

1. Call `get_risk_context` with that slug. It computes a fresh risk summary
   (stale in-review tasks, over-capacity developers, the longest blocked
   chain, overdue tasks, KB entries that may be out of date) and returns a
   `summaryId`, the `signals`, and a `narrativePrompt`.
2. Write a short narrative from the signals:
   - The top risks to delivery, each with a likelihood and an impact.
   - What is being done about each one.
   - One paragraph of overall outlook.
   Ground every claim in the actual signals - do not invent risks the data
   does not show.
3. Call `submit_risk_narrative` with that `summaryId` and your narrative. It
   appears on the project Overview's Risk summary card.
