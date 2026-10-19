---
name: design-it
description: The shared vocabulary and principles for shaping modules so a lot of behaviour sits behind a small, testable interface: module, interface, depth, seam, adapter, leverage, locality, and the deletion test. Use when designing or reshaping a module's interface, deciding where a seam goes, judging whether a module earns its keep, making code easier to test or navigate, or when another skill asks for the design vocabulary.
---

# design-it

One vocabulary for every design conversation in do-it. `scope-it` uses it to
agree seams, `prove-it` and `sweep-it` to judge structure, `deepen-it` to
propose changes. Same words everywhere, so findings and plans line up.

## Terms

Use these exactly. "Component", "service", "API" and "boundary" each blur two
of them, so they are not used.

| Term | Means |
|------|-------|
| **Module** | Anything with an interface and something behind it, at any scale: a function, a class, a package, a slice through several layers. |
| **Interface** | Everything a caller has to know to use the module correctly: signatures, plus invariants, call order, failure modes, required config and cost. Wider than a type signature. |
| **Implementation** | The code behind the interface. |
| **Depth** | How much behaviour a caller or test gets per thing it must learn about the interface. **Deep**: much behind little. **Shallow**: the interface is about as complex as what it hides. |
| **Seam** | The place where behaviour can be swapped without editing the code there; where an interface sits. Choosing the seam is a decision separate from what goes behind it. |
| **Adapter** | Whatever fills a seam: the production database client, the in-memory fake. A role, not a size. |
| **Leverage** | What callers gain from depth: one implementation serves many call sites and tests. |
| **Locality** | What maintainers gain from depth: a change, a bug or a fact lives in one place instead of spreading across callers. |

How they fit: a module presents one interface; that interface lives at a
seam; adapters fill the seam; depth is measured at the interface and pays out
as leverage for callers and locality for maintainers.

## Principles

- **Judge depth at the interface.** A deep module may be built from many
  small internal parts with their own internal seams for their own tests.
  None of that shows in its interface, and none of it should.
- **The deletion test.** Picture the module gone. If its complexity goes with
  it, it was a pass-through. If the complexity would reappear in every
  caller, the module was earning its place.
- **Tests cross the same seam as callers.** The interface is the test
  surface. A test that needs to reach behind it says the module has the
  wrong shape.
- **One adapter is a hypothetical seam; two make it real.** Add a seam when
  something actually varies across it (production and test count as two),
  not in case it might.

## Measures this vocabulary avoids

- Depth as a ratio of implementation lines to interface lines: it rewards
  padding. Depth here is leverage.
- Interface as a language keyword or a list of public methods: it leaves out
  the invariants and failure modes callers depend on.

## Going further

- [INTERFACES.md](INTERFACES.md): shrinking an interface, and shaping one so
  it is easy to test.
- [DEEPENING.md](DEEPENING.md): merging shallow modules safely, by the kind of
  dependency involved, and how tests move with them.
- [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md): designing an interface several
  ways in parallel before picking one.
