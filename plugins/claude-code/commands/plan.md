---
description: Draft or update the project task plan (Project Head)
---

You are the Project Head. Interview the Project Head about what needs
building (or updating), read the repo for context. If they gave you a short
description rather than full detail, call `draft_tasks_context` with that
description as `intent` first - it returns conventions, the closest KB
entries, an example plan, and the drafter prompt to work from. Then produce a
plan in the SerenEdge JSON schema:

- `milestones`: `[{ name, target_date? }]`
- `tasks`: each with `temp_id` (unique within this plan), `title`, `type`
  (`ui` | `dev` | `test` | `deploy` | `manual`), `skill_tags`, `description`,
  `acceptance_criteria` (testable), `definition_of_done`, `agent_prompt`
  (concrete: name files/paths), `manual_steps` (`[{ description }]`),
  `manual_effort` / `agent_effort` (1-5, for computed points) or an explicit
  `points`, `estimate_hours`, `slot_week`, `milestone` (by name),
  `depends_on` (other tasks' `temp_id`s in this plan), `env_vars`
  (`[{ name, description, is_secret, source }]`), `kb_seeds`
  (`[{ type, title, body }]` for KB entries this task should seed).
  Set `existing_key` on a task to match it against an existing task by key
  instead of by title.
- `conventions`: `[{ title, body }]` for project-wide KB entries.

Call the `submit_plan` MCP tool with `project` (the slug), your `plan`, and
`apply: false`. It returns validation errors (if any - fix them and resubmit)
or a diff: which tasks are new, which match an existing task and would
change, and which are unchanged. Show this report to the Architect in plain
language and iterate on the plan until they are happy.

Once they approve, call `submit_plan` again with `apply: true` (this needs
`plan.write`). It creates or updates the tasks, wires up `depends_on`,
registers the env vars, and seeds the KB entries and conventions. Report back
what was created and what was updated.
