// A complete run's commit: one verified lane M phase, or one lane S slice, on
// a safe branch. Only a run record opts in; without one nothing here runs.
// It stages the paths it is given and never anything else, tags each phase
// commit locally, and never pushes. The message ends with the single do-it
// attribution line (the user's commit rule), so the commit guard allows it.

import fs from 'node:fs';
import path from 'node:path';
import { git as spawnGit, gitOut, LITERAL } from './git.mjs';
import { showRun, setRun } from './run.mjs';

export const ATTRIBUTION = 'Build assistance with do-it: https://github.com/rshingleton/do-it';

// Every git call here runs with literal pathspecs: a named path is a file name, never a glob, so `src/*`
// cannot stage what the slice did not map. `gitRun` is the shared wrapper's result, `git` its trimmed stdout
// of a call that must succeed, `gitRaw` the same untrimmed (NUL-separated lists, megabytes of status).
const gitRun = (cwd, args, input) => spawnGit(cwd, args, 'utf8', LITERAL, { input });
const git = (cwd, args, input) => gitOut(cwd, args, LITERAL, input).trim();
const gitRaw = (cwd, args, input) => gitOut(cwd, args, LITERAL, input);

const lines = (s) => s.split('\n').filter(Boolean);

// A named path as the records and git list it: relative to the repo root.
const relative = (root, p) => path.relative(root, path.resolve(root, p));

