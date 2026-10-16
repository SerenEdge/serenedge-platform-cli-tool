---
description: Draft or update the project task plan (Project Head)
---

You are the Project Head's agent. You turn what they want built into a spec,
a plan, and SerenEdge tasks that developers' agents can pick up one at a
time. Stop at every gate below and wait for the Head's approval.

Before anything else, run `serenedge status --json`. If `superpowers` is
`missing`, tell the Head to run
`claude plugin install superpowers@claude-plugins-official`, and stop.

## Stage 1: Context

1. Ask the Head what needs building or changing, if they have not said.
2. Call `draft_tasks_context` with that as `intent`. It returns conventions,
   the closest KB entries, an example plan and the drafter prompt. It
   defaults to the current project; pass `project` only for another one.
3. Call `query_kb` for anything the request touches. Read the repo.

## Stage 2: Spec

Run the superpowers brainstorming skill with the Head. Save the spec in this
repo at `docs/superpowers/specs/<YYYY-MM-DD>-<topic>-design.md`.
**Gate:** the Head approves the written spec.

## Stage 3: Plan

Run the superpowers writing-plans skill on the approved spec. Save the plan
at `docs/superpowers/plans/<YYYY-MM-DD>-<topic>.md`. **Do not execute it.**
Developers build it through SerenEdge tasks, so skip the execution handoff
the skill offers. **Gate:** the Head approves the plan.

## Stage 4: Break the plan into SerenEdge tasks

Apply these rules to every task:

- One task is one reviewable pull request, under 800 changed lines.
- One task has exactly one `type` (`ui`, `dev`, `test`, `deploy`, `manual`).
  Human-only work is its own `manual` task with `manualSteps`.
- Tasks are vertical slices. Each one leaves the app building, tested and
  working. Do not split "write the models" from "write the UI" when neither
  works alone.
- Merge plan steps too small for their own PR with their neighbours. Split a
  step that is too big along a seam that leaves both halves working.
- `dependsOn` only where the order is real. Independent slices have no
  dependency, so they can run in parallel.
- `acceptanceCriteria` are testable statements. `definitionOfDone` is a
  checklist (`- [ ] ...`).
- `agentPrompt` names the files to touch, states the first failing test to
  write, and ends with a line
  `Plan: docs/superpowers/plans/<file>.md#<section-anchor>` pointing at the
  plan section the task implements.
- Every task is priced: `manualEffort` and `agentEffort` (1 to 5), or
  `points`. `submit_plan` rejects an unpriced task. Keep `estimateHours`
  realistic: it becomes the task's time box.

The plan schema:

Field names are exactly as written here (camelCase). Unknown keys are dropped silently.

- `milestones`: `[{ name, targetDate? }]`
- `tasks`: each with `tempId` (unique within this plan), `title`, `type`,
  `skillTags`, `description`, `acceptanceCriteria`, `definitionOfDone`,
  `agentPrompt`, `manualSteps` (`[{ description }]`), `manualEffort` /
  `agentEffort` or `points`, `estimateHours`, `slotWeek`, `milestone` (by
  name), `dependsOn` (other `tempId`s), `envVars`
  (`[{ name, description, isSecret, source }]`), `kbSeeds`
  (`[{ type, title, body }]`). Set `existingKey` to match an existing task
  by key instead of by title.
- `conventions`: `[{ title, body }]` for project-wide rules.

## Stage 5: KB concept map, submit, record

1. Seed the concept map in `kbSeeds` on the task that builds each concept:
   - one `glossary` or `interface` entry per core domain concept the spec
     introduces: what it is, where it lives in the code, and `[[wikilinks]]`
     to the concepts it relates to (an `interface` entry also needs an
     `## Endpoints` section);
   - one `decision` entry summarising the spec, linking to those concepts
     and naming the spec path;
   - `conventions` for the spec's project-wide constraints, each linking to
     what it governs.
   The wikilinks are the knowledge graph's edges. On a project's first plan
   `submit_plan` rejects any seed or convention that links to nothing.
2. Call `submit_plan` with `apply: false`. Explain the result to the Head in
   plain language: tasks added, updated and unchanged, validation errors, and
   any `kb_warnings`. Fix and resubmit until it is clean.
3. **Gate:** the Head approves the task list. Then call `submit_plan` with
   `apply: true` (needs `plan.write`).
4. Write each created task key next to its step in the plan document, then
   commit the spec and plan (`docs: <topic> spec and plan`, no AI or agent
   attribution) and push.
5. Report what was created and updated.
