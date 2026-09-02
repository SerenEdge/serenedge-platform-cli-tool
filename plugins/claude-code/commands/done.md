---
description: Finish the current SerenEdge task and submit it for review
---

Wrap up the task you have been working on:

1. Run the project's test suite. If tests fail, fix them before continuing;
   do not submit failing work.
2. Make sure every item in the task's `definition_of_done` is satisfied. Call
   `get_task` again if you need to re-read it. Any GitHub-style checkbox left
   as `- [ ]` will block the review transition.
3. Write a short summary (3-6 sentences): what changed, which files, how it
   was tested, and anything the reviewer should look at closely.
4. Environment variables. Scan your diff for new references
   (`process.env.X`, `os.getenv("X")`, `${X}` in compose, `X=` in `.env`
   files). For each one not already in the registry, call `register_env_var`
   with the task key, the name, a description, whether it is a secret, its
   source, and the environments it is required in. If a flagged name is a
   false positive or is owned elsewhere, call `ignore_env_name` with a reason.
5. Knowledge base. Call `draft_kb_context` with the task key: it returns your
   diff, the project's existing `interface`/`decision` entries, and a drafter
   prompt. Draft proposals from the diff (set `entryKey` on one that changes
   an existing entry instead of duplicating it); if the optional AI path is
   on for this project you can call `draft_kb_proposals` instead and review
   its output. Present your drafts, then call `propose_kb` for each one the
   developer confirms.
   - A `dev` task needs at least one `interface` or `decision` proposal.
   - A `ui` task needs a `ui_system` proposal.
   - A `deploy` task needs an `environment` proposal.
   - If the work genuinely introduces no such change, pass `kbWaiverReason` in
     the next step instead.
6. Commit your work and push the branch.
7. Call `submit_for_review` with the task key and the summary (and
   `kbWaiverReason` if step 5 found nothing). If the call returns a
   "not ready for review" or "unregistered environment variables" error, fix
   each listed item and try again.
