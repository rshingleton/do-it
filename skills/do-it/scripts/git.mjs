// The one git wrapper of the do-it scripts: a spawnSync result with a large output buffer, so a
// full buffer fails the call instead of reading as "no output". Each caller states its env:
// changeset.mjs and the run readers need the plain one (`:(exclude)` is pathspec magic), the
// commit path needs LITERAL, where a named path is a file name and never a glob.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const LITERAL = { ...process.env, GIT_LITERAL_PATHSPECS: '1' };

const MAX_OUT = 512 * 1024 * 1024;

// `limits` are spawnSync options (`input`, `timeout`, `maxBuffer`, `stdio`). Throws when git cannot run
// (not installed, or the cwd is gone): callers that read a failed status as a plain answer (roadmap.mjs
// `isTracked`, work.mjs `baseRef` and `digest`, the commit rollback) let that propagate on purpose, since a
// missing git is a broken install and no state to recover from.
export function git(cwd, args, encoding = 'utf8', env = process.env, limits = {}) {
  const r = spawnSync('git', args, { cwd, encoding, env, maxBuffer: MAX_OUT, ...limits });
  if (r.error) throw r.error;
  return r;
}

// stdout of a git that must succeed, as is; a failure throws with its stderr.
export function gitOut(cwd, args, env = process.env, input) {
  if (process.platform === 'win32') return gitOutViaFile(cwd, args, env, input);
  const r = git(cwd, args, 'utf8', env, { input });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout;
}

let seq = 0;

// On Windows a large stdout read through spawnSync's pipe can end in `spawnSync git EOF` (seen
// with a 1 MB status on Node 18 and 22), so git writes to a temp file and the file is read back.
// shortcut: a temp file per call, only on Windows; drop it once the oldest Node supported has the pipe fix.
function gitOutViaFile(cwd, args, env, input) {
  const tmp = path.join(os.tmpdir(), `do-it-git-${process.pid}-${seq++}.out`);
  const fd = fs.openSync(tmp, 'w');
  let r;
  try {
    r = spawnSync('git', args, { cwd, env, input, encoding: 'utf8', stdio: [input === undefined ? 'ignore' : 'pipe', fd, 'pipe'] });
  } finally {
    fs.closeSync(fd);
  }
  try {
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${(r.stderr || '').trim()}`);
    return fs.readFileSync(tmp, 'utf8');
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
