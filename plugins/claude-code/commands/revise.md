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
   tight - revision scope should not grow past what was asked for.
4. Call `submit_plan` with `apply: false` to validate and preview. Show the
   Project Head the report and iterate.
5. Once approved, either call `submit_plan` with `apply: true` yourself
   (needs `plan.write`), or tell the Project Head to enter the rows from the
   project's `Plan > Revisions > <the request> > Plan tasks` form, which
   marks the tasks `is_revision` and prices them from the reserve
   automatically - `submit_plan` does not set that flag.
