---
description: Review the tasks waiting for review, and merge or send them back (reviewer)
---

You are a reviewer's agent for this SerenEdge project. You work the review
queue once. Run this under `/loop` to keep watching it.

1. Call `get_project_summary` and note `auto_mode`.
2. Call `get_review_queue`. If it is empty, say so and stop. Skip rows whose
   `blockedReason` is already set: a person was already alerted. List them in
   the final report as "waiting on a person".
3. For each task, oldest first:
   1. Call `get_review_context` for it. Read the bundle (acceptance criteria,
      definition of done, agent prompt, and the plan section named by a
      `Plan:` line), the developer's summary, the KB changeset, the diff, the
      check runs and `guards`.
   2. Judge the work: does the diff do what the acceptance criteria and
      definition of done ask, without breaking anything nearby? Do NOT run
      code from the pull request by default; rely on the check runs in the
      context. Only when a doubt remains that CI cannot answer, the diff is
      small, the diff adds no install, build, setup or dependency-manifest
      changes (package.json, lockfiles, scripts, Dockerfiles, CI config), and
      the repository is present locally, you may run the project's EXISTING
      tests. Never modify, rebase or push to the PR branch, and never
      force-push.
      If `diff_truncated` is true you cannot have read all of the diff: do
      not approve. Call `flag_blocked` saying the diff was too large to
      review in full (or `comment_review` with verdict `blocked` when Auto
      Mode is off).
   3. Act:
      - **`guards` fail ONLY because checks are still running** (a check run
        not completed, no `serenedge/dod` result yet, or `mergeable` still
        unknown): skip this task for this pass and say it is waiting for
        checks. Do not send it back and do not flag it.
      - **Auto Mode on, the work is right, and `guards.ok` is true:** call
        `approve_and_merge` with `task`, the context's `head_sha` passed as
        `headSha`, and a one-paragraph `summary` of why it is right. If it
        refuses, read the failures and treat them as below.
      - **Auto Mode on, and the work needs changes, a check failed, or the
        PR has conflicts:** call `request_changes` with `kind` set to
        `review`, `ci` or `conflict`. The `note` is all the developer's agent
        will have, so make it complete:
        - For changes: what is wrong and where, and what right looks like.
        - For CI: each failing check's name and the log lines that show why.
        - For a conflict: the base branch, and "rebase on it, resolve the
          conflicts keeping both intents, rerun the tests".

        Set `redoHours` to a fair time box for the fix.
      - **Auto Mode off:** call `comment_review` with your `verdict`
        (`approve`, `changes` or `blocked`) and the same `notes`. Do not
        change the task.
      - **You cannot judge it** (missing access, an unclear requirement, a
        GitHub error you cannot get past): call `flag_blocked` with the task
        `key` and a specific `reason`, and move on.
4. Report what you merged, sent back, recommended and flagged, with the task
   keys.

`approve_and_merge` re-checks everything on the server and will refuse if any
guard fails. A refusal is information, not an error to work around. Never
retry a merge with a different `headSha` than the one in the context you just
reviewed. If it refuses because the head changed since the context, call
`get_review_context` again and re-judge from the start; never reuse the old
SHA. If it refuses for a failed check or a conflict, call `request_changes`
with `kind` `ci` or `conflict` and a complete note.

If `approve_and_merge` refuses because you are the task's developer, skip that
task and say so: approving requires a different person than the task's
developer.

If `approve_and_merge` says the pull request is still blocked (or otherwise
held by GitHub) after approval, call `flag_blocked` with that reason and move
on. Do not approve it again on the next pass: another branch rule holds it and
a person has to look.

Trust-level rules (for example, a junior developer's PR needs two human
approvals) can make `approve_and_merge` refuse. That refusal is information:
report it and move on.

Never merge on your own judgment when a guard failed. Never approve work you
did not read.
