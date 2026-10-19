# Deepening safely

How to merge a cluster of shallow modules into one deeper module, and where
its tests go. Terms are from [SKILL.md](SKILL.md).

## Sort the dependencies first

What the cluster depends on decides how the deepened module is tested at its
seam. Classify each dependency:

| Kind | Examples | How to deepen and test |
|------|----------|------------------------|
| **In-process** | pure functions, in-memory state | Merge freely. Test through the new interface; no adapter needed. |
| **Local stand-in exists** | an embedded or in-memory version of the database, a temp filesystem | Merge, and run the stand-in inside the test suite. The seam stays internal; the module's interface does not change for it. |
| **Owned, over the network** | your own services and internal APIs | Put an interface at the seam. The logic lives in the deep module; the transport is an adapter (HTTP or queue in production, in-memory in tests). |
| **Third party** | payment, messaging or mail providers | The module receives the provider through an interface; tests pass a fake adapter. |

A typical recommendation for the third row: "Put an interface where the
service call is, keep the logic in one module, and give it an HTTP adapter
for production and an in-memory one for tests."

## Seams

- Add an interface at a seam only when at least two adapters will use it,
  usually production and test. A single adapter is just indirection.
- A deep module can keep internal seams for its own tests. Do not widen its
  interface to expose them.

## Tests move, they do not pile up

- Write the new tests at the deepened module's interface; that is the test
  surface now.
- Delete the old tests that pinned the shallow pieces once the new ones cover
  the behaviour. Keeping both doubles the cost of every change.
- Assert what a caller can observe, never internal state. A test that breaks
  when only the inside changes was testing past the interface.
