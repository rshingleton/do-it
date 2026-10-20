---
name: log-it
description: File a bug, feature request or deferral as an issue with acceptance criteria in the configured tracker (local docs/issues/ by default, or GitHub or Jira) without planning it. Use when the user reports a bug, asks to file or open an issue or ticket, pastes an email or ticket text, or when another step finds out-of-scope work that needs its own plan.
---

# log-it

Intake only. Records work before anyone plans it. Planning starts with
`/do-it <ref>` or `scope-it`. A one-line nice-to-have or circle-back item
with no done-criteria belongs on the to-do list instead (`todo-it`).

## 1. Context

Read only what sharpens the issue: the file or error the user named, nearby
code, the area's context (it-core), relevant ADRs. Note module names and domain terms; they
go in the body.

## 2. Probe

Ask at most three questions, all in one turn, each with your best guess, and
only for gaps that change what "done" means:

| Type | Probe for |
|------|-----------|
| bug | steps to reproduce, expected vs actual, error output |
| feature | the user need, the behaviour, edge cases |
| defer | why deferred, what unblocks it |

Skip probing when the request is already specific, when the text was pasted
verbatim, or when another step is filing out-of-scope work.

## 3. Write

Build the body from [TEMPLATE.md](TEMPLATE.md). Pasted email or ticket text
goes verbatim under Context.

Call the Skill tool with "track-it" and run its `create` operation with the
title, type, body and source. The tracker decides where it lands:

- `local` (default): `docs/issues/<slug>.md` with frontmatter `title`, `type`,
  `status: open`, `source`, optional `external_id`.
- `github` or `jira`: a remote issue; report its ref and URL.

## 4. From another step

`build-it`, `prove-it` and `ship-it` call this skill for work they find out of
scope (a bug next door, a `shortcut:` with no upgrade trigger, a rejected
assumption). They pass `source: <step>` and the file and line. No probing;
write it and return the ref.

## 5. Close

> Filed `<ref>`: <title>. **Next:** `/do-it <ref>` when you want it built.

## Rules

- Do not plan, estimate phases or write code here.
- One issue per problem. Two problems in one paste become two issues.
- No secrets in the body. Redact tokens from pasted logs and say so.
