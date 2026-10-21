---
title: carriesVoice should check the agent file holds the voice block
type: bug
status: open
source: user
---

## Context

prove-it audit of the terse-voice work. `carriesVoice` in `hooks/claude.mjs:22-32` decides whether to inject the voice block into a subagent by checking that `agents/<name>.md` exists.

## Problem

It never checks that the file holds the block. An `agents/it-*.md` edited or added without `npm run gen` gets no voice from the file and none from the hook, until `npm run check` runs. An installed plugin copy has no check at all.

## Acceptance

- `carriesVoice` is true only when the agent file contains `<!-- voice:start -->` (the marker `scripts/lib/voice.mjs` owns)
- A test covers an agent file without the marker: the hook injects the block
- Hooks still fail open on a read error

## Notes

`hooks/claude.mjs:22-32`, `scripts/check.mjs:187`.
