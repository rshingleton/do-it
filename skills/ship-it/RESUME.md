# Lane XS and resumed runs

Detail for [SKILL.md](SKILL.md) §1 and §3 step 2.

## Lane XS

- **Lane XS:** no state block. Run the project's checks; show the diff
  summary. `--ref` and `--todo` name the issue and to-do item it came from.
  Nothing uncommitted: the user committed it before this run; do §3 step 2's
  closes, leave those edits uncommitted and say so, then close the remote
  tracker (§3 step 4).

Lane XS with no id: "file one" calls `log-it`; the ref given or filed is
the commit id and joins `--ref` from here on.

## Resumed after review

- **Resumed after review** (`ship.prepared` set), no §2 question:
  - nothing uncommitted outside the plan: the user committed; close the remote
    tracker and the plan (§3 step 4);
  - fingerprint equals `ship.fingerprint`: ask one line, "Commit now with
    this message?" (show it), then §3 step 4;
  - it differs: the review edited files. Show `work.mjs review-diff <id>`
    (`files: null`: no snapshot, show `git status --short`) and the commit
    message, and ask one line: commit as reviewed (default), or re-audit first
    (default when a changed file is in a risk area,
    [LANES.md](../do-it/LANES.md)). As reviewed: `event ship-prepared`
    again, then §3 step 4. Re-audit: `event reaudit`; **Next:** `/prove-it <id>`.
