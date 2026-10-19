# Lanes

Size the work by its blast radius and risk, not by how easy it sounds.

| Lane | Signals | Steps |
|------|---------|-------|
| **XS** | 1-2 files, roughly 30 changed lines or fewer, no new public API, no risk area | build → self-review → `ship-it` |
| **S** | One coherent change that fits one session; may touch a few modules | `plan-it` (single file, 0-3 questions) → `build-it` → `audit-it` (Spec and Standards) → `ship-it` |
| **M** | Several vertical slices, a new seam or interface, or more than one session | `plan-it` (grill, phases) → `build-it` (frontier, parallel when ready) → `audit-it` (full fan-out) → `ship-it` |
| **L** | Bundled requests, an epic, or work whose shape is still unclear | Capability map first, then one M (or S) work item per module |

## Risk areas

Work that touches any of these is at least **S**, however small:

- authentication, authorization, sessions, secrets
- payments, money, billing
- data migrations, schema changes, data deletion
- CI/CD, build, deploy, infrastructure config
- public API or wire formats other teams consume

## Lane L: capability map

Write `docs/planning/<id>/MAP.md`: one row per module with a stable id
(`<id>-auth`, `<id>-ui`), what it delivers, its lane, and what it is blocked
by. Get the map approved, then run `do-it` on each module id in dependency
order. The map is the only artifact the L item itself owns.

## Raising the lane

Raise it when the build finds more than the plan said: a second seam, a risk
area, phases that will not fit one session. Record `lane:` and one line of
why in the state block, tell the user in one line, and continue from
`plan-it` for the added scope only.
