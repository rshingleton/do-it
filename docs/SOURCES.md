# Outside sources

One row for each outside source that shaped a skill, hook or doc here. Written
before the source is used (see [CONTRIBUTING.md](../CONTRIBUTING.md) and
[ADR 0017](adr/0017-source-licence-gate.md)). The README Credits table is the
public view; this file is the licence record.

- The first ten rows were backfilled on 2026-11-19; their dates are the check
  date, not the date the source was first used.
- **Licence:** the SPDX id from the repo's own licence file, or `none` when it
  has none. Read from the GitHub licence API.
- **Use:** `idea-only` means the idea is taken and the text is written fresh in
  this repo's words. `copied` means text or code was taken, which needs a
  licence that allows it and the attribution it asks for. No row is `copied`
  today.
- Runtime tools (Claude Code, OpenCode, the GitHub CLI, the Jira REST API,
  Node.js) are used, not borrowed from, and keep their own terms. They have no
  row.

| Source | Licence | Use | What was taken | Checked |
|--------|---------|-----|----------------|---------|
| [rshingleton/skills](https://github.com/rshingleton/skills) | MIT | idea-only | The Doc Cycle this repo began as a rewrite of | 2026-11-19 |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | MIT | idea-only | Lifecycle shape, batch approval, lane XS skip rule, routing eval, adversarial check | 2026-11-19 |
| [denyszorinets/ballet](https://github.com/denyszorinets/ballet) | none | idea-only | Fresh-context audit stages, outcome routing, audit round cap, assume-or-ask | 2026-11-19 |
| [dietrichgebert/ponytail](https://github.com/dietrichgebert/ponytail) | MIT | idea-only | Reuse-first posture, one always-on core, finding format, drift check, usage ledger | 2026-11-19 |
| [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills) | none | idea-only | The four coding principles behind `it-core`, the `step -> verify:` plan form | 2026-11-19 |
| [juliusbrussee/caveman](https://github.com/juliusbrussee/caveman) | Apache-2.0 | idea-only | Terse voice and fixed report shapes for internal agent text | 2026-11-19 |
| [shinpr/claude-code-workflows](https://github.com/shinpr/claude-code-workflows) | MIT | idea-only | Batch approval, commit gate, boundary check, readiness states, final review | 2026-11-19 |
| [glebis/claude-skills](https://github.com/glebis/claude-skills) | MIT | idea-only | Two gates, flaky check as failure, plan audit, short retro lines | 2026-11-19 |
| [mattpocock/skills](https://github.com/mattpocock/skills) | MIT | idea-only | The ideas behind the discipline skills, written fresh here (no text adapted; the owner confirmed 2026-11-19) | 2026-11-19 |
| [chinmaypandya/noman](https://github.com/chinmaypandya/noman) | MIT | idea-only | Review checks: unrequested public surface weighed higher, cause not symptom, hard-coded lists | 2026-11-19 |

A source with licence `none` is all rights reserved: take the idea, never the
text. Confirm with the author before relying on more than the idea.
