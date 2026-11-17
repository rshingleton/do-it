#!/usr/bin/env node
// The DO_IT_PROTECTED_BRANCHES value setup-it should write for a repo: the value in force
// (default main,master) plus the remote's default branch when it is not already listed.
// Reads the local `refs/remotes/origin/HEAD` only (set by `git clone` or
// `git remote set-head origin -a`), never the network. Prints JSON
// {default, current, value, write, skipped}; `write` is false when there is no remote HEAD,
// the branch is already protected, or `skipped` names why it is not proposed: a dangling
// ref (a symbolic ref still exits 0 for a deleted branch, so `rev-parse --verify` decides)
// or a name holding a comma (the protected list is comma-separated, so it would split in
// two). Always exits 0. A git that cannot spawn is not an answer to print, so `git()`
// throws and this lets it out on purpose: a missing git is a broken install.
//
// Usage: default-branch.mjs [dir]

import path from 'node:path';
import { git } from '../../do-it/scripts/git.mjs';
import { loadConfig } from '../../track-it/scripts/config.mjs';
import { isMain } from '../../it-core/scripts/is-main.mjs';

export function protectedBranches(dir) {
  const current = loadConfig({ cwd: dir }).values.DO_IT_PROTECTED_BRANCHES;
  const head = git(dir, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  const def = head.status === 0 ? head.stdout.trim().replace(/^origin\//, '') : null;
  // The symbolic ref outlives the branch it names; only rev-parse --verify says the target exists.
  const resolved = Boolean(def) && git(dir, ['rev-parse', '--verify', 'refs/remotes/origin/HEAD']).status === 0;
  const listed = current.split(',').map((b) => b.trim()).filter(Boolean);
  const skipped = !def ? null : !resolved ? 'dangling origin/HEAD' : def.includes(',') ? 'comma in the name' : null;
  const write = Boolean(def) && !skipped && !listed.includes(def);
  return { default: def, current, value: write ? [...listed, def].join(',') : current, write, skipped };
}

if (isMain(import.meta.url)) {
  console.log(JSON.stringify(protectedBranches(path.resolve(process.argv[2] || '.')), null, 2));
}
