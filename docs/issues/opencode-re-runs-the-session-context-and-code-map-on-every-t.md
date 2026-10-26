---
title: OpenCode re-runs the session context and code map on every turn
type: bug
status: open
source: user
---

## Context

Found reviewing a handoff note against the code (2026-10-25). `.opencode/plugins/do-it.mjs:75` registers `experimental.chat.system.transform` (v1) and `ctx.session.hook('context')` (v2). Both call `decide('session', { cwd })` on every model request, which runs `sessionContext` in `hooks/lib/context.mjs`: it rebuilds the posture, project docs and the code map (`codeMap`, a `git ls-files` spawn with a 1.5 s timeout in `hooks/lib/codemap.mjs`) each time. Claude Code runs the same code once, at session start.

## Problem

On OpenCode the full session context is re-injected and recomputed on every turn. Each turn pays a `git ls-files` walk plus the context text again in the prompt. The handoff's "quadratic" claim is wrong (the repeated prefix is linear in turns, and providers cache it), but the per-turn recompute and the repeated text are real. Related: T46 (cache the code map).

## Acceptance

- The code map and doc resolution are computed once per session (or cached by HEAD and index mtime) on both OpenCode hosts
- Whether later turns need the full text or a short reminder is decided from a measured 10-turn session, and the decision is recorded in `docs/DESIGN.md` section 8
- A test calls the plugin's context hook twice and shows the second call does not re-run the map

## Notes

`.opencode/plugins/do-it.mjs:75,95`, `hooks/lib/decide.mjs:36`, `hooks/lib/context.mjs:109`.
