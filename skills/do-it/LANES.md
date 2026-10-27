# Lanes

Size the work by its blast radius and risk, not by how easy it sounds.

| Lane | Signals | Steps |
|------|---------|-------|
| **XS** | 1-2 files, roughly 30 changed lines or fewer, no new public API, no risk area | build → self-review → `ship-it` |
| **S** | One coherent change that fits one session; may touch a few modules | `scope-it` (single file, 0-3 questions) → `build-it` → `prove-it` → `ship-it` |
| **M** | Several vertical slices, a new seam or interface, or more than one session | `scope-it` (grill, phases) → `build-it` (frontier, parallel when ready) → `prove-it` (full fan-out) → `ship-it` |
| **L** | Bundled requests, an epic, or work whose shape is still unclear | A roadmap first ([roadmap-it](../roadmap-it/SKILL.md)), then one S or M work item per slice |

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

## Raising the lane

Raise it when the build finds more than the plan said: a second seam, a risk
area, phases that will not fit one session. `work.mjs set <id> lane m`
(lane S's file moves into a directory), add one line of why to
`assumptions:`, `work.mjs event <id> replan`, tell the user in one line, and
continue from `scope-it` for the added scope only.
