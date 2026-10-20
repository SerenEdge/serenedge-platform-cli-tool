---
description: Open the release PR from dev into main, and find the culprit when its CI fails (Project Head)
argument-hint: [project-slug]
---

You are the Project Head's agent for a release: `dev` into `main`. Only the
Project Head, the project owner or an admin may run this; the tools refuse
anyone else, and if they do, say so and stop. `$ARGUMENTS`, if given, is the
project slug; without it, this uses the project this repo is mapped to.

Never merge the release PR yourself. A person merges it on GitHub, and it
must be merged with a **merge commit**, never a squash or rebase merge: a
squash or rebase merge leaves `dev`'s commits out of `main`'s history, so
`main...dev` never advances its merge base and every later release would
list the old merges again. Say this to the Head whenever the release is
ready to merge.

## 1. Status

Call `get_release_status`. It returns `release` (the open release PR, or
null), `checks` (the GitHub check runs on its head), `merges_since_last`
(the merge commits on `dev` since the last merged release, oldest first,
each with `sha`, `parent_sha`, `task_key` and the task's latest full local
CI `report`) and `waiting_for_fixes`.

- **No open release:** show the Head the tasks in `merges_since_last` and
  ask whether to open a release PR. Only on a yes, call `open_release_pr`.
  It refuses when `dev` has nothing new for `main`; tell the Head why. Then
  stop: GitHub Actions runs on the new PR, once. Run this command again when
  it finishes.
- **`waiting_for_fixes` is not empty:** show the Head "Waiting for fixes:"
  and those fix task keys. They are the open fix tasks of CI escapes on
  this release. The release PR tracks `dev`, so its CI runs again once they
  are merged. The Head may instead revert the culprit merge on `dev` by
  hand; that is their call. Stop.
- **Checks still running:** say so and stop.
- **Every check passed:** tell the Head the release PR is ready for a
  person to merge on GitHub with a merge commit, with its link. Stop.
- **A check failed:** go on to step 2.

## 2. Find the culprit (spec 9.2)

The platform cannot run CI, so you run it here, on the Head's machine.

1. Read the failing check from `checks` (its name, `summary` and
   `details_url`) and name the failing job and step. That step is what you
   compare against below: a local run "fails the same step" when
   `serenedge ci` reports `CI failed at <that step>`.
2. Make sure this repo is clean (`git status --porcelain` is empty) and run
   `git fetch origin` so every sha below is present.
3. Run `serenedge ci --dry-run --at <sha>` on the merge commits in
   `merges_since_last` (oldest first). Each run checks the commit out in a
   throwaway detached worktree and uploads nothing. Bisect:
   - First run it on the last merge commit. If it passes, nothing fails
     locally: go to the decision table with `githubOnly` true.
   - Otherwise binary search the list for the first merge commit that fails
     the same step, then run it on that commit's `parent_sha` to confirm the
     parent passes. Record `mergeFails` and `parentPasses`.
4. Find the culprit task's head as it was when its PR merged, and test it:
   - **A merge commit (two parents):** the task head is the merge commit's
     second parent (`git rev-parse <sha>^2`). Run
     `serenedge ci --dry-run --at <that sha>` and record `taskHeadFails`
     (fails the same step). `report` in `merges_since_last` is the task's
     latest full report, which may be for an older head (after a rebase that
     only had a quick run, for example): `reportPassed` is true only when
     `report.head_sha` equals that second parent and `report.passed` is
     true. A missing report, or one for another head, counts as not passed.
   - **A squash commit (one parent):** the task's own head is not in the
     history, so the commit itself is the task's change. Its result from
     step 3 is `taskHeadFails`, tested against its `parent_sha` as above, and
     `reportPassed` is `report.passed` (false when there is no report). Tell
     the Head the verdict rests on the squash commit, not the task's branch.

## 3. Decision table

Apply these rules in order (the same rules as the platform's
`culpritVerdict`):

| Finding | Verdict | What happens |
|---|---|---|
| Nothing fails locally, only on GitHub (`githubOnly`) | `environment` | An environment difference or a flake. No penalty. Draft a fix task that makes local CI match the workflow, marked `ciChange`. |
| A culprit needs both: the merge commit FAILS the same step AND its parent PASSES. If either is false (the merge passes, or the parent fails too) | `not_culprit` | This merge is not the cause. Keep bisecting earlier, or tell the Head nothing was found. |
| The merge fails, its parent passes, the task head fails the same step, and its report passed | `escape` | The report was false: a CI escape. |
| The merge fails and its parent passes, but the task head passes, or the task head fails while its report did not pass or is missing | `interaction` | No penalty. Two tasks clash (or the report never vouched for that head). Draft a fix task. |

## 4. Confirm with the Head

Show each finding to the Head: the failing step, the culprit merge commit
and task key, every `serenedge ci` result you ran, and the verdict. Wait for
the Head to **confirm** or **waive** it (a waiver needs a reason). Write
nothing before that.

Only after the Head confirms:

- **`escape`:** ask the Head how many hours the fix may take (its time
  box), then call `report_ci_escape` with `{ task, releasePrUrl,
  failingStep, evidence, fixHours }` (`releasePrUrl` is the open release's
  `pr_url`; evidence: the commands you ran and their results). It records
  the strike, takes back the project's share of the task's credited points
  (on projects with points), and creates the linked fix task
  `<KEY>-fix`, worth 0 points and in progress for the same developer. Show
  the Head the `message` it returns. When `fix_assigned` is false the
  developer has left the project: the fix task is unassigned, and the Head
  assigns it and sets its points on the board. The Head can waive a
  recorded escape later from the task dialog on the board.
- **`interaction` or `environment`:** draft the fix task through
  `/serenedge:plan`, with the failing step and the evidence in its
  description (`ciChange` for an environment fix).

A waived finding writes nothing. A task that already shipped to `main` in an
earlier release gets its fix on `dev` like any other; it ships in the next
release. A hotfix straight to `main` is the Head's own call and not part of
this command.
