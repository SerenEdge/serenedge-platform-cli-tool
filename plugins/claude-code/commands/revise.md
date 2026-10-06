---
description: Draft tasks for a client revision request (Project Head)
argument-hint: <REV-key> [project-slug]
---

You are the Project Head turning a client revision request into tasks.
`$ARGUMENTS` is the request key, optionally followed by a project slug (e.g.
`REV-3` or `REV-3 acme`). Without a slug, it defaults to the project this
repo is mapped to.

1. Call `get_revision` with the key (and the project slug if one was given).
   Read the title, description, and any attachment note - this is the
   intent.
2. Call `draft_tasks_context` with the revision's description as the intent
   (and the project slug if one was given). It returns the project's
   conventions, the closest KB entries, an example plan, and the drafter
   prompt.
3. Using that context, draft a small set of plan-schema tasks (title, type,
   agent prompt, acceptance criteria, rough manual/agent effort). Keep it
   tight - revision scope should not grow past what was asked for. Every task
   must be priceable: give it `manualEffort` and `agentEffort` (1 to 5) or a
   `points` value. A task without them is rejected, because an unpriced task
   earns nothing. Only new tasks belong in a revision plan.
4. Call `submit_plan` with `apply: false` and `revision` set to the request key
   (for example `REV-3`) to validate and preview. Show the Project Head the
   report and iterate.
5. Once approved, call `submit_plan` again with `apply: true` and the same
   `revision` key (needs `plan.write` and `revision.plan`). The tasks are
   created as revision tasks (revision points, paid from the revision budget),
   and the request moves to planned. Each task you add lowers the revision
   point rate for all revision tasks. Do not leave `revision` out: without it the tasks count
   against the main budget and dilute the main point value. If the Project Head
   prefers, they can enter the rows from the project's
   `Head > Client requests > <the request> > Plan tasks` form instead, which
   does the same.
