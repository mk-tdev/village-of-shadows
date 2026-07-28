---
name: update-concept-docs
description: Sync docs/concepts/ (this project's agentic-AI-engineering learning guide) with a recent code change — checking which docs cite the touched files, fixing drifted file:line citations, updating stale explanations, adding new sections/docs for genuinely new concepts or bugs, and keeping README.md's index accurate. Use after implementing a feature, fixing a bug, or making any change that touches LangGraph orchestration, MCP, SSE streaming, adapters, persistence, or frontend observability — or whenever unsure which docs a change affects.
user-invocable: true
---

# update-concept-docs

`docs/concepts/` is a hand-written, numbered learning guide (see
`docs/concepts/README.md` for the index) explaining the agentic-AI-engineering
concepts this codebase demonstrates. Every doc cites real `file:line`
locations and is meant to be read next to the actual code. This skill keeps
that guide from drifting out of sync as the code changes — the failure mode
it prevents is a doc that confidently explains behavior the code no longer has.

## When to run this

- After implementing a feature or fixing a bug that touches an existing
  documented concept (orchestrator, graph nodes, MCP server/adapters,
  SSE/streaming, persistence, frontend observability hook/debug panel).
- After a change spans several files and you're not sure which docs, if any,
  are affected.
- As a dedicated sync pass if `docs/concepts/` hasn't been touched in a
  while relative to the code (check `git log` on `docs/concepts/` vs. the
  rest of the repo).

Skip it for pure product/UI changes that don't demonstrate an
agentic-engineering concept (a new page, a styling pass, a form field) —
see the scope note in the root `CLAUDE.md`.

## Procedure

**1. Scope the change.** Get the list of changed files — `git diff
--name-only` against the base you're comparing to (last commit, or the
start of the session if uncommitted). Skip straight to step 2 with that
list; don't try to remember what changed from conversation context alone,
since compaction or a long session can lose detail.

**2. Find every doc that cites a changed file.** For each changed file, run:

```bash
grep -rln "$(basename FILE):" docs/concepts/*.md
```

Don't rely on skimming each doc's `**Files:**` header — that header lists the
*primary* files a doc is about, but citations to a given file often show up
in *other* docs too (e.g. `orchestrator.py` is cited by docs 03, 07, 08, and
09, not just one "orchestrator doc"). A file with zero doc hits means either
nothing in `docs/concepts/` covers it yet (fine, if it's not concept-worthy)
or a new concept doc is needed (see step 4).

**3. For each doc that came up, re-verify against the current source —
don't assume the old citation is still right.** For every code block quoted
in the doc:
   - Read the current file at roughly that location.
   - If the quoted snippet no longer matches verbatim, decide: did the
     *mechanism* change (update the surrounding prose too), or just line
     numbers shift (fix the `([file.py:N-M])` citation only)?
   - A quick way to catch drifted citations in bulk: `grep -n "\.py:" docs/concepts/*.md`
     and `grep -n "\.tsx\?:" docs/concepts/*.md`, then spot-check the ones
     touching changed files.
   - Prose that describes *behavior* (not just quoting code) needs the same
     scrutiny — a citation can be numerically correct while the explanation
     above it describes a since-changed behavior.

**4. Decide whether this needs a new section or a new doc.** Use judgment,
not a fixed rule:
   - A **variant or extension** of something already documented (e.g. a new
     provider in an existing adapter pattern, a new field following an
     existing "why it's not in GameState" pattern) → add a paragraph or
     subsection to the existing doc, cross-referencing the earlier doc that
     established the pattern (`[07](07-pausing-with-interrupt.md)`-style
     links).
   - A **genuinely new mechanism or architectural pattern** with no existing
     home → a new numbered doc, following the existing style: `**Files:**`
     header, the problem it solves, the actual code with citations, and why
     it's built that way. Add it to `docs/concepts/README.md`'s numbered
     index with a one-line description, and update the "read them in order"
     framing if the new doc changes the recommended reading path.
   - **Don't create a new doc for its own sake** — if it fits naturally as a
     section in an existing doc, prefer that; a sprawling set of thin docs
     is worse than a few thorough ones.

**5. If a real bug was found and fixed as part of this change, document it
as a pitfall, not just a silent fix.** This is this guide's established
style (see doc 05's "double mount" section, doc 07's interrupt-ordering
section, doc 09's shared-queue race, doc 10's stale-ref drag bug) — a
"Bug/pitfall this project hit" subsection with: what the symptom looked
like, the root cause, why it's a general lesson (not just "oops, typo"), and
the fix. These sections are often the most valuable part of the doc for a
learner, so don't skip them in favor of only describing the "correct"
end state.

**6. Update `docs/concepts/README.md`'s index** if a doc's scope changed
enough that its one-line description no longer represents it — e.g. a doc
that gained a whole new section on a bug it hit should mention that in its
index line, the way doc 09's entry mentions "and a second catch-up-on-connect
fix" rather than just describing the original broadcast fix.

**7. Read every edited doc once, start to finish, for coherence** before
finishing — check that new sections don't contradict older ones, headings
still make sense in order, and cross-references (`[07](07-...)`-style links)
point at sections that still exist.

**8. Final sweep for stragglers.** Re-run the `grep` from step 2 across
*all* changed files one more time — it's easy to fix the citations in the
"obviously relevant" doc and miss a passing mention in another. If nothing
in `docs/concepts/` should have changed for this task (a pure UI change, a
dependency bump), say so explicitly rather than silently skipping — that's
a valid outcome of running this skill, not a failure to find something.

## What "done" looks like

- Every doc that cited a changed file has been re-checked against current
  source, not just grepped.
- No stale `file:line` citations remain for files touched in this change.
- Any newly-introduced concept or fixed bug has a home in the docs,
  written in this guide's existing voice (precise, code-grounded, explains
  *why*, not just *what*).
- `docs/concepts/README.md`'s index is still an accurate map of what's in
  each doc.
