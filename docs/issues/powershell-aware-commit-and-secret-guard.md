---
title: PowerShell-aware commit and secret guard
type: feature
status: open
source: windows-support
---

## Context

Filed by `windows-support` (phase 5) as a deliberate non-goal. On Windows the
PreToolUse hook matches only the `Bash` tool (Git Bash). `hooks/lib/shell.mjs`
parses bash grammar: heredocs, `;&|`, `cd` chains, `git commit` detection.
Claude Code on Windows also offers a `PowerShell` tool, which the commit and
secret guard does not see.

## Problem

A `git commit` issued through the PowerShell tool skips the staged-diff secret
scan and the commit-message id check. File-edit checks (Write, Edit) are
unaffected and run on every platform. A half-correct PowerShell parser could
give false assurance, so the guard was left Bash-only and documented.

## Acceptance

- A `git commit` through the PowerShell tool is scanned like the Bash one, or the README states plainly that it is not and how to avoid it
- The hook matcher and `hooks/lib/shell.mjs` have tests for PowerShell command shapes: `;` and `-and` chains, backtick escapes, here-strings, `git -C` forms
- A command the PowerShell parser cannot read fails open with a note, as the bash path does

## Notes

- Plan: `docs/planning/windows-support/README.md` (non-goals)
- Related: ADR 0006 (repo files untrusted for commands), `hooks/hooks.json` matcher
