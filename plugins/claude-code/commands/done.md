---
description: Finish the current SerenEdge task and submit it for review
---

Run this only when the task is finished properly: the work is complete, the
tests pass and nothing in the definition of done is left. It is not a
checkpoint and not a way to save progress. If the work is not finished, say
what is missing and stop instead of submitting. Submitting stops your clock
and sends the task to a reviewer, so a half-done task wastes their time.

When this is a rework after a reviewer sent the task back (you started it with
`/serenedge rework`), the same steps apply: push to the existing branch, and
the existing PR updates itself instead of a second one being opened.

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
5. Draft the knowledge the work produced and write it.

   For each new interface, decision, convention or UI-system change, call
   `propose_kb`. The write is **live at once**: it is attributed to this task
   and to you, other developers' agents can find it immediately, and the
   reviewer sees it next to your PR and can revert it. Two kinds of change are
   the exception and wait for a `kb.approve` holder before they take effect: a
   change to a `convention`, and any deprecation (`deprecate: true` with
   `entryKey`). The response says `status: "live"` or `status: "pending"`.

   To change an existing entry set `entryKey` **and** `baseVersion`, the
   `version` you saw in `read_kb` or in `draft_kb_context`. If someone changed
   the entry since, the call fails with a conflict naming the current version:
   call `read_kb` again, merge your change into the current body, and resubmit
   with the new `baseVersion`. Never resubmit your old body over it.

   Two rules the `submit_for_review` gate enforces, so getting them right here
   saves a round trip:

   - **Every entry you create must be connected to something.** The reliable
     way is a `[[wikilink]]` in its body pointing at an existing entry, or at
     another entry you are writing in this same task. A `link_kb` edge with the
     new entry as source or target also counts. The entry exists as soon as
     you write it, so its key is final and there is no `-2` suffix to guess.
   - **An `interface` proposal must carry an `## Endpoints` section.** One list
     item per endpoint, in this shape:

     ```
     ## Endpoints

     - `POST /api/auth/login` : email and password, returns a JWT
     - `GET /api/auth/me` : the current user
     ```

     An interface that is not an HTTP surface still writes the heading, with a
     line saying it has no endpoints.

   Call `draft_kb_context` with the task key: it returns your diff, the
   project's existing entries of every active type with their current
   `version`, and a drafter prompt. Draft entries from the diff (set `entryKey`
   and `baseVersion` on one that changes an existing entry instead of
   duplicating it); if the optional AI path is on for this project you can call
   `draft_kb_proposals` instead and review its output. Present your drafts,
   then call `propose_kb` for each one the developer confirms. Because a
   confirmed write is live straight away, do not call it for a draft the
   developer has not confirmed.
   - A `dev` task needs at least one `interface` or `decision` proposal.
   - A `ui` task needs a `ui_system` proposal.
   - A `deploy` task needs an `environment` proposal.
   - If the work genuinely introduces no such change, pass `kbWaiverReason` in
     the next step instead.

Then record how the new knowledge connects. For each entry you wrote, call
`link_kb` with the entries it relates to, a `relation`, and a `note` saying
why they connect. For a convention or deprecation that is still pending, you
can name its predicted key even though it does not exist yet: the link
resolves by itself when it is accepted.

Prefer a specific relation over `relates_to` when one fits: `supersedes` when
this replaces an earlier decision, `implements` when an interface realises a
decision, `depends_on` when one cannot change without the other. If you
cannot write a note explaining the connection, do not create the link.

6. Dependencies. If the work made this task depend on another task's output
   (an interface, a migration, an env var it introduced), or another task now
   depends on yours, say so in the summary under a `Dependencies:` line with
   the task keys. The reviewer records them in the plan.
7. Commit your work (message `<KEY>: short imperative summary`, no AI or agent
   attribution) and push the branch.
8. Open the pull request yourself, do not ask the developer to. The target is
   the task's `target_branch` (normally `dev`), never `main`. First check
   whether this branch already has an open PR (`gh pr list --head <branch>
   --state open`). If it does, the push in step 7 already updated it: report
   its URL and do not open another. If it does not, run `gh pr create --base
   <target_branch> --head <branch>` with the title `<KEY>: <task title>` and a
   body made of your summary from step 3. No attribution lines in the title or
   body. Take the PR URL from the command's output (or `gh pr view --json
   url -q .url`). A pull request is required: the task cannot be submitted
   without one. If `gh` is unavailable or not signed in, give the developer
   the branch name, ask them to open the PR against `<target_branch>` and
   paste its URL back to you, and wait for it before step 9.
9. Call `submit_for_review` with the task key, the summary, the PR URL from
   step 8 as `prUrl` (required: it is the link the reviewer clicks on the
   review card), and `kbWaiverReason` if step 5 found nothing. If the call
   returns a
   "not ready for review" or "unregistered environment variables" error, fix
   each listed item and try again. If it says the task was sent back and needs
   `/serenedge rework` first, tell the user to run that.
10. Tell the user the task is in review, give the PR URL, and note that the
    clock stopped when you submitted.
