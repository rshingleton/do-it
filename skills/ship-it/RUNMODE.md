# Run mode

For [SKILL.md](SKILL.md) §2 and §3 when a run record exists for the item's
roadmap (`work.mjs run show <slug>`, slug from the item's `roadmap` file) and
its level is `full` or `ultra`. At `lite` follow SKILL.md as written. The
roadmap approval already covered the plan, so nothing here waits on the user.

## Defaults

Take §1 as written; a stale fingerprint still stops. In place of §2's question:

1. Ask nothing. Print the §2 "Show" list in the closing report.
2. Assumptions: keep all. Copy the plan's `assumptions:` into the run record
   (`work.mjs run set <slug> assumptions`), so the final review can list them.
3. Findings: file every audit Should and Nice finding and every surfaced
   `defects:` entry with `log-it`. Never fix them in the run.
4. Markers: a new `shortcut:` marker with no upgrade trigger is not filed.
   Append `marker: <path> <text>` to the record's `limits` for the digest.
5. Commit: follow [COMMITS.md](../build-it/COMMITS.md) and the record's
   `commit`. Mode `none`: leave the change uncommitted and say so. Otherwise
   commit the closing docs and roadmap edits from §3 step 2 with
   `work.mjs run commit`, never a push.

Then run §3 steps 1 and 2, and the commit step when step 5 applies. Close
with `work.mjs close <id>` once the commit holds, and return `done`.
