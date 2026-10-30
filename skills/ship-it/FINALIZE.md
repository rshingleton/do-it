# Finalize a finished roadmap

For [SKILL.md](SKILL.md) §1, §2 and §3 step 2. A finished roadmap keeps its
file in `docs/roadmap`; this turns it into a lasting record.

## When

- The slice being shipped is the roadmap's last: in `work.mjs roadmap <file>`
  every slice but this one is `shipped` or `dropped` and no decision is open.
  Checked at §2, before its own Status is set, so `finished` is still false.
- Or `/ship-it --roadmap <file>` on a roadmap that is `finished`, not yet
  `completed`; a roadmap that is not `finished` is refused as blocked. No work
  id and no state block: skip `event ship-prepared` and `work.mjs close`. The
  commit id is `roadmap-<slug>` (the file name without `.md`), the message
  `roadmap-<slug>: finalize <title>`. "Commit now" stages by path only the
  paths below; "leave it for review" leaves them uncommitted.
- Or `/ship-it --roadmap <file>` again after that review: a `completed`
  roadmap with uncommitted edits asks one line, "Commit now?", and commits the
  paths below; with none it says it was finalized on the `completed` date.
  Either way offer e is asked again for a milestone still open (a remote one
  needs its yes). Nothing else is written.

## Paths

The roadmap file, each ADR a created, and `docs/TODO.md` when b added to-dos
(the repo's configured paths, not these defaults). "Commit now" stages exactly
these, and so does a run's `work.mjs run commit <slug> <id> --docs --paths`.

## Offers

Item 2 of §2's Ask list carries them as `a` to `e`, each taken by default;
the user names the letters to leave out. Nothing is written before the answer.

a. **ADRs:** each Decisions-so-far entry that passes
   [name-it](../name-it/SKILL.md)'s three-part test becomes a proposed ADR
   ([ADR-FORMAT.md](../name-it/ADR-FORMAT.md)); list them by title.
b. **Fog:** each Fog line becomes a to-do through `log-it`, with
   `source: <roadmap slug> fog` (a line already on the to-do list is skipped).
c. **Shipped:** `## Changes` becomes a `## Shipped` bullet list, never a table,
   after the slice's own dated line is added, so that line converts too. Keep
   each `Verify unmet` clause; drop the T-id lists.
d. **Completed:** `completed: <date>` in the frontmatter, the date of this run;
   skip d when `completed` is already set.
e. **Milestones:** for a published roadmap, close each milestone parent with
   `track-it` (`tracker.mjs close`). A local tracker closes by default; a remote tracker only on the
   user's yes, in a run too.

Write a to d in the same change as the slice's own closes (§3 step 2). Run
mode takes every default, with no question ([RUNMODE.md](RUNMODE.md)).

## Never

- Never delete the roadmap.
- Never create a changelog.
- Never touch a slice Status beyond what ship-it writes.
