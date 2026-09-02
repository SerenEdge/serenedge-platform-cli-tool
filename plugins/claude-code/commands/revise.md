---
description: Draft tasks for a client revision request (Project Head)
argument-hint: <project-slug> <REV-key>
---

You are the Project Head turning a client revision request into tasks.
`$ARGUMENTS` is the project slug followed by the request key (e.g.
`acme REV-3`).

1. Call `get_revision` with that project and key. Read the title,
   description, and any attachment note - this is the intent.
2. Call `draft_tasks_context` with the project slug and the revision's
   description as the intent. It returns the project's conventions, the
   closest KB entries, an example plan, and the drafter prompt.
3. Using that context, draft a small set of plan-schema tasks (title, type,
   agent prompt, acceptance criteria, rough manual/agent effort). Keep it
   tight - revision scope should not grow past what was asked for.
4. Call `submit_plan` with `apply: false` to validate and preview. Show the
   Project Head the report and iterate.
5. Once approved, either call `submit_plan` with `apply: true` yourself
   (needs `plan.write`), or tell the Project Head to enter the rows from the
   project's `Plan > Revisions > <the request> > Plan tasks` form, which
   marks the tasks `is_revision` and prices them from the reserve
   automatically - `submit_plan` does not set that flag.
