---
status: accepted
---

# Repo config files are untrusted for commands and endpoints

A repo's `.do-it/config.env` and `.do-it/local.env` are written by whoever controls the repo, and the hooks are on by default (ADR 0004). So two keys from those files apply only after the user has trusted their exact values: `DO_IT_LINT_CMD`, which the hooks run in a shell after every edit, and `JIRA_BASE_URL`, which receives the user's Jira token. `tracker.mjs trust` records a hash of the values (not the path) in the user's config directory; a changed value needs trusting again, and every clone or worktree with the same values shares one trust. Until then the user, environment or default value applies and the session notice names the ignored keys. Other keys stay as ADR 0003 describes them.

## Considered options

- **Trust the repo path.** An allowlist of repo roots is simpler, but a pulled commit could change the command with no review, and each worktree would need its own entry.
- **Never read these keys from repo files.** Safest, but it breaks the documented team setup, where one committed file carries the tracker URL and lint command for everyone.
- **Leave it.** Opening an agent in a cloned repo would then run that repo's chosen command, and send the user's token to its chosen host, with no prompt.

## Consequences

- Each developer runs `tracker.mjs trust` once per repo, and again whenever a teammate changes either value; setup-it offers it.
- `DO_IT_HOOKS=off` from a repo file is still honoured: turning checks off is a team choice, not code execution.

## Execution notes

- The same work closed the commit-scan bypasses from the 2026-10-19 sweep.
  The scan reads the commit's words with a small shell lexer (quotes,
  `$(...)`, heredocs, `$'...'`, redirects, `cd`/`pushd` before the commit),
  and whenever it cannot resolve the command for sure (unexpanded `$`, `~`
  or backticks in `-C` or a path, a failed git listing, paths matching
  nothing) it scans every tracked change from the repo root. Errors
  over-scan, never under-scan; the cost is an occasional block caused by an
  unrelated tracked file.
- Commits the hook does not recognise at all (after a newline, in a chain,
  behind `env` or `VAR=x`) and a relative `cd` after one that does not
  persist are open as T65; a redirect before the paths is T66.
- Audit Should items left as they are: the lexer could move to its own
  module with direct tests; `invalid()` in `checks.mjs` has three return
  states; `loadConfig` exposes trust internals (`config.trust`, unmasked
  values) to callers; a failed root listing is a silent allow (fail open);
  one trust hash covers both keys, so changing either needs a new trust.

