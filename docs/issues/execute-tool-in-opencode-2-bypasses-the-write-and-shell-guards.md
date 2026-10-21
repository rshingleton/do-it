---
title: execute tool in OpenCode 2 bypasses the write and shell guards
type: bug
status: open
source: opencode-v2-integration-gaps
---

## Context

OpenCode 2.1.2 has an `execute` tool (`input: {code}`) that runs JavaScript
with a `tools` object, so a model can write files and run commands without
calling `write`, `edit` or `shell`. do-it's `execute.before` hook maps only
write, edit, patch, apply_patch, multiedit, bash and shell to checks
(`.opencode/plugins/do-it.mjs`, `KINDS`). Seen in a live run
(`docs/research/opencode-v2-integration.md`, "Run on OpenCode 2.1.2").

## Problem

A secret or a `git commit` of a staged secret passes the guards when it goes
through `execute`.

## Acceptance

- Decide what the guards can see in an `execute` call: the code text only, or
  the nested tool calls (do they also fire `execute.before`?). Check on v2.
- If nested calls fire the hooks, record that and add a test fixture; if
  not, scan the `code` text for the same secret rules, or document the gap.
