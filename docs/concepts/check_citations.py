#!/usr/bin/env python3
"""Verify that every `file:line` citation in docs/concepts/ still points at the
code it claims to.

Run from the repo root:

    python docs/concepts/check_citations.py

Why this exists: these docs cite real line numbers so the explanation can be
read next to the code, and inserting a few lines anywhere in a cited file
silently shifts every citation below it. Checking only that a range is
*in bounds* is not enough -- a stale citation stays in bounds and quietly points
at the wrong function, which is worse than no citation at all because a reader
trusts it. This project shipped that exact drift twice before this script
existed.

So the check is content-aware. For each citation preceded by a fenced code
block, it takes an "anchor" line from that block and asserts the line really
appears inside the cited range. Citations with no adjacent code block (prose
references like "see `_sync` (nodes.py:33-70)") are only bounds-checked, since
there is no quoted text to match against.

Exact line matching alone is too strict: some blocks deliberately rewrap a
docstring or prettify a diagram (doc 02 renders `[x]*` as `⟲`), which is a
reasonable thing for prose to do and not evidence of drift. So a failed exact
match falls back to word overlap against the cited range -- a genuinely stale
citation points at unrelated code, where the shared vocabulary collapses,
while a reformatted quote still shares nearly all of it.

Exit code is non-zero if anything is stale, so it can gate a commit.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

DOCS = Path(__file__).parent
ROOT = DOCS.parent.parent

CITATION = re.compile(r"\[([\w./-]+\.(?:py|ts|tsx)):(\d+)(?:-(\d+))?\]\(([^)]+)\)")

# Lines too generic to prove anything by matching -- present in half the file.
UNINFORMATIVE = {
    "", "...", "}", "})", "});", ")", "):", "return", "else:", "try:", "{",
    "*/", "/*", "#", "//", "await conn.commit()", "return res.json();",
}


def anchors(block: list[str]) -> list[str]:
    """Lines from a quoted code block worth searching for."""
    out = []
    for raw in block:
        line = raw.strip()
        if line in UNINFORMATIVE or len(line) < 8:
            continue
        if line.startswith(("#", "//", "*", '"""', "'''")):
            continue  # comments drift in wording; match real code
        out.append(line)
    return out


WORD = re.compile(r"[A-Za-z_][A-Za-z0-9_]{2,}")


def overlap(block: list[str], cited: list[str]) -> float:
    """Fraction of the quoted block's vocabulary that appears in the cited
    range. Tolerates rewrapping and cosmetic rewrites; collapses to near zero
    if the citation actually points somewhere else."""
    want = {w.lower() for line in block for w in WORD.findall(line)}
    if not want:
        return 1.0
    have = {w.lower() for line in cited for w in WORD.findall(line)}
    return len(want & have) / len(want)


def preceding_block(lines: list[str], index: int) -> list[str]:
    """The fenced code block immediately above the citation on `index`, if any.
    Allows a blank line between the fence and the citation."""
    i = index - 1
    while i >= 0 and not lines[i].strip():
        i -= 1
    if i < 0 or not lines[i].startswith("```"):
        return []
    end = i
    i -= 1
    start = None
    while i >= 0:
        if lines[i].startswith("```"):
            start = i
            break
        i -= 1
    return lines[start + 1 : end] if start is not None else []


def main() -> int:
    problems: list[str] = []
    checked = matched = bounds_only = fuzzy = 0

    for doc in sorted(DOCS.glob("*.md")):
        lines = doc.read_text().splitlines()
        for n, line in enumerate(lines):
            for m in CITATION.finditer(line):
                label, start, end, link = m.group(1), int(m.group(2)), m.group(3), m.group(4)
                checked += 1

                target = (doc.parent / link.split("#")[0]).resolve()
                if not target.exists():
                    problems.append(f"{doc.name}:{n+1}  missing file: {link}")
                    continue

                src = target.read_text().splitlines()
                hi = int(end) if end else start
                if hi > len(src):
                    problems.append(
                        f"{doc.name}:{n+1}  {label}:{start}-{end} exceeds file length {len(src)}")
                    continue

                # The visible label and the link anchor must agree, or the text
                # says one thing while the click goes somewhere else.
                expected = f"L{start}-L{end}" if end else f"L{start}"
                if link.split("#")[-1] != expected:
                    problems.append(
                        f"{doc.name}:{n+1}  label {label}:{start}-{end} disagrees with anchor "
                        f"{link.split('#')[-1]}")
                    continue

                block = anchors(preceding_block(lines, n))
                if not block:
                    bounds_only += 1
                    continue

                cited = [ln.strip() for ln in src[start - 1 : hi]]
                if any(a in cited for a in block):
                    matched += 1
                    continue

                score = overlap(block, cited)
                if score >= 0.75:
                    fuzzy += 1
                else:
                    problems.append(
                        f"{doc.name}:{n+1}  {label}:{start}-{end} does not match its quoted code "
                        f"(vocabulary overlap {score:.0%})"
                        f"\n      looked for: {block[0][:72]}")

    print(f"{checked} citations: {matched} exact, {fuzzy} reformatted-but-consistent, "
          f"{bounds_only} bounds-only (no adjacent code block), {len(problems)} stale")
    for p in problems:
        print("  " + p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
