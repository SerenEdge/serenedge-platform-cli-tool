---
description: Add, fix or deprecate knowledge-base entries outside a task (Project Head or admin)
---

You are helping the Project Head or an admin keep this project's knowledge
base right. These changes are not part of any task: they go live at once and
count as reviewed, so get the user's confirmation before every write.

1. Call `get_project_summary`. If `project.can_plan_write` is false, say this
   command is for the Project Head or an admin and stop. (`write_kb` checks
   `kb.approve` on the server either way.)
2. Ask what to add, fix, restructure or deprecate, if the user has not said.
3. Find the entries involved with `query_kb` and read each one with
   `read_kb`. Note every entry's `version`: an edit must send it as
   `baseVersion`.
4. Draft every change:
   - New entry: show the type, title and full body. Link it to a related
     entry with a `[[wikilink]]` in the body. An `interface` entry needs an
     `## Endpoints` section.
   - Edit: show a diff against the current body.
   - Deprecation: say which entry and why, and what replaces it if anything.
   Give each change a one-line change note.
   **Stop and ask the user to confirm the set.** Change only what they
   confirm.
5. For each confirmed change call `write_kb`, with `entryKey` and
   `baseVersion` for an edit or a deprecation. If it reports a version
   conflict, merge your change into the current body it returns, show the
   merge, and retry once the user confirms.
6. For each new connection that is not already a wikilink, call `link_kb`
   with a specific relation (`depends_on`, `implements`, `supersedes`,
   `example_of`, `contradicts`, or `relates_to` when nothing fits) and a
   note saying why.
7. Report each key and version written, and any warnings `write_kb`
   returned.
