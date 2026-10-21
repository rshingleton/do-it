# Slicing a roadmap

A good slice is a thin path through every layer it touches that ships on its
own and leaves the product better or the next slice easier. A good roadmap is
mostly slices like that, a few spikes, and an honest list of what is not yet
known.

## Kinds of slice

| Kind | Use when | Verify |
|------|----------|--------|
| **Build** | The behaviour is clear enough to plan | Its Verify check passes in the shipped product |
| **Spike** | A question blocks planning and only trying will answer it (performance, a vendor API, a UX doubt) | The question is answered, recorded as a decision or an ADR, and the throwaway code is gone (sketch-it) |
| **Enabler** | A refactor or platform piece that several slices need | The slices that depend on it can start; nothing user-visible is required |

Prefer build slices. An enabler with no slice depending on it is not a slice.

## Cutting rules

- **Vertical, not layered.** "Search returns results from the new index" is
  a slice; "build the index schema" alone is not.
- **Fits lane S or M.** One coherent change, at most a few phases. A slice
  that needs a roadmap of its own is split, or gets a nested roadmap.
- **Verify is observable.** Name the check: a request, a screen, a metric, a
  command. "Works" is not a check.
- **Covers is honest.** Each slice names the requirements (`G` ids) it moves
  forward; a slice that covers none is a nice-to-have for `log-it` (`kind: todo`).
- **Blocked by is real.** A slice is blocked by another only if it cannot
  start without it; say what it needs from it. False blocks kill parallel
  work.
- **Expand, migrate, contract** for wide changes: add the new form beside the
  old, move users over in batches, then remove the old form, each its own
  slice.

## Not slices

- **Open decisions:** a question you can state sharply now but not answer
  yet. Each names how it gets answered (grill, look-it-up, spike) and which
  slices wait on it.
- **Fog:** areas you know are coming but cannot phrase sharply yet. Coarser
  than a slice; a patch of fog may become several slices or none.
- **Out of scope:** beyond the destination. Never graduates; it returns only
  as a new roadmap.

## Checks before approval (and after every replan)

- Every requirement (`G`) is covered by a slice, sits in Fog, or is in Out
  of scope. None is silently missing.
- No cycle in Blocked by, and no block that only restates order.
- Every milestone has an exit check, and the first one proves the path end
  to end.
- Every slice fits lane S or M and has a Verify.
- Every open decision says how it gets answered and which slices it blocks.
