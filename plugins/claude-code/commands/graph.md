---
description: Explore or grow the project knowledge graph
---

Without an argument, ask the developer what topic they want to see, then call
`read_kb` with that entry's key and `depth: 2`. Report what the entry connects
to, grouped by relation, and name anything in the neighbourhood that is marked
`missing`: those are things the project refers to and has never written down.

With `bootstrap`, build an initial graph for this repository:

1. Call `ask_kb` a few times to learn what the knowledge base already covers.
   Never propose something that already exists.
2. Read the repository: the README, the main configuration files, the routes
   or entry points, and any architecture notes. Look for decisions that were
   made, interfaces other code depends on, and conventions the code follows.
3. For each one worth recording, call `propose_kb` with the right type. Keep
   bodies short and factual. A `kb.approve` holder reviews them.
4. Call `link_kb` to connect them, with a `note` on every link.
5. Report what you proposed and linked, and stop. Do not propose more than
   about ten entries in one pass: a reviewer has to read all of them.

Entry bodies always go through review. Links are written straight through, so
use them freely, but never create one you cannot explain.
