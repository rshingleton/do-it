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
status: building        # planned | building | auditing | shipping | done
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
audit: { verdict: null, round: 0, fingerprint: null }
---
```

Lane S has no `phases:` list; its plan body holds the steps.

## Rules

- **Owner.** The running step is the only writer. `plan-it` creates the block;
  `build-it`, `audit-it` and `ship-it` update their own fields.
- **Approvals are recorded or they did not happen.** Never infer approval from
  an earlier conversation.
- **Verification is a claim about code.** A phase's `verified` holds while its
  files are unchanged; `audit-it` re-runs everything regardless.
- **Fingerprint.** `audit.fingerprint` is the hash of the change at audit time,
  excluding the planning files:

  ```bash
  bash <do-it skill dir>/scripts/fingerprint.sh <base_ref>
  ```

  `ship-it` recomputes it; a mismatch means the code moved since the audit.
- **Status moves forward.** `planned → building → auditing → shipping → done`.
  A failed audit sets it back to `building`.
- **No commits until ship.** Steps leave their work in the working tree.
  `base_ref` plus the working tree is the whole change.
