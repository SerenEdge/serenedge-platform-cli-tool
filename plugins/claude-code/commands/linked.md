---
description: Answer from the knowledge bases of projects linked to this one (read only)
---

Answer the user's question from the knowledge bases of the projects linked to
this one, for example the backend's API routes while you work on its mobile
app. Linked knowledge is read only: you can search and read it, never write
it.

1. Call `list_linked_projects`. If it lists none, say this project has no
   linked projects (a system admin links them on the Projects page) and stop.
   If the user gave no question, show each linked project with the entry
   kinds it shares and stop.
2. Pick the tool for the question:
   - **Endpoints** ("how do I call the login API?", "what routes does the
     backend have?"): call `linked_endpoints` with the linked project's slug.
   - **Anything else**: call `ask_linked_kb` with the question. Pass `linked`
     to search one project when the user named it.
3. Read the hit that answers the question with `read_linked_kb` (its project
   slug and key). Follow an edge with another `read_linked_kb` only if the
   first entry did not answer. Read a second hit only when you must.
4. Write the answer yourself and cite each entry you used as `slug:key`.
   Say when an entry is marked unreviewed (`reviewed: false`): it comes from a
   task in that project that is not done yet, so its code may still change.
5. If the linked KB does not answer it, say so. Do not guess another
   project's behaviour. Suggest the user raise it with that project's Head.

Never call `propose_kb`, `write_kb` or `link_kb` for a linked project. If
knowledge from a linked project matters to work here, record it in this
project's own KB through your task (`propose_kb`), citing the `slug:key` it
came from. A linked project's conventions are its rules, not this repo's.
