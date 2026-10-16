---
description: Draft tasks for a client revision request (Project Head)
argument-hint: <REV-key> [project-slug]
---

You are the Project Head turning a client revision request into tasks.
`$ARGUMENTS` is the request key, optionally followed by a project slug (e.g.
`REV-3` or `REV-3 acme`). Without a slug, it defaults to the project this
repo is mapped to.

0. Run `serenedge status --json`. If `superpowers` is `missing`, tell the user
   to run `claude plugin install superpowers@claude-plugins-official` and
   stop.
1. Call `get_revision` with the key (and the project slug if one was given).
   Read the title, description, and any attachment note - this is the
   intent.
2. Call `draft_tasks_context` with the revision's description as the intent
   (and the project slug if one was given). It returns the project's
   conventions, the closest KB entries, an example plan, and the drafter
   prompt.
3. Plan the revision with superpowers, scaled to its size. For anything
   beyond a small change, run the brainstorming skill and save a spec at
   `docs/superpowers/specs/<YYYY-MM-DD>-<rev-key>-design.md`. Then run
   writing-plans and save the plan at
   `docs/superpowers/plans/<YYYY-MM-DD>-<rev-key>.md`, without executing
   it. A small revision may skip the spec. Get the Head's approval at each.
   Break the plan into tasks with the rules in `/serenedge:plan` stage 4
   (one PR each, one type, vertical slices, a `Plan:` line in every
   `agentPrompt`). Keep it tight: revision scope does not grow past what
   was asked for. Every task must be priceable: `manualEffort` and
   `agentEffort` (1 to 5) or `points`. Only new tasks belong in a revision
   plan. Add `kbSeeds` for any new concept, wikilinked to the existing
   entries it relates to.
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
6. Write the created task keys into the plan document and commit the spec
   and plan.
