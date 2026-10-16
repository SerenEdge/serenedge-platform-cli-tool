---
description: Claim ready SerenEdge tasks, build them and send them to review on your own until you run out or get blocked (Auto Mode)
---

You work through this developer's SerenEdge tasks one after another, without
stopping between them, for as long as you can.

1. Call `get_project_summary`. If `auto_mode` is false, say Auto Mode is off
   for this project, that `/serenedge:next` works one task at a time, and
   stop. Run `serenedge status --json`; if the command itself fails, say so and
   stop. If `superpowers` is `missing`, tell
   the user to run `claude plugin install superpowers@claude-plugins-official`
   and stop.
2. Loop. Never stop to ask which task to take: choosing and claiming is
   part of the job.
   1. Call `list_my_tasks`.
   2. **Rework first.** If a task has `rework_pending: true`, follow every step
      of `/serenedge:rework` for it.
   3. **Otherwise pick a task, in this order:**
      1. a task already `in_progress` for you (finish it);
      2. a task `assigned` to you;
      3. a `ready` task you have not claimed yet: choose the highest-points
         one whose due date is soonest, and **claim it yourself with
         `claim_task`**. Do not wait for the user to claim it, and do not
         limit yourself to tasks already claimed.
      If a `claim_task` call is refused, go to the stop rules below.
   4. **Work it.** Follow every step of `/serenedge:next` from `start_task`
      on: start, read the bundle, build with superpowers (failing test
      first), run the tests.
   5. **Send it to review.** Follow every step of `/serenedge:done`:
      verification, env vars, KB entries and links, dependencies, commit,
      push, PR, `submit_for_review`. Never skip a gate. Waive the KB
      requirement only when the work truly has no KB change, and say why.
   6. Go back to step 2.1 and claim the next `ready` task, until none is left.

   Loop limits: stop and call `flag_blocked` with the reason if
   `submit_for_review` fails and the cause is not fixable by the steps in
   `/serenedge:done`, if the task you just submitted comes back from
   `list_my_tasks` as claimable or unchanged, or if the same task key is
   picked twice in a row. Work at most 10 tasks (new or rework) per run, then
   stop, report, and tell the user to run this command again to continue.
3. Stop when one of these happens:
   - **Nothing is left** to rework, finish or claim (no `ready` task): report and stop.
   - **A claim is refused** (claim cap, an overdue task, join gates): report
     the error and stop.
   - **You cannot go on with the current task:**
     - its next step is a manual step for a person
     - a conflict or a failing check you cannot fix
     - a requirement you cannot resolve with `ask_task_question`
     - access you do not have

     Call `flag_blocked` with the task `key` and a specific `reason`, tell the
     user that the Project Head and reviewers were alerted, and stop.
4. At the end, list the tasks submitted, the reworks done, and any block.

This command never skips a gate and never waives the KB requirement without a
real reason. Do not resolve a conflict by discarding the other side's
changes; keep both intents or flag the block. A manual step in a task means
stop and `flag_blocked`. Your own permission prompts are yours to answer; do
not suggest disabling them.

Each task keeps its own time box. Never touch a task that is not yours, never
commit to the default branch or `dev`, and never add AI attribution.
