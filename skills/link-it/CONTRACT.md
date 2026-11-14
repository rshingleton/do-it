# Contract file

One file per repo pair at `${XDG_DATA_HOME:-~/.local/share}/do-it-bridge/<a>--<b>.md`.
Written in the peer voice ([VOICE.md](../it-core/VOICE.md)): one-liners,
payload verbatim.

## Sections

| Section | Holds | Who edits |
|---------|-------|-----------|
| Goal | What the two repos are agreeing | The first side to write the file fills it; a later change follows the Interface rule (Rules) |
| Interface | The agreed shape: endpoints, types, events, fields | Either side, only after the other's `ack` |
| Open questions | One line each, owner named | Either |
| Decisions | Dated one-liners, newest last | The proposer, in the one edit that applies an agreed change; history only, never replayed |
| Resume: <repo> | One per side: `Repo:` absolute path (its identity), doing (with `edit:` lines), waiting on, peer session name, date, `Filed:` date once settled | That side only; the template's other section is scaffold until that side joins |

## Blank template

Copy this, not the worked example. Replace `<a>` and `<b>` with the sorted repo
directory names. Leave a side's `Repo: <path>` until that side joins and
records its own absolute path; an unfilled `<path>` is not a record.

```markdown
# <a> -- <b>

## Goal
<a> and <b>: <what is being agreed>.

## Interface

## Open questions

## Decisions

## Resume: <a>
Repo: <path>
Doing:
Waiting on:
Peer: <b> session ""
Date:
Filed:

## Resume: <b>
Repo: <path>
Doing:
Waiting on:
Peer: <a> session ""
Date:
Filed:
```

## Worked example

```markdown
# billing-api -- web-app

## Goal
web-app calls billing-api for invoice totals.

## Interface
GET /invoices/{id}/total -> {"cents": int}
Errors: 404 unknown id. 401 no token.

## Open questions
- Pagination of /invoices. Owner: billing-api.

## Decisions
- 2026-11-13: totals in cents, never floats. ack by web-app.

## Resume: billing-api
Repo: /Users/dev/billing-api
Doing: /total handler.
edit: add "currency": "USD" to /total.
Waiting on: web-app ack.
Peer: web-app session "web-app-3"
Date: 2026-11-13
Filed:

## Resume: web-app
Repo: /Users/dev/web-app
Doing: client stub.
Waiting on: pagination answer.
Peer: billing-api session "billing-1"
Date: 2026-11-13
Filed:
```

## Rules

- Change Interface (or, later, Goal) only after the peer's explicit `ack`.
  Before proposing, write the edit verbatim in your Resume note as its own line
  `edit: <text>` under `Doing:`, so a compaction does not lose it, and send the
  `ask:` with that text verbatim, and add `<peer> ack` to `Waiting on:`. A
  pending edit waits for its `ack`, which must quote it verbatim (a changed
  version goes back as a new `ask:`); never write it unacked.
- When the `ack` arrives, first read the peer's Resume note. If you are settling
  (Settling below) or it already says `Filed:`, apply nothing: drop the edit
  and its `Waiting on:` entry and tell your user. Otherwise make one edit of the
  file that rewrites the whole section the edit touches (Interface or Goal)
  with the change applied, adds the dated Decisions line, removes that `edit:`
  line from `Doing:` and that ack from `Waiting on:` (other entries there
  stay). One edit cannot be split by a compaction, and rewriting the section
  twice changes nothing.
- Unsure whether the ack arrived, send the `ask:` again. An `ack` for an edit
  not in your `Doing:` is ignored. On `answer: filed <date>, no edit`, drop
  every pending `edit:` of yours and its `Waiting on:` entry, tell your user,
  and treat any edit you acked from the sender as not agreed unless it is
  already in the Interface. A proposer that never writes an agreed edit leaves
  it unapplied.
- Write the peer's session name from `hello:` or `answer:` into your own
  `Peer:` line; settle sends to that name.
- Read the file before editing it, and touch only the sections you may edit
  (table above); both sides write it, so a stale copy overwrites the other's
  change.
- Update your own Resume note before waiting on the peer and before a
  compaction.
- The peer session name in a Resume note is a hint. Re-resolve with
  `ListAgents` from the peer's repo name ([SKILL.md](SKILL.md) §2).
- Settled: see Settling below.

## Settling

Starts when a user says the interface is settled, and needs nothing from the
peer ([SKILL.md](SKILL.md) §7).

Each side acts alone; nothing is asked of the peer, so a gone or busy peer
cannot stall it.

1. File an issue in your own repo with the Interface copied in as it stands and
   the contract path cited. From here on apply no edit, even an acked one.
   Reloaded mid-settle with no `Filed:`: look for that issue in your repo before
   filing again, then finish the settle.
2. In one edit, write `Filed: <date>` in your own Resume note, drop every
   pending `edit:` line from `Doing:` and those acks from `Waiting on:` (other
   entries stay). Then delete your own pointer, tell the peer
   `answer: filed <date>, no edit` once, even with nothing pending (use the
   session name you hold; skip it if you hold none or the send fails; never
   call `ListAgents`), and ack no further Interface edits. Answer a later edit
   proposal the same way. Beyond the issue, record the Interface in your repo's
   docs only when your user asks.
3. Settling never stops at "no live peer" ([SKILL.md](SKILL.md) §2). Once
   `Filed:` is in your own Resume note, do not re-resolve the peer.
4. Whenever you next read the file, check the peer's Resume note. The side that
   writes the second `Filed:` tells its user. When both say `Filed:`, either
   user deletes this file by hand. A peer that never files
   leaves the file until its user decides.
