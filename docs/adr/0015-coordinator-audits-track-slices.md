---
status: proposed
---

# The coordinator audits a track's slice

ADR [0012](0012-coordinator-plus-tracks.md) has each track build and audit its
slice, and relies on prove overlap for part of its speed. A track runs as one
`it-builder` subagent, at subagent depth 1, and cannot start `it-reviewer`,
review-it or guard-it. Its audit therefore ran in the builder's own context,
with the build transcript in front of it: not the fresh check `prove-it`
promises, and the coordinator's one scoped merge review was the only
independent read of the slice.

The coordinator now audits. After `run verify --in` records the track's tree, it
records the round, runs prove-it `--since <base>` from that worktree with the
plan and its `sources:` as the spec, writes the returned report, and sends any
Must back to the same `it-builder` session. A pass merges; the scoped merge
review still runs after it. The contract is
[TRACKS.md](../../skills/finish-it/TRACKS.md), `## The audit`.

## Options considered

- A track that audits in its own context, unchanged: rejected. At depth 1 it
  cannot fan out reviewers, so no round is fresh and its verdict arrives from
  the context that wrote the code.
- Audit the merged tree instead of the track's: rejected. It merges before the
  check, and the slice's diff would then hold its neighbours' work.
- Drop the scoped merge review now that the coordinator audits: rejected. The
  audit reads the slice; the merge review reads the integration, which the
  audit cannot see.

## Consequences

- Audits queue in the coordinator: one slice's reviewers at a time, while other
  tracks keep building. ADR 0012's 1.65x measured audits running beside builds
  inside the tracks, so that share is narrower now and unmeasured; the run's
  default width is unchanged until a run measures the new shape (T298, R67).
- The audit needs a real `base_ref`. A slice whose base fell back to `HEAD` has
  no diff to read, so it parks instead of passing an empty review.
- A track reports a build, not a verdict. A Must costs a second builder turn on
  the same tree, which `--resume` keeps.

## Execution notes

Built as t305-track-audit; the audit passed round 1 with no Must. What the
build learned: the coordinator's prove-it `--since` writes no state, so the
report and the item events stay the coordinator's, and a track on the `HEAD`
fallback has no diff, so it parks rather than passing an empty review.

Open Should findings, filed as T342 to T345:

- `skills/do-it/LANES.md:51` still says a track builds and audits its slice.
- `docs/adr/0012-coordinator-plus-tracks.md:7` still carries the audited clause
  its own amendment reverses.
- `TRACKS.md` parks an unverified axis where prove-it blocks, and the failed
  track removes the worktree the retry needs (T344).
- `TRACKS.md` gives the report to the coordinator while prove-it section 4 still
  writes findings and fires `audit-pass` in every mode (T345).
