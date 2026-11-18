# Finalize a finished roadmap

For [SKILL.md](SKILL.md) §1, §2 and §3 step 2. A finished roadmap's content
goes into its ADRs, the to-do list and the history row first; then its file is
removed in the same commit. An unfinished roadmap is left in place and named.

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
  Either way the history row and the removal below still happen, offers a to d
  are not written again, and offer e is asked again for a milestone still open:
  a local one closes with no question, a remote one needs its yes. When a run
  record for this roadmap exists at level `full` or `ultra` this is run mode
  ([RUNMODE.md](RUNMODE.md)): every default, nothing asked, and a remote
  milestone stays open.

## Paths

The roadmap file, removed; the row appended to
`docs/reference/history.md`; the ADRs offer `a` created; `docs/TODO.md`
when offer `b` added to-dos; and the milestone issue files offer `e` closed,
which on a local tracker are the `docs/issues/*.md` files themselves (the
repo's configured paths, not these defaults). "Commit now" stages these and
nothing else, and so does a run's `work.mjs run commit <slug> <id> --docs
--paths`.

## Offers

Item 2 of §2's Ask list carries them as `a` to `e`, each taken by default;
the user names the letters to leave out. Nothing is written before the answer.

a. **ADRs:** each Decisions-so-far entry that passes
   [name-it](../name-it/SKILL.md)'s three-part test becomes an `accepted` ADR
   ([ADR-FORMAT.md](../name-it/ADR-FORMAT.md)): the owner approved the roadmap
   and nothing later accepts a roadmap's ADR. List them by title.
b. **Fog:** each Fog line becomes a to-do through `log-it`, with
   `source: <roadmap slug> fog` (a line already on the to-do list is skipped).
c. **Shipped:** `## Changes` becomes a `## Shipped` bullet list, never a
   table (a roadmap that already has `## Shipped` gets the new bullets
   appended to it), after the slice's own dated line is added, so that line
   converts too. Keep each `Verify unmet` clause; drop the T-id lists.
d. **Completed:** `completed: <date>` in the frontmatter, the date of this run;
   skip d when `completed` is already set.
e. **Milestones:** for a published roadmap, close each milestone parent with
   `track-it` (`tracker.mjs close`). A local tracker closes by default; a
   remote tracker only on the user's yes, in a run too.

Write a to d in the same change as the slice's own closes (§3 step 2). Run
mode takes every default, with no question ([RUNMODE.md](RUNMODE.md)).

## Remove

Only when the roadmap is finished: every slice `shipped` or `dropped` and no
decision open. An unfinished roadmap is left in place, and the slice or
decision that holds it is named in the closing line.

1. Write offers a to d first, so the content is durable before the file goes.
2. Append one row to `docs/reference/history.md`, in the table below
   its intro: the title, the file removed, the `approved:` date, the
   `completed:` date and the count of slices in `## Shipped`.
3. Remove the roadmap file in the same change, before the commit, so the
   commit that finalizes it also removes it.

Run mode removes too, with nothing asked.

## Never

- Never remove a roadmap with a slice unshipped or a decision open.
- Never create a changelog.
- Never touch a slice Status beyond what ship-it writes.
