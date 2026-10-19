# Logic sketch

One self-contained HTML page that lets anyone push a model through cases by
clicking. Built for questions that sound fine in a meeting and fall apart on
the third edge case.

Wrong branch if the question is what a screen should look like: use
[UI.md](UI.md).

## Good fits

- A lifecycle with states and transitions (orders, approvals, subscriptions).
- Rules that interact (discounts that stack, permissions that inherit).
- A data shape that has to represent awkward real cases.
- The feel of an API before anyone writes it.

## Build it

### The model

Write the logic as a small pure module inside one `<script>` block, shaped by
the question:

| Shape | Use when |
|-------|----------|
| Reducer `(state, event) -> state` | Discrete events change one state value |
| State machine with explicit transitions | Which events are legal right now is part of the question |
| A few pure functions over plain data | Transformations, no current state |
| An object with a small method surface | The logic genuinely owns ongoing state |

The module never touches the page: no `document`, no event handlers inside
it. The page calls the module and renders what comes back. That separation is
what lets a proven model move into the real code later.

### The page

Plain HTML, CSS and JS in one file: no framework, no build, no server, so it
opens from a double-click and survives being sent by email. Write every label
in the domain's words, not the code's, so a product owner or domain expert
can drive it.

Top to bottom:

1. **Question.** The sentence from SKILL.md step 1, visible at the top.
2. **State panel.** Every field that matters, labelled and readable (not a
   JSON dump), refreshed after each click, with the field that just changed
   highlighted.
3. **Actions.** One button per event, always available, for free play in any
   order. An event the model rejects shows why.
4. **Scenarios.** Tabs, one per scenario: a sentence on what it sets up and
   what to watch, then its steps as buttons in order. Opening a scenario
   resets to a known start so every run is the same. Include the happy path,
   the awkward case, and something that should be refused.

Clean type, generous spacing, one accent colour, nothing animated.

## Done when

The person driving it has either found the case that breaks the model, or
walked every scenario without one. Then go back to SKILL.md step 4: the
verdict is recorded and the pure module, if it earned it, is rewritten into
the real code with tests.
