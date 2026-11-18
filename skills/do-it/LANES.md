# Lanes

Size the work by its blast radius and risk, not by how easy it sounds.

| Lane | Signals | Steps |
|------|---------|-------|
| **XS** | 1-2 files, roughly 30 changed lines or fewer, no new public API, no risk area | build → self-review → `ship-it` |
| **S** | One coherent change that fits one session; may touch a few modules | `scope-it` (single file, 0-3 questions) → `build-it` → `prove-it` → `ship-it` |
| **M** | Several vertical slices, a new seam or interface, or more than one session | `scope-it` (grill, phases) → `build-it` (frontier, parallel when ready) → `prove-it` (full fan-out) → `ship-it` |
| **L** | Bundled requests, an epic, or work whose shape is still unclear | A roadmap first ([roadmap-it](../roadmap-it/SKILL.md)), then one S or M work item per slice; with `--complete`, [finish-it](../finish-it/SKILL.md) chains the slices |

## Lane XS: the flow

No files under `docs/planning/`. Follow the `it-core` posture, build test-first
when the change has logic, run the project's checks, then self-review the diff
against the request (each changed line traces to it; no secrets; nothing left
half-done). Then follow [ship-it](../ship-it/SKILL.md) with `--lane xs`, plus
`--ref <ref>` for an issue and `--todo <id>` for a to-do item, so both close.

## Risk areas

Work that touches any of these is at least **S**, however small:

- authentication, authorization, sessions, secrets
- payments, money, billing
- data migrations, schema changes, data deletion
- CI/CD, build, deploy, infrastructure config
- public API or wire formats other teams consume

## Lane L: roadmap

Lane L has no work item of its own. Read [roadmap-it](../roadmap-it/SKILL.md)
and follow it with the request: it charts a durable roadmap of S and M
slices in the repo's roadmap directory. Each slice is then built as normal
work with `/do-it <roadmap file>#R<n>`, and ship-it marks it shipped. An L
item already planned under the old capability map (`docs/planning/<id>/MAP.md`)
is finished as it is.

## Lane L: complete run

`/do-it <roadmap file> --complete [lite|full|ultra]` reads
[finish-it](../finish-it/SKILL.md). Every decision is settled in one sweep
first, then the run chains slices with no user turn: scope, build, prove and
ship for each, until none can go on. A slice that cannot proceed is parked
with its reason; independent slices continue. The run waits on the user only
at plan approval and at the final review. `lite` keeps a human gate after each
slice. Without the flag lane L is unchanged: one slice per `/do-it`. A
`--complete` run commits locally, per phase by default (`--commit phase|slice|none`) (ADR 0008); a run never pushes or opens a PR.

With `--tracks N` above 1, a complete run hands independent slices to worktree
tracks ([TRACKS.md](../finish-it/TRACKS.md)): each track builds one slice on its
own branch, and the coordinator audits it (TRACKS.md, The audit) and keeps scope,
the run record, the gate, the merges and the ship. Width is `min(free ready slices, tracks)`,
never above `DO_IT_TRACKS` (default 3) or the ceiling of 5. A run that commits
nothing holds one track, since a track would have no branch to merge.

## Raising the lane

Raise it when the build finds more than the plan said: a second seam, a risk
area, phases that will not fit one session. `work.mjs set <id> lane m`
(lane S's file moves into a directory), add one line of why to
`assumptions:`, `work.mjs event <id> replan`, tell the user in one line, and
continue from `scope-it` for the added scope only.
