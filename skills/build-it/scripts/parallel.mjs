#!/usr/bin/env node
// Parallel build plumbing that never touches the user's index, branch or stash.
//   snapshot <id> --base <ref>  adopt the working tree as a scratch commit on do-it/<id>
//   land <id>                   apply the scratch delta to the working tree, or change nothing
// Prints one JSON line. See ../PARALLEL.md.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git, gitOut } from '../../do-it/scripts/git.mjs';
import { loadConfig } from '../../track-it/scripts/config.mjs';
import { isMain } from '../../it-core/scripts/is-main.mjs';

const posix = (p) => p.split(path.sep).join('/');

// A patch is bytes: gitOut decodes utf8, which turns a latin1 byte into U+FFFD before it is applied.
function gitBytes(cwd, args, input) {
  const r = git(cwd, args, 'buffer', process.env, { input });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr.toString().trim()}`);
  return r.stdout;
}

// Repo-relative dirs the adopt commit leaves alone: the planning dir and the issue store, read
// from the same config work.mjs uses. One outside the repo has nothing to exclude.
function excludes(top) {
  const { root, values } = loadConfig({ cwd: top });
  return [values.DO_IT_PLANNING_DIR, values.DO_IT_ISSUES_DIR || 'docs/issues']
    .filter(Boolean)
    .map((p) => posix(path.relative(root, path.resolve(root, p))))
    .filter((rel) => rel && rel !== '..' && !rel.startsWith('../') && !path.isAbsolute(rel));
}

export function snapshot(cwd, id, base) {
  const top = gitOut(cwd, ['rev-parse', '--show-toplevel']).trim();
  const baseSha = gitOut(top, ['rev-parse', '--verify', `${base}^{commit}`]).trim();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-idx-'));
  // `:(exclude,literal)` is pathspec magic, which the caller's global pathspec switches would reject.
  const env = { ...process.env, GIT_INDEX_FILE: path.join(tmp, 'index') };
  for (const k of ['GIT_LITERAL_PATHSPECS', 'GIT_GLOB_PATHSPECS', 'GIT_NOGLOB_PATHSPECS']) delete env[k];
  let sha;
  try {
    // Start from the base tree so an excluded path keeps its base content, then take the working tree.
    gitOut(top, ['read-tree', baseSha], env);
    gitOut(top, ['add', '-A', '--', '.', ...excludes(top).map((p) => `:(exclude,literal)${p}`)], env);
    const tree = gitOut(top, ['write-tree'], env).trim();
    const baseTree = gitOut(top, ['rev-parse', `${baseSha}^{tree}`]).trim();
    sha = tree === baseTree
      ? baseSha
      : gitOut(top, ['commit-tree', tree, '-p', baseSha, '-m', `${id} adopt (scratch)`], {
        ...env,
        GIT_AUTHOR_NAME: 'do-it', GIT_AUTHOR_EMAIL: 'do-it@localhost',
        GIT_COMMITTER_NAME: 'do-it', GIT_COMMITTER_EMAIL: 'do-it@localhost',
      }).trim();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  gitOut(top, ['branch', `do-it/${id}--snapshot`, sha]);
  gitOut(top, ['branch', `do-it/${id}`, sha]);
  return { branch: `do-it/${id}`, snapshot: sha, root: path.join(path.dirname(top), `${path.basename(top)}.do-it`, id) };
}

// The user's diff config (prefixes, colour, external drivers, textconv) must not shape a patch git apply reads.
const PLAIN_DIFF = ['diff', '--binary', '--no-ext-diff', '--no-textconv', '--no-color', '--src-prefix=a/', '--dst-prefix=b/'];

export function land(cwd, id) {
  const branch = `do-it/${id}`;
  const snap = `${branch}--snapshot`;
  let top;
  try {
    top = gitOut(cwd, ['rev-parse', '--show-toplevel']).trim();
    for (const ref of [snap, branch]) gitOut(top, ['rev-parse', '--verify', `${ref}^{commit}`]);
  } catch (e) {
    return { landed: false, reason: `no scratch branch for ${id}: ${e.message}`, branch };
  }
  try {
    const patch = gitBytes(top, [...PLAIN_DIFF, snap, branch]);
    // -z: names come back raw, where plain output quotes a non-ASCII one.
    const files = gitOut(top, ['diff', '--name-only', '-z', snap, branch]).split('\0').filter(Boolean);
    if (!patch.length) return { landed: true, files };
    // apply is all or nothing: the dry run is the guard, and a failed check never reaches the real one.
    // --whitespace=nowarn keeps a user's apply.whitespace=fix from editing the landed bytes.
    gitBytes(top, ['apply', '--check', '--whitespace=nowarn'], patch);
    gitBytes(top, ['apply', '--whitespace=nowarn'], patch);
    return { landed: true, files };
  } catch (e) {
    return { landed: false, reason: e.message, branch };
  }
}

function main(argv) {
  const [cmd, id, ...rest] = argv;
  const flag = rest.indexOf('--base');
  if (!id) throw new Error('usage: parallel.mjs snapshot <id> --base <ref> | land <id>');
  if (cmd === 'snapshot') {
    if (flag < 0 || !rest[flag + 1]) throw new Error('snapshot needs --base <ref>');
    return snapshot(process.cwd(), id, rest[flag + 1]);
  }
  if (cmd === 'land') return land(process.cwd(), id);
  throw new Error(`unknown command ${cmd}`);
}

if (isMain(import.meta.url)) {
  try {
    console.log(JSON.stringify(main(process.argv.slice(2))));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
