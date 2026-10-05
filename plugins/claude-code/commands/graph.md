---
description: Explore or grow the project knowledge graph
---

Without an argument, ask the developer what topic they want to see, then call
`read_kb` with that entry's key and `depth: 2`. Report what the entry connects
to, grouped by relation, and name anything in the neighbourhood that is marked
`missing`: those are things the project refers to and has never written down.

With `bootstrap`, build an initial graph for this repository:

1. Call `query_kb` a few times to learn what the knowledge base already
   covers. It is the cheaper tool for scanning by type or task, with no
   bodies to read through; fall back to `ask_kb` only for a fuzzy question
   `query_kb` cannot answer directly. Never propose something that already
   exists.
2. Read the repository: the README, the main configuration files, the routes
   or entry points, and any architecture notes. Look for decisions that were
   made, interfaces other code depends on, and conventions the code follows.
3. For each one worth recording, call `propose_kb` with the right type. Keep
   bodies short and factual. New entries go live at once, attributed to the
   task; a convention waits for a `kb.approve` holder. An
   `interface` proposal must carry an `## Endpoints` section, one list item
   per endpoint as `` `METHOD /path` `` followed by a note; an interface that
   is not an HTTP surface still writes the heading, with a line saying it has
   no endpoints.
4. Every entry you create must be connected to something or
   `submit_for_review` refuses the task. The reliable way is a `[[wikilink]]`
   in the entry body pointing at an existing entry, or at another entry you
   are writing in this same pass; this matters most here, since bootstrapping
   an empty KB means there is often no existing entry yet to link from. Call
   `link_kb` too, to connect entries with a relation and a `note` on every
   link.
5. Report what you wrote and linked, and stop. Do not write more than about
   ten entries in one pass: they are live as soon as they are written, and a
   reviewer has to read all of them.

Entries other than conventions and deprecations are live as soon as you write
them, so write only what you can stand behind. Links are also written straight
through, so use them freely, but never create one you cannot explain.
