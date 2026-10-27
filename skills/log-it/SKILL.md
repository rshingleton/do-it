---
name: log-it
description: Record and manage the backlog in one place. File an issue for a bug, feature request, deferral, nice-to-have or idea, or a one-line to-do, without planning it; also lists, reviews, closes, drops or promotes open items. Use when the user asks to file an issue or ticket, reports a bug, pastes an email or ticket text, says todo, note this, remember to, park this, circle back or nice to have, asks what is on the list.
argument-hint: "[text to file | list [type] | review | done <id> | drop <id> | promote <id>]"
---

# log-it

Intake and backlog. Records work before anyone plans it. Planning starts with
`/do-it <ref>` or `scope-it`. Two stores, one entry:

| Store | Holds | Where |
|-------|-------|-------|
| Issue | bug, feature, defer: done-criteria, status, maybe a remote ref | the configured tracker, via `track-it` (local default `docs/issues/<slug>.md`) |
| To-do | nice-to-have, idea, circle-back, question, debt: one line | the repo's to-do file (project docs; default `docs/TODO.md`), format in [FORMAT.md](FORMAT.md) |

## 1. Pick the mode

| The request is | Mode |
|----------------|------|
| Something to record: a report, a paste, a note, several items | Add (§2) |
| What is on the list, or a type | List ([TODO.md](TODO.md)) |
| Walk the open items | Review ([TODO.md](TODO.md)) |
| `done`, `drop` or `promote` with an id or ref | Close or promote ([TODO.md](TODO.md)) |

## 2. Classify

Split the input into one entry per actionable thing, then sort each:

| Signal | Kind |
|--------|------|
| Repro steps, an error, expected vs actual, pasted email or ticket text, "file an issue/ticket", acceptance criteria wanted | issue: `bug` or `feature` |
| Real work set aside with a reason and an unblock | issue: `defer` |
| One line, "note", "park", "circle back", "nice to have", "remember to", an idea, a debt | to-do |
| Unclear | to-do |

A caller's `kind: todo|issue` skips this table. Say each call in one line and
how to change it: "Filed T73 as a to-do; say 'promote T73' for an issue."

## 3. Issue path

1. **Context.** Read only what sharpens the issue: the file or error named,
   nearby code, the area's context (it-core), relevant ADRs. Note module names
   and domain terms for the body.
2. **Probe.** At most three questions in one turn, each with your best guess,
   only for gaps that change what "done" means: bug (steps, expected vs actual,
   error), feature (need, behaviour, edge cases), defer (why, what unblocks).
   Skip when the request is specific, the text was pasted, or another step is
   filing. For Jira settle project, components and epic or parent (`tracker.mjs
   config` values recommended); "no" means `none` for that one.
3. **Write.** Body from [TEMPLATE.md](TEMPLATE.md); pasted text verbatim under
   Context. Call the Skill tool with "track-it" and run `create` with title,
   type, body and source (plus Jira project, components, epic or parent).
   Local: `docs/issues/<slug>.md` with `status: open`. GitHub or Jira: report
   the ref and URL.

## 4. To-do path

Follow the Add rules in [TODO.md](TODO.md): no questions, a tag, a source,
skip duplicates, reply with the new ids and their lines.

## 5. From another step

`build-it`, `prove-it`, `ship-it`, `sweep-it` and others call this skill for
out-of-scope work. They pass `source: <step>`, the file and line, and usually
`kind:`. No probing; write with the Jira defaults and return the ref or id.
When Jira refuses for a missing project, component or epic, ask the user once.

## 6. Close

> Filed `<ref>`: <title>. **Next:** `/do-it <ref>` when you want it built.

A to-do reply is its ids and lines only.

## Rules

- Do not plan, estimate phases or write code here.
- One entry per problem. Two problems in one paste become two entries.
- No secrets in the body. Redact tokens from pasted logs and say so.
