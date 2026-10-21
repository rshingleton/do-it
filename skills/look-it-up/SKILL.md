---
name: look-it-up
description: Research a question about a library, API, standard, tool or platform against primary sources in a background agent, and write cited findings to a Markdown file in the repo. Use when the user asks to research or look something up, or what a spec, standard or official guidance says, when a plan or build depends on an external fact the code does not settle (a version's behaviour, an API limit, a spec rule), or when scope-it or the do-it scout flags one.
---

# look-it-up

Facts about the outside world come from the source that owns them, not from
memory. This skill fetches them without stalling the main work.

## 1. Frame it

Write the question as something a source can answer: "Does Postgres 16 allow
`ON CONFLICT` on a partial unique index?", not "how does upsert work". List
what would settle it and which sources own the answer.

Primary sources, in order of trust: the official docs for the exact version
in use (check the repo's lockfile or manifest for it), the source code, the
spec or RFC, the vendor's changelog or release notes. Blog posts, forums and
answers sites only point toward a primary source; they never settle a claim.

## 2. Send it out

Start one background agent on the mid-tier model (`model: sonnet` in Claude
Code) with the question, the version in use, and the output path; the file holds
the detail, so its reply is `done`, `blocked` or `failed`, the path and one line, under 100 words. Keep working while it reads.
Its brief:

- trace every claim to a primary source and cite it (URL, section, version);
- say plainly where sources disagree or are silent;
- separate what the sources say from any inference drawn from them;
- write the file below and report its path plus a three-line answer.

## 3. The file

Write to the repo's existing research or notes location when there is one,
else `docs/research/<slug>.md`:

```markdown
# <question>

Answer: <one or two sentences>. Confidence: <high | medium | low>.
Versions: <what this applies to>. Checked: <date>.

## Findings
- <claim> ([source](url), section)

## Open
- <what the sources do not settle>
```

## 4. Use it

Bring the three-line answer back to whoever asked. Inside a do-it work item,
add the file to the plan's `sources:` so `prove-it` reviews against the same
facts. A low-confidence answer is an assumption: record it as one, per
`it-core`.
