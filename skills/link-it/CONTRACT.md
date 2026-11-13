# Contract file

One file per repo pair at `${XDG_DATA_HOME:-~/.local/share}/do-it-bridge/<a>--<b>.md`.
Written in the subagent voice ([VOICE.md](../it-core/VOICE.md)): one-liners,
payload verbatim.

## Sections

| Section | Holds | Who edits |
|---------|-------|-----------|
| Goal | What the two repos are agreeing | Either, once, at handshake |
| Interface | The agreed shape: endpoints, types, events, fields | Provider side, only after the peer's `ack` |
| Open questions | One line each, owner named | Either |
| Decisions | Dated one-liners, newest last | Either, after an `ack` |
| Resume: <repo> | One per side: doing, waiting on, peer session name, date | That side only |

## Worked example

```markdown
# billing-api -- web-app

## Goal
web-app calls billing-api for invoice totals.

## Interface
GET /invoices/{id}/total -> {"cents": int, "currency": "USD"}
Errors: 404 unknown id. 401 no token.

## Open questions
- Pagination of /invoices. Owner: billing-api.

## Decisions
- 2026-11-13: totals in cents, never floats. ack by both.

## Resume: billing-api
Doing: add /total. Waiting on: web-app ack on currency field.
Peer: web-app session "web-app-3". Date: 2026-11-13.

## Resume: web-app
Doing: client stub. Waiting on: pagination answer.
Peer: billing-api session "billing-1". Date: 2026-11-13.
```

## Rules

- Change Interface only after the peer's explicit `ack` message; log the
  decision with its date.
- Update your own Resume note before waiting on the peer and before a
  compaction.
- The peer session name in a Resume note is a hint. Re-resolve with
  `ListAgents` from the project name.
- Settled: delete the file by hand ([SKILL.md](SKILL.md) §7).
