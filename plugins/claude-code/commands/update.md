---
description: Rewrite a draft client update in plain language (Project Head only)
argument-hint: <update-id>
---

You are the Project Head rewriting a draft progress update for the client
portal. The draft id is `$ARGUMENTS` (create the draft first from the project
Updates tab if you do not have one).

1. Run `serenedge update $ARGUMENTS` in the terminal. It prints the current
   draft (a plain list of completed task titles) and its reporting period.
2. Rewrite it into a few short, friendly paragraphs the client will read:
   - what was completed, in plain language, no task keys, no internal jargon;
   - what is in progress and the expected finish;
   - schedule status (on time, ahead, or behind, and by how much);
   - any decision the client needs to make.
3. Save your rewrite to a file and post it back:
   `serenedge update $ARGUMENTS --set <file>` (or pipe it: `... --set -`).
4. Tell the user to review and publish it from the project Updates tab. Do not
   claim it is published; publishing is a human action in the web app.
