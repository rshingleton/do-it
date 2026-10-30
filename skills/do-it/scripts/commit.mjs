// A complete run's commit: one verified lane M phase, or one lane S slice, on
// a safe branch. Only a run record opts in; without one nothing here runs.
// It stages the paths it is given and never anything else, tags each phase
// commit locally, and never pushes. The message ends with the single do-it
// attribution line (the user's commit rule), so the commit guard allows it.

import { spawnSync } from 'node:child_process';
import { showRun, setRun } from './run.mjs';

export const ATTRIBUTION = 'Build assistance with do-it: https://github.com/rshingleton/do-it';

function git(cwd, args, input) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', input });
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
// created (or switched to) before the first commit. A detached HEAD counts as protected.
function safeBranch(cwd, slug, protectedList) {
  const now = currentBranch(cwd);
  const blocked = protectedList.split(',').map((b) => b.trim()).filter(Boolean);
  if (now && !blocked.includes(now)) return now;
  const name = `do-it/${slug}`;
  if (now !== name) git(cwd, branchExists(cwd, name) ? ['switch', '-q', name] : ['switch', '-q', '-c', name]);
  return name;
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
    if (!state.verified) throw new Error(`${id} has no passing verify-phase; nothing committed`);
    subject = `${id}: ${state.title}`;
  }
  if (!Array.isArray(paths) || !paths.length) throw new Error('commit needs the mapped paths (--paths a,b); never everything');
  if (paths.some((p) => p === '.' || p === '-A' || p === '--all' || p.startsWith('-') || p.startsWith(':'))) {
    throw new Error(`commit stages named files only, got ${paths.join(',')}`);
  }
  if (lines(git(root, ['diff', '--cached', '--name-only'])).length) throw new Error('the index already holds staged files; unstage them first');
  for (const p of paths) {
    if (!git(root, ['status', '--porcelain', '--', p])) throw new Error(`${p} has no change to commit`);
  }
  const branch = safeBranch(root, slug, config.DO_IT_PROTECTED_BRANCHES);
  if (run.branch !== branch) setRun(planningDir, slug, 'branch', branch);
  const known = limits.length ? setRun(planningDir, slug, 'limits', [...new Set([...run.limits, ...limits])]).limits : run.limits;
  git(root, ['add', '--', ...paths]);
  const body = limits.length ? `Verification limits:\n${limits.map((l) => `- ${l}`).join('\n')}` : null;
  const message = [subject, body, ATTRIBUTION].filter(Boolean).join('\n\n');
  try {
    git(root, ['commit', '-q', '-F', '-'], message);
  } catch (e) {
    spawnSync('git', ['reset', '-q', '--', ...paths], { cwd: root });
    throw e;
  }
  const sha = git(root, ['rev-parse', 'HEAD']);
  let tag = null;
  if (phase !== undefined) {
    tag = `do-it/${id}/phase-${phase}`;
    git(root, ['tag', tag, sha]);
  }
  return { commit: sha, branch, tag, subject, limits: known };
}
