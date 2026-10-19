# Work-item state

Every work item from lane S up keeps its state in one YAML frontmatter block.
Steps hand off through this block and the files it names, never through the
conversation, so any step resumes in a fresh session.

## Where

| Lane | File |
|------|------|
| S | `docs/planning/<id>.md` (the plan and the state in one file) |
| M | `docs/planning/<id>/README.md` (phases in `phase-N.md` beside it) |
| L | `docs/planning/<id>/MAP.md` (modules are their own S or M items) |

`<id>` is the tracker ref when there is one (`ABC-123`, `gh-42`), else a short
kebab-case slug.

## Block

```yaml
---
id: ABC-123
title: Rate-limit the login endpoint
lane: m
status: building        # planned | building | blocked | auditing | shipping
tracker: { kind: jira, ref: ABC-123, phases: { 1: ABC-124, 2: ABC-125 } }
sources: [docs/issues/login-rate-limit.md]
base_ref: 1a2b3c4       # HEAD when build-it started
approvals:
  plan: 2026-10-19
phases:
  - { n: 1, title: Limiter module, blocked_by: [], status: done,
      verified: "npm test, npm run lint: pass" }
  - { n: 2, title: Wire into login, blocked_by: [1], status: ready }
assumptions:
  - "Limit is 5 attempts per minute per IP (reversible: config)"
audit: { verdict: null, round: 0, must: [], fingerprint: null }
ship: { prepared: null, fingerprint: null }
blocker: null           # one line, set with status: blocked
---
```

Lane S has no `phases:` list; its plan body holds the steps. There is no
`done` status: a shipped item's plan is deleted at commit time.

## Rules

- **Owner.** The running step is the only writer. `scope-it` creates the block;
  `build-it`, `prove-it` and `ship-it` update their own fields.
- **Approvals are recorded or they did not happen.** Never infer approval from
  an earlier conversation.
- **Verification is a claim about code.** A phase's `verified` holds while its
  files are unchanged; `prove-it` re-runs everything regardless.
- **Fingerprint.** `audit.fingerprint` is the hash of the change at audit time,
  excluding the planning files, from `scripts/fingerprint.sh <base_ref>` in
  this skill's directory. The script runs from the repo root whatever the
  current directory and exits non-zero on a bad base. `ship-it` recomputes it;
  a mismatch means the code moved since the audit. Once ship-it has written
  the docs it records `ship.fingerprint` and compares against that instead.
- **Status moves forward.** `planned → building → auditing → shipping`, then
  the plan is deleted at commit. A failed audit (`round` + 1) or a rejected
  assumption at ship sets it back to `building`; `blocked` waits for the user
  and returns to `building`.
- **No commits until ship.** Steps leave their work in the working tree.
  `base_ref` plus the working tree is the whole change.
