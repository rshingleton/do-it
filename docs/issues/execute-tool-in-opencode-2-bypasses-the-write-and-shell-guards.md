---
title: execute tool in OpenCode 2 bypasses the write and shell guards
type: bug
status: closed
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

## Notes

Checked on OpenCode 2.1.2 with a probe plugin and the free model. The premise
did not reproduce: the `execute` tool runs a restricted JavaScript language
whose `tools` object holds only the catalog tools (`tools.opencode.*`, MCP
tools). `tools.write` and `tools.shell` throw `Unknown tool`; `fetch` refuses
`file://`; `import`, `process` and `require` are unavailable. So the code text
cannot write a file or run a command by itself.

A tool the code does call fires `execute.before` again, under the parent's
call id, with the nested tool's own name (`opencode_list_mcp_resources`,
`opencode_worktree_create`). If a later build puts `write` or `shell` in that
catalog, `KINDS` already maps them, so the guards see the nested call. No
scan of the `code` text is needed: it carries no secret the guards could stop
that a nested call would not also carry. Covered by a test in
`tests/hooks.test.mjs`; recorded in the research note.

## Log

- 2026-10-21: closed
