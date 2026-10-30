// A complete run's commit: one verified lane M phase, or one lane S slice, on
// a safe branch. Only a run record opts in; without one nothing here runs.
// It stages the paths it is given and never anything else, tags each phase
// commit locally, and never pushes. The message ends with the single do-it
// attribution line (the user's commit rule), so the commit guard allows it.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { showRun, setRun } from './run.mjs';

export const ATTRIBUTION = 'Build assistance with do-it: https://github.com/rshingleton/do-it';

// Literal pathspecs: a named path is a file name, never a glob, so `src/*`
// cannot stage what the slice did not map.
const ENV = { ...process.env, GIT_LITERAL_PATHSPECS: '1' };

function git(cwd, args, input) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', input, env: ENV });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim();
}

const lines = (s) => s.split('\n').filter(Boolean);

function currentBranch(cwd) {
  const r = spawnSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

function branchExists(cwd, name) {
  return spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${name}`], { cwd }).status === 0;
}

// The current branch when it is unprotected, else do-it/<roadmap-slug>,
// created (or switched to) before the first commit. A detached HEAD counts as
// protected. `undo` puts the repo back as it was found.
function safeBranch(cwd, slug, protectedList) {
  const now = currentBranch(cwd);
  const blocked = protectedList.split(',').map((b) => b.trim()).filter(Boolean);
  if (now && !blocked.includes(now)) return { name: now, undo() {} };
  const name = `do-it/${slug}`;
  if (now === name) return { name, undo() {} };
  const made = !branchExists(cwd, name);
  const from = now || git(cwd, ['rev-parse', 'HEAD']);
  git(cwd, made ? ['switch', '-q', '-c', name] : ['switch', '-q', name]);
  return {
    name,
    undo() {
      spawnSync('git', ['switch', '-q', ...(now ? [] : ['--detach']), from], { cwd, env: ENV });
      if (made) spawnSync('git', ['branch', '-q', '-D', name], { cwd, env: ENV });
    },
  };
}

// Every file the working tree changes, each with a hash of its content ('gone'
// when it is deleted), as `run verify` saw it. A rename is its new path plus its
// old path gone. Nothing is matched as a pattern: names are read, never expanded.
export function dirtyHashes(root) {
  const recs = spawnSync('git', ['status', '--porcelain', '-z', '-uall'], { cwd: root, encoding: 'utf8', env: ENV }).stdout.split('\0').filter(Boolean);
  const files = {};
  const hash = (f) => {
    const abs = path.resolve(root, f);
    if (!fs.statSync(abs, { throwIfNoEntry: false })?.isFile()) return 'gone';
    return spawnSync('git', ['hash-object', '--no-filters', '--', abs], { cwd: root, encoding: 'utf8' }).stdout.trim() || 'gone';
  };
  for (let i = 0; i < recs.length; i++) {
    const f = recs[i].slice(3);
    files[f] = hash(f);
    if (/[RC]/.test(recs[i][0])) files[recs[++i]] = 'gone';
  }
  return files;
}

// `paths` are the files the boundary check mapped to the slice. Returns the
// commit and its tag; throws, changing nothing in HEAD, when a gate fails.
export function commitSlice({ root, planningDir, config, items, slug, id, phase, docs = false, paths, limits = [] }) {
  const run = showRun(planningDir, slug);
  if (run.commit === 'none') throw new Error(`run ${slug} has commit mode none: nothing is committed`);
  if (run.commit === 'slice' && phase !== undefined) throw new Error(`run ${slug} commits one commit per slice, not per phase`);
  if (docs && phase !== undefined) throw new Error('--docs and --phase are separate commits');
  if (!docs && run.commit === 'phase' && phase === undefined && items.get(id).state.lane === 'm') {
    throw new Error('lane M in commit mode phase: name the phase (--phase n), or --docs for the closing docs');
  }
  const state = items.get(id).state;
  let subject;
  if (docs) {
    // The ship step: closing docs after every phase passed, no tag.
    const open = (state.phases || []).filter((x) => x.status !== 'done' || !x.verified);
    if (open.length || (!(state.phases || []).length && !state.verified)) throw new Error(`${id} has phases not verified yet; nothing committed`);
    subject = `${id}: closing docs`;
  } else if (phase !== undefined) {
    const p = (state.phases || []).find((x) => x.n === phase);
    if (!p) throw new Error(`${id} has no phase ${phase}`);
    if (p.status !== 'done' || !p.verified) throw new Error(`phase ${phase} has no passing verify-phase; nothing committed`);
    subject = `${id}: phase ${phase} ${p.title}`;
  } else {
    // One commit per slice: lane S has its own verified record, lane M needs every phase verified.
    if (state.lane === 'm') {
      const open = (state.phases || []).filter((x) => x.status !== 'done' || !x.verified);
      if (open.length || !(state.phases || []).length) throw new Error(`${id} has phases not verified yet; nothing committed`);
    } else if (!state.verified) throw new Error(`${id} has no passing verify-phase; nothing committed`);
    subject = `${id}: ${state.title}`;
  }
  if (!Array.isArray(paths) || !paths.length) throw new Error('commit needs the mapped paths (--paths a,b); never everything');
  if (paths.some((p) => p === '.' || p === '-A' || p === '--all' || p.startsWith('-') || p.startsWith(':'))) {
    throw new Error(`commit stages named files only, got ${paths.join(',')}`);
  }
  // A directory, even one deleted from disk, would stage every edit under it, other slices' included.
  for (const p of paths) {
    const onDisk = fs.statSync(path.resolve(root, p), { throwIfNoEntry: false })?.isDirectory();
    if (onDisk || lines(git(root, ['ls-files', '--', p])).some((f) => f !== path.normalize(p))) throw new Error(`commit stages named files only, ${p} is a directory`);
  }
  // Lane M's code commit follows its last verify: a named file that differs from what `run verify` saw refuses.
  // Files outside the named paths (the closing docs, a user's own edit) are not compared.
  if (!docs && phase === undefined && state.lane === 'm') {
    const seen = (run.gates ?? []).find((x) => x.work === id)?.verified_files;
    if (!seen) throw new Error(`${id} has no verify record from run verify; run it, nothing committed`);
    const now = dirtyHashes(root);
    const moved = paths.map((p) => path.normalize(p)).filter((p) => (now[p] ?? 'clean') !== (seen[p] ?? 'clean'));
    if (moved.length) throw new Error(`${moved.join(', ')} changed since the last passing verify; run verify again, nothing committed`);
  }
  // A phase retried after its commit landed: the commit is HEAD, so nothing is left to stage and the tag may be the
  // only thing missing. Anything else under that tag (a new edit, another commit) is refused, never skipped.
  if (phase !== undefined) {
    const tag = `do-it/${id}/phase-${phase}`;
    const head = spawnSync('git', ['rev-parse', '-q', '--verify', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    const tagged = spawnSync('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}^{commit}`], { cwd: root, encoding: 'utf8' }).stdout.trim();
    const landed =
      head && git(root, ['log', '-1', '--format=%s']) === subject && git(root, ['log', '-1', '--format=%B']).endsWith(ATTRIBUTION) &&
      !git(root, ['status', '--porcelain', '--', ...paths]);
    if (landed && (!tagged || tagged === head)) {
      if (!tagged) git(root, ['tag', tag, head]);
      return { commit: head, branch: currentBranch(root), tag, subject, limits: run.limits };
    }
    if (tagged) throw new Error(`phase ${phase} is already committed as ${tag}; nothing committed`);
  }
  if (lines(git(root, ['diff', '--cached', '--name-only'])).length) throw new Error('the index already holds staged files; unstage them first');
  for (const p of paths) {
    if (!git(root, ['status', '--porcelain', '--', p])) throw new Error(`${p} has no change to commit`);
  }
  const onto = safeBranch(root, slug, config.DO_IT_PROTECTED_BRANCHES);
  const body = limits.length ? `Verification limits:\n${limits.map((l) => `- ${l}`).join('\n')}` : null;
  const message = [subject, body, ATTRIBUTION].filter(Boolean).join('\n\n');
  try {
    git(root, ['add', '--', ...paths]);
    git(root, ['commit', '-q', '-F', '-'], message);
  } catch (e) {
    spawnSync('git', ['reset', '-q', '--', ...paths], { cwd: root, env: ENV });
    onto.undo();
    throw e;
  }
  // The run record follows the commit, so a rejected commit leaves it as it was.
  const branch = onto.name;
  if (run.branch !== branch) setRun(planningDir, slug, 'branch', branch);
  const known = limits.length ? setRun(planningDir, slug, 'limits', [...new Set([...run.limits, ...limits])]).limits : run.limits;
  const sha = git(root, ['rev-parse', 'HEAD']);
  let tag = null;
  if (phase !== undefined) {
    tag = `do-it/${id}/phase-${phase}`;
    git(root, ['tag', tag, sha]);
  }
  return { commit: sha, branch, tag, subject, limits: known };
}
