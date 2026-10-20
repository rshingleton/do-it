# The deepen-it report page

One static HTML file, readable in a minute, where the diagrams do the
explaining. It lives in the OS temp directory (`$TMPDIR`, else `/tmp`;
`%TEMP%` on Windows) as `deepen-it-<repo>-<yyyymmdd-hhmm>.html`. Open it with
`open` (macOS), `xdg-open` (Linux) or `start` (Windows).

## Page skeleton

Two external scripts and nothing else: Tailwind from its CDN for layout, and
Mermaid as an ES module for graph-shaped diagrams.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>deepen-it: {{repo}}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script type="module">
    import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
    mermaid.initialize({ startOnLoad: true, theme: "neutral" });
  </script>
  <style>
    .seam { stroke-dasharray: 5 4; }
    .leak { stroke: #b91c1c; }
    .deep { background: #1e293b; color: #f8fafc; }
  </style>
</head>
<body class="bg-neutral-50 text-neutral-900">
  <main class="mx-auto max-w-5xl space-y-12 px-6 py-10">
    <header><!-- repo, date, legend --></header>
    <section id="candidates"><!-- one article per candidate --></section>
    <section id="top-pick"><!-- one card --></section>
  </main>
</body>
</html>
```

**Header:** repo name, date, the area examined, and a four-item legend (box
= module, dashed line = seam, red edge = leak, dark filled box = deep
module). No preamble.

## A candidate card

One `<article>` per candidate, in this order:

1. **Title** naming the move: "Fold the refund helpers into the Refund module".
2. **Badges:** strength (`Strong` green, `Worth exploring` amber,
   `Speculative` grey) and the dependency kind from `design-it`'s
   DEEPENING.md.
3. **Files**, monospaced.
4. **Before and after**, two columns of equal height (around 300px).
5. **Friction** and **shape**, one sentence each.
6. **Gains**, three to five short bullets in the vocabulary: "locality: refund
   bugs live in one module", "one interface, four callers".
7. **ADR callout**, one amber line, only when the candidate argues against an
   accepted ADR, saying why reopening it is worth it.

If a card needs a paragraph to be understood, the diagram is wrong: redraw it.

## Choosing a diagram

Vary them; a page of identical charts reads as boilerplate.

| Showing | Draw |
|---------|------|
| Who calls whom, and where it leaks | Mermaid `flowchart` with a `leak` class on the bad edges |
| Many round trips collapsing to one | Mermaid `sequenceDiagram`, before and after |
| A call passing through hollow layers | Stacked bands, one per layer; after: one thick band |
| Interface nearly as big as the implementation | Two bars per module: interface height vs implementation height |
| Several small modules becoming one | Boxes and inline SVG arrows; after: one dark box with the old parts faded inside |

Label modules inside diagrams in small uppercase so they read as a
schematic, not a screen.

## Top pick

One larger card: the candidate's title as a link to its card and one
sentence on why it goes first (usually the most leverage for the least
change, in a hot spot).

## Words

Use the `design-it` vocabulary exactly: module, interface, implementation,
depth, deep, shallow, seam, adapter, leverage, locality. Domain nouns come
from the Terms in the area's `CONTEXT.md`. Gains are stated as one of those properties, so "easier
to maintain" becomes "locality: the rule changes in one place".
