---
status: Accepted
---

# Install copies by default, links only for development

The install used to place a link per skill, agent and OpenCode file. On POSIX that was a symlink; on Windows, where a symlink needs Developer Mode, a directory became a junction into the checkout. Either way the install only worked while the clone stayed at its recorded path, and every read of a skill resolved into that path. A host that asks before reading outside its project, which OpenCode 2 does with an `external_directory` `ask` rule, prompted on every skill read in every project. Someone who is not developing do-it should never have their development checkout wired into every project that loads a skill.

The default is now a copy: `scripts/install.mjs` copies each skill directory, agent file and OpenCode file into the host directories, and records each copy in `~/.claude/do-it/install.json`. `--link` keeps the link install for developing do-it itself, where live edits and no re-copy after a pull are worth reaching into the checkout. An install without `--link` turns this checkout's own links into copies, and `--link` turns this checkout's copies back into links, so the two modes are one command apart.

A recorded directory copy carries a tree hash, not a single file hash, so a re-run refreshes a copy whose source changed and leaves one the user edited alone, the same rules a copied file already followed. `--uninstall` removes only copies that still match their record, and the doctor reports a directory copy as `ok`, `stale copy` or `edited copy` by the same test.

## Options considered

- Keep links, and tell hosts to allow the checkout: rejected. It fixes one machine's prompts by handing every project access to a checkout it does not need, and the install still breaks when the clone moves.
- Copy on Windows only, link elsewhere: rejected. Two behaviours to document and test, and the source of the complaint is the link, not the platform.
- Copy by default, `--link` for development: chosen. The default has no path back to the checkout, and the development mode keeps the property that made links worth having.

## Consequences

- Updating a default install now needs the installer re-run after a pull. A `--link` install follows the pull on its own.
- Hooks and the OpenCode plugin are still registered by absolute path from the checkout the installer ran in, so that checkout stays on the machine. The copies settle the skill, agent and command reads, not the hook scripts. A host with hooks off needs no checkout at all.
- `install.json` grows to one record per copied entry, roughly 108 for this repository, with a tree hash per directory. The doctor reads the same records it already read.
- The junction fallback survives only under `--link`, where a Windows account without Developer Mode still gets a junction rather than a copy.
- A skill that resolves its own scripts through a relative path still works, because the copy is a full tree, not a partial one.

## Execution notes

- Four audit rounds each found a real defect: the `skills` CLI copy adopted by bare name, the guard missing under `--link`, and a recorded copy swapped for another kind deleted without `--force`. Each is now a test.
- `--link` rewrites a file it must store as a copy on every run, because a fallback copy is indistinguishable from a wanted link (T380).
- Hooks and the OpenCode plugin still register by absolute path from the checkout, so a default install with hooks on still needs it.
