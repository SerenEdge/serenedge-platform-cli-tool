## SerenEdge

This repo is the **{{name}}** project on the SerenEdge delivery platform
({{url}}/projects/{{slug}}). Task keys look like `{{key}}-12`.

### How work happens here

- All work is a SerenEdge task. Run `/serenedge:next` to claim and start one,
  `/serenedge:done` to submit it, and `/serenedge:rework` when a reviewer sends
  it back. Do not start work that has no task. `/serenedge:auto` works
  through your tasks on its own when the project's Auto Mode is on.
- Reviewers run `/serenedge:review` to review, merge or send back what is
  waiting.
- Build every task with the superpowers plugin (required): executing-plans for
  the steps, test-driven-development for the code, and
  verification-before-completion before `/serenedge:done`.
- Once the project has `.serenedge/ci.json`, run `serenedge ci` before every
  submit and read its output (until then run the project's tests as before).
  After a rebase send-back (note starts `Rebase:`) `serenedge ci --quick` is
  enough. Never edit CI files (`.serenedge/ci.json`, the local CI script,
  workflows) unless the task is a CI change.
- Work only on the branch `start_task` gives you (`task/<KEY>-<slug>`, or
  `issue/<KEY>-<slug>` for an issue task). Never commit to the default branch
  or `dev`. Commit messages are `<KEY>: short imperative summary`, with no AI
  or agent attribution.

### Knowledge base

- The KB is the project's record. Before designing anything, search it
  (`query_kb`, `ask_kb`) and read the entries you rely on (`read_kb`).
- When work lands, record it: `interface` for APIs and module boundaries,
  `decision` for choices made, `ui_system` for UI patterns, `environment` for
  configuration. Every new entry links to a related one with a `[[wikilink]]`.
- Conventions are rules. Follow them exactly.
- An entry marked unreviewed comes from a task that is not done yet. Use it,
  but the code wins if they disagree.
- Linked projects: a system admin can link this project to others (a backend
  and its app, say). Their shared KB entries are read only here. Ask with
  `/serenedge:linked`, or `ask_linked_kb`, `read_linked_kb` and
  `linked_endpoints`; cite them as `slug:key`. Their conventions are not
  rules for this repo.

### Rules

- Manual steps in a task are for a person. Do not perform them.
- If you cannot go on with a task, call `flag_blocked` with the reason
  instead of guessing.
- Every environment variable the code reads gets registered
  (`/serenedge:done` does this).
- Never commit secrets or `.env` files.
- Project Head only: `/serenedge:plan`, `/serenedge:revise`,
  `/serenedge:update`, `/serenedge:risk`, `/serenedge:kb`.
