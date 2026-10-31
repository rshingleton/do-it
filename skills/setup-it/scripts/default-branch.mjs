#!/usr/bin/env node
// The DO_IT_PROTECTED_BRANCHES value setup-it should write for a repo: the value in force
// (default main,master) plus the remote's default branch when it is not already listed.
// Reads the local `refs/remotes/origin/HEAD` only (set by `git clone` or
// `git remote set-head origin -a`), never the network. Prints JSON
// {default, current, value, write}; `write` is false when there is no remote HEAD or the
// branch is already protected, and always exits 0.
//
// Usage: default-branch.mjs [dir]

import path from 'node:path';
import { git } from '../../do-it/scripts/git.mjs';
import { loadConfig } from '../../track-it/scripts/config.mjs';
import { isMain } from '../../it-core/scripts/is-main.mjs';

export function protectedBranches(dir) {
  const current = loadConfig({ cwd: dir }).values.DO_IT_PROTECTED_BRANCHES;
  const r = git(dir, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  const def = r.status === 0 ? r.stdout.trim().replace(/^origin\//, '') : null;
  const listed = current.split(',').map((b) => b.trim()).filter(Boolean);
  const write = Boolean(def) && !listed.includes(def);
  return { default: def, current, value: write ? [...listed, def].join(',') : current, write };
}

if (isMain(import.meta.url)) {
  console.log(JSON.stringify(protectedBranches(path.resolve(process.argv[2] || '.')), null, 2));
}
