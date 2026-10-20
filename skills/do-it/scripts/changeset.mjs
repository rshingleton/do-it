// The change since a base ref: tracked edits plus untracked files, with some
// paths excluded. The work item's fingerprint hashes it; prove-it records the
// hash and ship-it compares it to detect code that moved after the audit.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export function hasObject(cwd, id) {
  return git(cwd, ['cat-file', '-e', id]).status === 0;
}

function git(cwd, args, encoding = 'utf8', env = process.env) {
  const r = spawnSync('git', args, { cwd, encoding, env, maxBuffer: 512 * 1024 * 1024 });
  if (r.error) throw r.error;
  return r;
}

// Resolve the base to a commit, or the empty tree before the first commit.
// An unknown base is an error, never an empty change.
export function resolveBase(top, base) {
  const r = git(top, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]);
  if (r.status === 0) return r.stdout.trim();
  // An item started before the first commit has the empty tree as its base.
  if (base === EMPTY_TREE) return EMPTY_TREE;
  if (git(top, ['rev-parse', '--verify', '--quiet', 'HEAD']).status !== 0) return EMPTY_TREE;
  throw new Error(`unknown base ref: ${base}`);
}

// Runs from the repo top level whatever `cwd` is, so the result is the same
// from any directory. `exclude` paths are relative to the top level.
export function changeset(cwd, base, { exclude = [] } = {}) {
  const topRes = git(cwd, ['rev-parse', '--show-toplevel']);
  if (topRes.status !== 0) throw new Error(`not a git repository: ${cwd}`);
  const top = topRes.stdout.trim();
  const resolved = resolveBase(top, base);
  const spec = ['--', '.', ...exclude.map((p) => `:(exclude)${p}`)];
  const diff = git(top, ['diff', '--binary', resolved, ...spec], 'buffer');
  if (diff.status !== 0) throw new Error(`git diff failed: ${diff.stderr}`);
  const others = git(top, ['ls-files', '-z', '--others', '--exclude-standard', ...spec], 'buffer');
  if (others.status !== 0) throw new Error(`git ls-files failed: ${others.stderr}`);
  const untracked = others.stdout.toString('utf8').split('\0').filter(Boolean);
  return { top, base: resolved, diff: diff.stdout, untracked };
}

// Hash of the change: the binary diff, then each untracked file's name and
// content (symlinks by target, directories such as nested repos by name),
// as a git blob id. Matches the shell version it replaced byte for byte.
export function fingerprint(cwd, base, opts) {
  const { top, diff, untracked } = changeset(cwd, base, opts);
  const parts = [diff];
  for (const name of untracked) {
    parts.push(Buffer.from(`${name}\n`));
    const file = path.join(top, name);
    let st;
    try {
      st = fs.lstatSync(file);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) parts.push(Buffer.from(`${fs.readlinkSync(file)}\n`));
    else if (st.isFile()) parts.push(fs.readFileSync(file));
  }
  const data = Buffer.concat(parts);
  return crypto.createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
}

// The working tree as a git tree object, untracked files included, written
// through a throwaway index: no commit, and the user's index is untouched.
// ship-it records it so a later run can show what the review changed.
export function snapshot(cwd, { exclude = [] } = {}) {
  const top = git(cwd, ['rev-parse', '--show-toplevel']).stdout.trim();
  if (!top) throw new Error(`not a git repository: ${cwd}`);
  const index = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-snap-')), 'index');
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    // splitIndex off: a throwaway index must not leave shared parts in .git.
    const run = (args) => {
      const r = git(top, ['-c', 'core.splitIndex=false', ...args], 'utf8', env);
      if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr}`);
      return r.stdout.trim();
    };
    // Start from a copy of the real index: its stat data spares re-reading
    // every tracked file. Without one, start from HEAD (or nothing).
    const fromHead = () => {
      fs.rmSync(index, { force: true });
      if (git(top, ['rev-parse', '--verify', '--quiet', 'HEAD']).status === 0) run(['read-tree', 'HEAD']);
    };
    const add = () => run(['add', '-A', '--', '.', ...exclude.map((p) => `:(exclude)${p}`)]);
    const real = path.resolve(top, git(top, ['rev-parse', '--git-path', 'index']).stdout.trim());
    if (fs.existsSync(real)) {
      fs.copyFileSync(real, index);
      // Keep the index's own mtime: git re-checks "racily clean" entries
      // against it, and a fresh mtime would hide same-size edits.
      const st = fs.statSync(real);
      fs.utimesSync(index, st.atime, st.mtime);
      try {
        add();
      } catch {
        // A copy git cannot use (corrupt, or an unknown index format): start from HEAD.
        fromHead();
        add();
      }
    } else {
      fromHead();
      add();
    }
    return run(['write-tree']);
  } finally {
    fs.rmSync(path.dirname(index), { recursive: true, force: true });
  }
}

// Files that differ between two snapshots, with a diffstat.
export function treeDiff(cwd, from, to) {
  const names = git(cwd, ['diff', '--name-status', from, to]);
  if (names.status !== 0) throw new Error(`git diff failed: ${names.stderr}`);
  const stat = git(cwd, ['diff', '--stat', from, to]).stdout.trim();
  const files = names.stdout.split('\n').filter(Boolean).map((l) => {
    const [status, ...rest] = l.split('\t');
    return { status, path: rest.join(' -> ') };
  });
  return { files, stat };
}
