# Install routes

do-it reaches a host by one of three routes. One is managed, two are reported.
This page is the proof: what each route carries, how each updates, what the
check prints, and what each host says it loaded when asked (see
[Probes](#probes)).

The check is one command, run from anywhere:

```bash
node scripts/doctor.mjs [--fetch] [--json]
```

It prints one line per recorded entry, a summary, a `ref:` footer for the
checkout itself, and one line per route that is not the symlink install. Exit 0
when everything is ok, 1 when any finding is not. `--fetch` updates the remote
refs first; without it every count comes from the last fetch, and the footer
names that fetch's age.

## What each route carries

| Route | Host | Carries | Install command | Update command | Check | Managed |
|-------|------|---------|-----------------|----------------|-------|---------|
| Symlink install | Claude Code and OpenCode | Skills, the five agents, the OpenCode commands and agents, hooks | `bash <(curl -fsSL 'https://raw.githubusercontent.com/rshingleton/do-it/main/scripts/install.sh')` | `git -C <checkout> pull --ff-only`, then `node <checkout>/scripts/install.mjs` | `node scripts/doctor.mjs`, the entry table and the `ref:` footer | Yes |
| Claude Code plugin | Claude Code only | Skills, agents (namespaced, `do-it:it-reviewer`), hooks | `claude plugin marketplace add rshingleton/do-it`, then `claude plugin install do-it@do-it` | `/plugin marketplace update do-it` | `node scripts/doctor.mjs`, the `plugin:` line | No, reported |
| `skills` CLI | Any host the CLI supports | Skills only | `npx skills@latest add rshingleton/do-it -a opencode` (add `-g` for the global install) | `npx skills@latest update` for a git source; `npx skills@latest add <path>` for a local one | `node scripts/doctor.mjs`, the `skills CLI:` line | No, reported |

Why the symlink install is the managed one: it is the only route that carries
the OpenCode commands and agents, and the only one that serves both hosts at
once, and it is what the one-liner bootstrap runs. A project `skills` CLI
install carries skills alone and puts a second copy in that project's
`.agents/skills`, where OpenCode's precedence order decides which copy wins. A
global CLI install (`-g`) writes into `~/.agents/skills`, the same folder the
symlink install fills, and replaces its links with copies. Either way, one
route per host ([ADR 0013](../adr/0013-routes-and-the-version-gate.md)).

Every command in the Update column is one `node scripts/doctor.mjs` prints, on
the finding it fixes. With all 110 entries ok, the plugin current and no CLI entry
recorded, this checkout's own run prints one of them: the ref fix in the footer.
The others print on their own finding: the symlink install command on any entry
that is not ok (shown below), `/plugin marketplace update do-it` on a stale
plugin the host reads in place, `claude plugin update do-it@do-it` on a stale
cached one, `npx skills@latest update` on a recorded CLI git entry, and
`npx skills@latest add <path>` on a recorded local one (`scripts/doctor.mjs`,
the plugin and CLI route sections).

An empty home shows the install fix on all 110 entries:

```powershell
$h = Join-Path $env:TEMP 'do-it-probe-home'
node scripts/doctor.mjs --home $h
```

```text
missing     <probe dir>\.claude\skills\build-it  no link; the plan has one to <checkout>\skills\build-it  fix: node <checkout>\scripts\install.mjs
summary 110 entries: 0 ok, 110 missing
```

That run exits 1 and installs nothing.

## What the doctor prints on this machine

Its closing lines, from `node scripts/doctor.mjs` in this checkout on
2026-11-16, with the branch and refs it names replaced by placeholders:

```text
summary 110 entries: 110 ok; 49 entries not ours (left alone)
  ref: <branch> @ <sha>, upstream <upstream ref> (0 ahead, 0 behind), <followed ref> (1 behind), fetched 8h ago
  ref: 1 commit behind <followed ref>; the install follows it  fix: git -C <checkout> pull --ff-only
  plugin: ok, the folder is 0.2.0, the manifest 0.2.0; the host reads this checkout in place
  skills CLI: not installed on this route
```

An entry finding carries its own fix, the installer that places it: `fix: node
<checkout>\scripts\install.mjs`. An edited copy gets the same command with
`--force`, because only `--force` replaces a copy somebody changed. The doctor
runs none of these: it detects and prints.

## The plugin: cached copy or in place

`claude plugin list --json` reports both what the host installed and what it
serves. On this machine, for `do-it@do-it`:

```text
version       0.1.0
installPath   <plugin cache>\do-it\do-it\0.1.0
readFromFolder   <checkout>
folderVersion  0.2.0
```

The cached copy is an install-time snapshot at 0.1.0. The folder is the checkout
at 0.2.0. The host reads the folder, so the version that loads is 0.2.0, and the
doctor says so. Remove `readFromFolder` and the same entry serves 0.1.0 from the
cache: an install that looks present and is a release behind. That is why the
plugin line reads the folder's version when the host does, and the cache's
version when it does not.

An update moves the version that loads only when `version` in
`.claude-plugin/plugin.json` moves. The host compares that string rather than
the files. Every commit since the first still ships to plugin users as 0.1.0
unless the string changes, so `scripts/version-gate.mjs` fails a change under
`skills/`, `agents/` or `hooks/` that leaves it alone, and CI runs the gate.

## One install, four hosts

`~/.agents/skills` is not OpenCode's directory. OpenCode reads it, and so do
Gemini CLI, GitHub Copilot and Antigravity. The symlink install writes every
skill there as well as into `~/.claude/skills`, so one install serves four
hosts, and a skill added to this checkout reaches three of them with no host
specific setup.

## A frontmatter field outside the portable core

A host reads `name` and `description`, and Claude Code also reads its own
fields: `model`, `argument-hint`, `allowed-tools` and
`disable-model-invocation`. Two more, `license` and `compatibility`, are
portability fields a host accepts without acting on them. Anything outside
those three groups is ignored silently: nothing warns, and the skill loads
without that field taking effect. `npm run check` is the only guard, and it
fails the build on a key from that outside group, because no host can be said
to read it. That list is `scripts/check.mjs`'s `SKILL_KEYS`, and the portable
core is `name` plus `description`.

## Probes

Files on disk prove what an install placed. They do not prove a host loaded it.
So each route is asked, headless, from a temp directory outside this repo
(`<probe dir>`), which no checkout configures.

**Claude Code plugin route.** From the temp directory above:

```bash
claude -p "List the exact names of every available skill whose name starts with it- or do-it-" --output-format json
```

The JSON envelope's `result` field:

```text
No available skill has a name starting with `it-` or `do-it-`. The skills in the do-it family are named `debug-it`, `design-it`, `doubt-it`, `grill-it`, `guard-it`, `link-it`, `log-it`, `look-it-up`, `map-it`, `merge-it`, `name-it`, `review-it`, `sketch-it`, `skill-it`, `sweep-it`, `test-it` and `track-it`. They all end in `-it` rather than starting with it.

`it-builder`, `it-planner`, `it-reviewer`, `it-scout` and `it-skeptic` (also listed as `do-it:it-*`) do exist, but they are agent types, not skills.
```

**Symlink install route.** From the same directory, on the configured default
model (no `-m`):

```bash
opencode run "List the exact names of every available skill whose name starts with it- or do-it-"
```

The host printed its model line and one Glob line above this answer:

```text
**None.** No available skill has a name starting with `it-` or `do-it-`. I checked the full available-skills list and the skill directories on disk to confirm.

You may be thinking of two nearby things:

- **Subagents (not skills)** named with an `it-` prefix: `it-builder`, `it-planner`, `it-reviewer`, `it-scout`, `it-skeptic`. These are spawned via the subagent tool, not loaded as skills.
- **Skills ending in `-it`** (suffix, not prefix): `debug-it`, `design-it`, `doubt-it`, `grill-it`, `guard-it`, `link-it`, `log-it`, `map-it`, `merge-it`, `name-it`, `review-it`, `sketch-it`, `skill-it`, `sweep-it`, `test-it`, `track-it`.
```

Both answered the question as asked: no skill name starts with `it-` or
`do-it-`, because every name carries `it` as an inner segment, most of them as a
suffix. The names the Claude Code answer reported (`it-builder` and the rest)
are the namespaced agents, not skills. As a probe of what loads, the question
was the wrong shape, so it was asked again with the suffix:

```bash
claude -p "List the exact names of every available skill whose name ends with -it. Names only, one per line." --output-format json
opencode run "List the exact names of every available skill whose name ends with -it. Names only, one per line."
```

Both printed the same sixteen, in this order:

```text
debug-it
design-it
doubt-it
grill-it
guard-it
link-it
log-it
map-it
merge-it
name-it
review-it
sketch-it
skill-it
sweep-it
test-it
track-it
```

That matches the model-invocable set exactly: sixteen skills whose name ends in
`-it` and which the model may pick up unasked. `look-it-up` is model-invocable
and ends in `-up`, so a suffix-`-it` question leaves it out. Thirteen skills are
typed (`build-it`, `deepen-it`, `do-it`, `finish-it`, `it-core`, `pass-it`,
`prove-it`, `retro-it`, `roadmap-it`, `scope-it`, `setup-it`, `ship-it`,
`usage-it`), carry `disable-model-invocation`, and never appear in a bare
prompt's skill list: the host hides them from the model, so a probe can only
witness them by typing the slash command.

### The CLI route, probed on macOS

Probed on 2026-11-16 with `skills` CLI 1.9.0 on macOS, in a temp directory
outside this checkout and with a temp `HOME` for the global run, both with
`DO_NOT_TRACK=1`:

```bash
npx skills@latest add rshingleton/do-it -a opencode -y
npx skills@latest add rshingleton/do-it -a opencode -g -y
```

Each run installed all 30 skills and exited 0. The project run wrote
`./.agents/skills/<name>/` as real directories, copies rather than links, and
`./skills-lock.json` at version 2 with one entry per skill:

```text
source        rshingleton/do-it
sourceType    github
commit        0b5e4e12fd63aeedb9e5a77cea273967962d43a9
skillPath     skills/<name>/SKILL.md
computedHash  <64 hex, a content hash>
```

The global run (`-g`) wrote `~/.agents/skills/<name>/` and
`~/.agents/.skill-lock.json` at version 3, whose entry carries `sourceUrl`,
`skillFolderHash` (40 hex, a git tree SHA), `installedAt` and `updatedAt`. It
is not `~/.config/opencode/skills`: on 1.9.0 the `-a opencode` global
destination is the same `~/.agents/skills` the symlink install fills, and the
CLI replaced a symlink planted there with a copy. `npx skills list` credits the
project install to five hosts by name (Antigravity CLI, Cursor, Gemini CLI,
GitHub Copilot, OpenCode) and credits a sixth it does not record, so no name is
given for it here.

The doctor runs none of this. A machine with either lock gets a `skills CLI:`
line naming its scope, source, path, hash, commit and date, plus the command
that refreshes it.

What the probes settle and what they cannot: the plugin route serves the
checkout's skills, with the five do-it agents namespaced under `do-it:`, the
symlink install serves the same sixteen to OpenCode, and the CLI runs show where
1.9.0 writes its files on macOS and what its two locks record. No probe can see
a typed skill, and none can tell a later host update's effect, so the check to
re-run after an update is the doctor plus the two skill-list probes above.
