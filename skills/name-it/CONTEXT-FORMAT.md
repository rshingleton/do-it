# Context files and the context map

A repo's domain docs are one `CONTEXT.md` per area and, once there is more
than one area, a `CONTEXT-MAP.md` at the root that lists them. The paths
below are the defaults; use the ones resolved for this repo (session context,
or `tracker.mjs config` under `docs`).

These are context files, not glossaries: an area's file holds more than terms
(do-it's ADR 0005 records why it keeps the CONTEXT names). A repo that only
has `GLOSSARY.md` or `GLOSSARY-MAP.md` (the mattpocock/skills names) is read
the same way, as a last fallback; never create a GLOSSARY file. When both
names exist, the CONTEXT file wins; mention the other one, do not merge it.

## An area's CONTEXT.md

Five sections, in this order. name-it writes **Terms**; `map-it` writes the
rest. A file with only a title and Terms is valid, and so is one where Terms
is still missing.

Files written before this shape may use other headings ("Domain Concepts",
"Status"). A section that defines domain words counts as Terms. Keep every
other section where it is, with its heading as written; a refresh fills or
adds the five sections and never renames, reorders or drops one.

```markdown
# Fulfilment

## Identity

Turns paid orders into parcels that leave the warehouse. A Node service
started by `bin/fulfil`; reads the `orders` queue, writes `shipments`.

## Terms

**Shipment**:
One parcel with its own tracking number. An order may produce several.
_Not_: package, delivery

**Pick list**:
The items a picker collects for one shipment, in walking order.
_Not_: order lines, manifest

## Key relationships

- Consumes `OrderPaid` from Checkout; publishes `ShipmentSent` back.
- Shares the `warehouse` database with Inventory (read only here).

## Key files

| Path | Purpose |
|------|---------|
| `src/picker.ts` | Builds pick lists in walking order |
| `src/carrier/` | One adapter per carrier |

## Design notes

- Shipments are split per carrier, never per warehouse
  ([ADR 0003](docs/adr/0003-split-by-carrier.md)).
```

Term rules:

- **Pick one word per concept.** Synonyms go on the `_Not_:` line so they
  stop being used.
- **Say what it is,** in one or two sentences, not what code does with it.
- **Domain terms only.** Words every program has (retry, cache, handler)
  stay out, however often the code uses them.
- **Group under subheadings** once clear clusters appear.

The root `CONTEXT.md` has the same shape and covers what is shared:
platform terms, cross-cutting infrastructure, repo-wide decisions.

## The map

`CONTEXT-MAP.md` at the root: one or more tables of Context | Location |
Scope, the root's own row first, and an optional Relationships section.

```markdown
# Context map

## Services

| Context | Location | Scope |
|---------|----------|-------|
| Root | `./CONTEXT.md` | Shared infrastructure, platform terms |
| Checkout | `services/checkout/CONTEXT.md` | Takes and pays for orders |
| Fulfilment | `services/fulfilment/CONTEXT.md` | Turns paid orders into shipments |

## Relationships

- **Checkout → Fulfilment**: publishes `OrderPaid`; Fulfilment starts picking
- **Fulfilment → Checkout**: publishes `ShipmentSent`; Checkout emails the customer
```

Group rows under more than one heading when the areas fall into kinds
(services, libraries). Location is the file's path from the root.

## Which layout applies

- A map exists: read it, then the context of the area the work is in.
- Only a root `CONTEXT.md`: one area; that file is the context.
- Neither: no context yet; create one only as below.

## The area for a path

1. The map row whose Location directory is the longest prefix of the path
   (`services/checkout/src/pay.ts` is Checkout, not Root).
2. No row matches: the nearest directory above the path with its own
   manifest (`package.json`, `cpanfile`, `go.mod`, `pyproject.toml`,
   `Cargo.toml`).
3. Neither: the path's top-level directory.

If that area has no `CONTEXT.md`, the root context covers it.

## Creating one

Only when something has to go in it, never as a side effect of reading:
name-it settling a term, `/map-it <area>`, or a step the user accepted in a
plan. Whoever creates an area's file adds its map row in the same change.

- First context in a repo: a root `CONTEXT.md` when the term is repo-wide or
  the repo has one area; else the area's file.
- First area below the root: also create `CONTEXT-MAP.md` with the root's row
  (when a root `CONTEXT.md` exists) and the new area's row.
- Later areas: add the row to the existing map, under the fitting heading.
- name-it creating a file for a term writes the title and Terms only;
  `map-it` fills the other sections later.

Never start a second context file in an area that has one, and never move
terms out of an existing file without the user agreeing.
