# UI sketch

Two to five structurally different versions of one screen, mounted on one
route and switched from a small floating control. The user flips between
them, picks one or combines parts, and the rest is deleted.

Wrong branch if the question is about rules or state: use
[LOGIC.md](LOGIC.md).

## Where the variants live

Judge a layout in its real surroundings: real navigation, real data, real
density. A blank page flatters every option.

- **Default: an existing page.** Render the variants on the route that
  already exists (or on the page the new piece would sit inside), chosen by a
  `?sketch=` query parameter. Data loading, auth and params stay as they are;
  only the rendered subtree changes.
- **Only when nothing can host it:** a new route that follows the project's
  routing conventions, with `sketch` in its path. Check twice that no
  existing page could hold it first.

## Build it

1. **Plan in one line**, written at the top of the switcher file: "Three
   versions of the billing summary on `/account/billing`, via `?sketch=`."
   Default to three; more than five stops being different and starts being
   noise.
2. **Make them differ in structure**, not colour or copy: a different layout,
   a different order of information, a different main action. Each variant
   uses the project's own component library and styling, and exports a
   clearly named component (`SketchA`, `SketchB`). If two come out alike,
   redo one with an explicit constraint ("no card grid").
3. **One switcher on the route.** It reads the query parameter and renders
   the matching variant, defaulting to the first. Shared data stays above it.
4. **A floating control**, fixed at the bottom centre: previous, the current
   key and name (`B: sidebar layout`), next, wrapping at both ends. It
   updates the query parameter through the app's router so a variant can be
   linked and survives reload. Left and right arrow keys work too, except
   while an input, textarea or editable element has focus. It looks plainly
   different from the design under review, and renders only outside
   production builds.
5. **No real writes.** Variants that need to change data call a stub; the
   question is the look, not the backend.

## Hand it over

Give the URL and the keys. Expect a combination ("B's header, C's list"):
that combination is the real answer, so record it as such.

## Done when

The user has named a winner or a combination. Then follow SKILL.md step 4:
record the verdict, rebuild the chosen design properly in the real page
(variant code was written without tests or error handling), and delete every
variant, the switcher and any sketch route.
