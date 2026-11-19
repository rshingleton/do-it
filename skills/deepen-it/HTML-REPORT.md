# The deepen-it report page

A single static HTML file that a reader can take in within a minute, with the
diagrams carrying the argument. Write it to the OS temp directory (`$TMPDIR`,
else `/tmp`, or `%TEMP%` on Windows) as `deepen-it-<repo>-<yyyymmdd-hhmm>.html`,
then open it with `open`, `xdg-open` or `start`.

## Page shape

Load Tailwind for layout and Mermaid for graph diagrams from their CDNs; the page
needs no other script and no interactivity.

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
    .edge-seam { stroke-dasharray: 6 3; }
    .edge-leak { stroke: #b91c1c; }
    .box-deep  { background: #1e293b; color: #f1f5f9; }
  </style>
</head>
<body class="bg-white text-neutral-900">
  <main class="mx-auto max-w-5xl space-y-10 px-6 py-10">
    <header><!-- title line and legend --></header>
    <section id="cards"><!-- one article per candidate --></section>
    <section id="pick"><!-- the top pick --></section>
  </main>
</body>
</html>
```

The header is one line (repo, date, area looked at) and a legend: plain box is
a module, dashed line a seam, red line a leak, dark box a deep module. Go
straight to the cards.

## One card per candidate

An `<article>` holding, top to bottom:

1. A title that names the move, such as "Fold the refund helpers into Refund".
2. Two badges: strength (`Strong` green, `Worth exploring` amber, `Speculative`
   grey) and the dependency kind from DEEPENING.md in `design-it`.
3. The files involved, in monospace.
4. Before and after diagrams side by side, each about 300px tall.
5. The friction in one sentence, then the deepened shape in one sentence.
6. Three to five gains, each phrased as leverage, locality or a test-surface
   win: "locality: refund bugs live in one module".
7. Only if it argues against an accepted ADR: a one-line amber note on why
   reopening is worth it.

A card that needs a paragraph to make sense has the wrong diagram. Redraw it.

## Picking a diagram

Use more than one kind, or the page looks mass-produced.

| To show | Draw |
|---------|------|
| Who calls whom, and where it leaks | Mermaid `flowchart`, leaking edges in red |
| Many round trips becoming one | Mermaid `sequenceDiagram`, before and after |
| A call falling through empty layers | A stack of bands, one per layer; after: a single tall band |
| An interface as big as what it hides | Two bars per module, interface against implementation |
| Several small modules merging | Boxes with inline SVG arrows; after: one dark box, old parts faded inside |
| A one-use helper or thin wrapper | A box inside its only caller, drawn as a dashed outline that the after view removes |

Set module labels in small capitals so the diagram reads as a schematic.

## The top pick

One larger card: the winning title as a link to its card, and one sentence on
why it leads (usually the most leverage for the least change, in a hot spot).

## Wording

Speak only the `design-it` vocabulary: module, interface, implementation, depth,
deep, shallow, seam, adapter, leverage, locality. Domain nouns come from the
Terms in the area's `CONTEXT.md`. State each gain as one of those properties:
"easier to maintain" becomes "locality: the rule changes in one place".