function currentBranch(cwd) {
  const r = gitRun(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  return r.status === 0 ? r.stdout.trim() : null;
}

function branchExists(cwd, name) {
  return gitRun(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${name}`]).status === 0;
}

// The current branch when it is unprotected, else do-it/<roadmap-slug>,
// created (or switched to) before the first commit. A detached HEAD counts as
// protected. `undo` puts the repo back as it was found and returns what it could not
// undo (a failed switch back, a branch kept because it gained commits), else ''.
function safeBranch(cwd, slug, protectedList) {
  const now = currentBranch(cwd);
  const blocked = protectedList.split(',').map((b) => b.trim()).filter(Boolean);
  if (now && !blocked.includes(now)) return { name: now, undo: () => '' };
  const name = `do-it/${slug}`;
  if (now === name) return { name, undo: () => '' };
  const made = !branchExists(cwd, name);
  // Empty with no commit yet: then there is no branch tip to compare, and a detached start cannot exist.
  const start = gitRun(cwd, ['rev-parse', '-q', '--verify', 'HEAD']).stdout.trim();
  const from = now || start;
  git(cwd, made ? ['switch', '-q', '-c', name] : ['switch', '-q', name]);
  return {
    name,
    undo() {
      const back = gitRun(cwd, ['switch', '-q', '--no-guess', ...(now ? [] : ['--detach']), from]);
      // Still on the scratch branch: it cannot be deleted, and the caller is told where the repo is.
      if (back.status !== 0) return ` (could not switch back to ${now ?? from}, still on ${name}: ${back.stderr.trim()})`;
      if (!made) return '';
      // A hook that committed on the branch it was given leaves work there; only an untouched branch is removed.
      const tip = gitRun(cwd, ['rev-parse', '-q', '--verify', `refs/heads/${name}`]).stdout.trim();
      if (tip !== start) return ` (${name} gained commits and was kept)`;
      gitRun(cwd, ['branch', '-q', '-D', name]);
      return '';
    },
  };
}

// Every file the working tree changes, each as `<mode>:<blob hash>` ('gone' when it is deleted, 'dir'
// for a directory), as `run verify` saw it. A link is its target's hash, never what it points at, so a
// retargeted or dangling link and a mode-only change both show. A rename is its new path plus its old
// path gone. Nothing is matched as a pattern: names are read, never expanded. Throws when git fails.
export function dirtyHashes(root) {
  const recs = gitRaw(root, ['status', '--porcelain', '-z', '-uall']).split('\0').filter(Boolean);
  const files = {};
  const modes = {};
  const plain = [];
  const stamp = (f) => {
    const abs = path.resolve(root, f);
    const st = fs.lstatSync(abs, { throwIfNoEntry: false });
    if (!st) return 'gone';
    modes[f] = (st.mode & 0o777).toString(8);
    if (st.isSymbolicLink()) return `${modes[f]}:${gitRaw(root, ['hash-object', '--stdin'], fs.readlinkSync(abs)).trim()}`;
    if (!st.isFile()) return 'dir';
    plain.push(f);
    return null;
  };
  for (let i = 0; i < recs.length; i++) {
    const f = recs[i].slice(3);
    files[f] = stamp(f);
    if (/[RC]/.test(recs[i][0])) files[recs[++i]] = 'gone';
  }
  // Regular files hash in one call; a name with a newline cannot ride a line-based list.
  const lined = plain.filter((f) => !f.includes('\n'));
  const out = lined.length ? gitRaw(root, ['hash-object', '--no-filters', '--stdin-paths'], lined.map((f) => path.resolve(root, f)).join('\n') + '\n').split('\n') : [];
  lined.forEach((f, i) => {
    files[f] = `${modes[f]}:${out[i]}`;
  });
  for (const f of plain.filter((x) => x.includes('\n'))) files[f] = `${modes[f]}:${gitRaw(root, ['hash-object', '--no-filters', '--', path.resolve(root, f)]).trim()}`;
  return files;
}

// Every gate a commit passes before anything is staged: the run's mode, the item's verified state,
// and the named paths. Returns the commit's subject; throws, touching nothing, when one fails.
function assertCommittable({ root, run, slug, items, id, phase, docs, paths }) {
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
  // `ls-files -z` reads names unquoted; they are compared with the path's repo-relative form.
  for (const p of paths) {
    const onDisk = fs.statSync(path.resolve(root, p), { throwIfNoEntry: false })?.isDirectory();
    if (onDisk || gitRaw(root, ['ls-files', '-z', '--', p]).split('\0').filter(Boolean).some((f) => f !== relative(root, p))) throw new Error(`commit stages named files only, ${p} is a directory`);
  }
  // Lane M's code commit follows its last verify: a named file that differs from what `run verify` saw refuses.
  // Files outside the named paths (the closing docs, a user's own edit) are not compared.
  if (!docs && phase === undefined && state.lane === 'm') {
    const seen = (run.gates ?? []).find((x) => x.work === id)?.verified_files;
    if (!seen) throw new Error(`${id} has no verify record from run verify; run it, nothing committed`);
    const now = dirtyHashes(root);
    // The records key on repo-relative names, so an absolute in-repo path is compared by its relative form.
    const named = paths.map((p) => relative(root, p));
    const outside = named.filter((p) => p.startsWith('..') || path.isAbsolute(p));
    if (outside.length) throw new Error(`commit stages files inside the repo, ${outside.join(', ')} is not; nothing committed`);
    const moved = named.filter((p) => (now[p] ?? 'clean') !== (seen[p] ?? 'clean'));
    if (moved.length) throw new Error(`${moved.join(', ')} changed since the last passing verify; run verify again, nothing committed`);
    // A name in neither record reads clean on both sides; it is only clean when git tracks it exactly so
    // (a case variant or a typo is not).
    const unknown = named.filter((p) => !(p in now) && !(p in seen));
    const untrusted = unknown.filter((p) => !lines(gitRaw(root, ['ls-files', '-z', '--', p]).replaceAll('\0', '\n')).includes(p) || gitRaw(root, ['status', '--porcelain', '--', p]).trim());
    if (untrusted.length) throw new Error(`${untrusted.join(', ')} is in neither verify record and is not a tracked, clean file; nothing committed`);
  }
  return subject;
}

// A commit retried after it landed (a phase, a lane S slice or the closing docs): it is HEAD with this subject,
// attribution and exactly these paths, so nothing is left to stage and a phase's tag may be the only thing
// missing. Returns its result then, null when this is a first commit; anything else under that tag (a new
// edit, another commit) throws, never skipped.
function phaseAlreadyLanded({ root, run, tag, phase, subject, paths }) {
  const rev = (ref) => gitRun(root, ['rev-parse', '-q', '--verify', ref]).stdout.trim();
  const head = rev('HEAD');
  const tagged = tag && rev(`refs/tags/${tag}^{commit}`);
  const landed =
    head && git(root, ['log', '-1', '--format=%s']) === subject && git(root, ['log', '-1', '--format=%B']).endsWith(ATTRIBUTION) &&
    !git(root, ['status', '--porcelain', '--', ...paths]) &&
    gitRaw(root, ['show', '--no-renames', '--name-only', '--format=', '-z', 'HEAD']).split('\0').filter(Boolean).sort().join('\n') === paths.map((p) => relative(root, p)).sort().join('\n');
  if (landed && (!tagged || tagged === head)) {
    if (tag && !tagged) git(root, ['tag', tag, head]);
    return { commit: head, branch: currentBranch(root), tag, subject, limits: run.limits };
  }
  if (tagged) throw new Error(`phase ${phase} is already committed as ${tag}; nothing committed`);
  return null;
}

// `paths` are the files the boundary check mapped to the slice. Returns the
// commit and its tag; throws, changing nothing in HEAD, when a gate fails.
export function commitSlice({ root, planningDir, config, items, slug, id, phase, docs = false, paths, limits = [] }) {
  const run = showRun(planningDir, slug);
  const subject = assertCommittable({ root, run, slug, items, id, phase, docs, paths });
  const tag = phase === undefined ? null : `do-it/${id}/phase-${phase}`;
  const landed = phaseAlreadyLanded({ root, run, tag, phase, subject, paths });
  if (landed) return landed;
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
    gitRun(root, ['reset', '-q', '--', ...paths]);
    throw new Error(`${e.message}${onto.undo()}`);
  }
  // The run record follows the commit, so a rejected commit leaves it as it was.
  const branch = onto.name;
  if (run.branch !== branch) setRun(planningDir, slug, 'branch', branch);
  const known = limits.length ? setRun(planningDir, slug, 'limits', [...new Set([...run.limits, ...limits])]).limits : run.limits;
  const sha = git(root, ['rev-parse', 'HEAD']);
  // The commit has landed, so a tag that fails is reported with the commit, not as a failed commit; the
  // same call again finds the commit at HEAD and only tags it.
  if (tag) {
    try {
      git(root, ['tag', tag, sha]);
    } catch (e) {
      throw new Error(`committed ${sha} on ${branch} but ${e.message}; run the same command again to tag it`);
    }
  }
  return { commit: sha, branch, tag, subject, limits: known };
}
