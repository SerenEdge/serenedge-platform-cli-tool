---
description: Pick up a task the reviewer sent back and rework it (starts the rework clock)
argument-hint: [TASK-key]
---

Use this when a reviewer sent one of your tasks back for changes. It is not
`/serenedge revise`, which is for client revision requests. Running this
command **starts the rework countdown**: the reviewer already set how many
hours the rework may take, and the clock runs from the moment you call
`start_rework`. Do not run it until you are ready to work.

1. Pick the task. If `$ARGUMENTS` has a task key, use it. Otherwise call
   `list_my_tasks` and take the task with `rework_pending: true`. If there
   is none, tell the user there is no rework waiting and stop. If there are
   several, list them and ask which one to start.
2. Call `start_rework` with the key. If it fails, tell the user exactly
   what the error said and stop. The response gives `rework_hours`,
   `rework_due_at`, `reviewer_notes`, the branch and git commands, and the
   task `bundle`. Tell the user how long they have and when it is due.
3. Read `reviewer_notes` and the bundle in full. The reviewer's notes are the
   scope of this rework: fix what they ask for and nothing else. If a note is
   unclear, call `ask_task_question` instead of guessing.
4. Check out the existing task branch from the `git` commands (`git fetch
   origin`, `git switch <branch>`). Do not create a new branch and do not open
   a new PR: pushing to the same branch updates the PR that is already open.
5. Rework, then run the project's tests.
6. When the notes are all addressed, the user runs `/serenedge done`. It
   resubmits the task for review and the rework clock stops at that moment.
