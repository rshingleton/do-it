// The one git wrapper of the do-it scripts: a spawnSync result with a large output buffer, so a
// full buffer fails the call instead of reading as "no output". Each caller states its env:
// changeset.mjs and the run readers need the plain one (`:(exclude)` is pathspec magic), the
// commit path needs LITERAL, where a named path is a file name and never a glob.

import { spawnSync } from 'node:child_process';

export const LITERAL = { ...process.env, GIT_LITERAL_PATHSPECS: '1' };

const MAX_OUT = 512 * 1024 * 1024;

// `limits` are spawnSync options (`input`, `timeout`, `maxBuffer`, `stdio`). Throws when git cannot run.
export function git(cwd, args, encoding = 'utf8', env = process.env, limits = {}) {
  const r = spawnSync('git', args, { cwd, encoding, env, maxBuffer: MAX_OUT, ...limits });
  if (r.error) throw r.error;
  return r;
}

// stdout of a git that must succeed, as is; a failure throws with its stderr.
export function gitOut(cwd, args, env = process.env, input) {
  const r = git(cwd, args, 'utf8', env, { input });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout;
}
