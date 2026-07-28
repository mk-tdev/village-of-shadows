# Village of Shadows — project instructions

## Keep `docs/concepts/` in sync with the code (required, not optional)

This project maintains a concept-by-concept learning guide under
[`docs/concepts/`](docs/concepts/README.md), written for someone learning the
agentic-AI-engineering concepts this codebase demonstrates — LangGraph
orchestration, MCP tool-server identity, human-in-the-loop interrupts, SSE
streaming, model-agnostic adapters, persistence, frontend observability, and
so on. Every doc cites real `file:line` locations so the explanation and the
code can be read side by side.

**Whenever a change adds, removes, or edits a feature that touches one of
these concepts, update the relevant doc(s) in the same change** — not as a
follow-up task, not "if there's time." Treat it the same way you'd treat
updating tests after a behavior change: part of the task, not an add-on.
This applies to backend and frontend changes alike.

Concretely, before considering a feature/bugfix task done:

1. **A new mechanism appeared** (new provider, new SSE event, new
   persistence path, new architectural pattern) → add a new section to the
   relevant doc, or a new numbered doc if it's a genuinely distinct concept
   — and add it to `docs/concepts/README.md`'s index.
2. **An existing mechanism's behavior changed** (a redesign, a bug fix that
   changes how something works) → update the doc's explanation, not just a
   code comment. A doc describing the *old* behavior is worse than no doc.
3. **A real bug was found and fixed** → these docs' established style is to
   document it as a "pitfall this project hit" — root cause, symptom, fix —
   not just quietly correct the code. That's often the most useful part of
   the doc for someone learning from it.
4. **Any file the docs cite got edited**, even for an unrelated reason → its
   line numbers may have drifted. Run `grep -n "path/to/file.py:" docs/concepts/*.md`
   (or the `.ts`/`.tsx` equivalent) for every changed file and fix any
   citation that no longer points at the right lines. Don't assume only the
   "obviously relevant" doc cites that file — several docs often cite the
   same file for different reasons.

**Scope note:** this guide covers *agentic-AI-engineering concepts*, not
every UI/product change. A new page, a styling pass, or a form field doesn't
need a doc unless it's demonstrating one of the concepts above. When in
doubt, ask whether a reader trying to learn multi-agent orchestration would
care — if yes, document it.

For a change that touched several files or concepts at once, or when you're
not sure which docs are affected, use the `update-concept-docs` skill for a
structured pass instead of guessing file by file.
