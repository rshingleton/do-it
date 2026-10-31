// The `work.mjs run <sub>` handlers that act on a run: each reads the run record and the
// work item, and calls the rule or the record writer. The rules and counters live in
// gate.mjs, the record in run.mjs, the commit in commit.mjs. work.mjs is the only caller.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { snapshot, treeDiff } from './changeset.mjs';
import { dirtyHashes, relative } from './commit.mjs';
import { checkWithRerun, gate, recordVerified } from './gate.mjs';
import { git as spawnGit } from './git.mjs';
import { rejectAssumption, showRun, sliceRun, splitKey } from './run.mjs';

// `run gate`: the slice's gate result against the fingerprint of its work item now.
// `fingerprintOf(item)` is the item's change since its base, planning files excluded.
export function runGate({ planningDir, slug, id, items, fingerprintOf }) {
  const record = showRun(planningDir, slug);
  const g = (record.gates ?? []).find((x) => x.id === id);
  const current = g?.work ? fingerprintOf(items.get(g.work)) : null;
  return gate(record, id, { current });
}

// `run verify`: run the checks (a failure once more), record the phase on the work
// item, and on a pass the fingerprint and file hashes the gate and the code commit
// compare against. A flaky check parks the slice. `quote` shell-quotes one word.
export function runVerify({ planningDir, root, cwd, slug, id, opts, items, fingerprintOf, quote }) {
  const g = (showRun(planningDir, slug).gates ?? []).find((x) => x.id === id);
  if (!g?.work) throw new Error(`run verify: ${id} has no work id; run start first`);
  const command = opts['--'] ?? [];
  if (!command.length) throw new Error('run verify needs the checks after --');
  const where = opts.in === undefined ? root : path.resolve(cwd, opts.in);
  const text = command.length === 1 ? command[0] : command.map(quote).join(' ');
  let flaky = false;
  const attempt = () => {
    const r = spawnSync(text, { cwd: where, shell: true, stdio: ['ignore', 2, 2] });
    if (r.error) return { ok: false, why: `${text}: ${r.error.message}` };
    return r.status === 0 ? { ok: true, text } : { ok: false, why: `${text} exited ${r.status ?? r.signal}` };
  };
  const check = () => {
    const r = checkWithRerun(attempt);
    flaky = Boolean(r.flaky);
    return r;
  };
  const phase = opts.phase === undefined ? undefined : Number(opts.phase);
  try {
    items.verifyPhase(g.work, phase, check, { date: opts.date });
  } catch (e) {
    if (flaky) sliceRun(planningDir, slug, id, 'parked', { reason: e.message.replace(/^verify-phase: /, ''), needs: 'user' });
    throw e;
  }
  // Only the slice's own files are recorded (`--paths a,b`): never the user's or another slice's.
  const mapped = opts.paths === undefined ? null : String(opts.paths).split(',').filter(Boolean).map((p) => relative(root, p));
  let files = null;
  try {
    files = mapped && dirtyHashes(root, mapped);
  } catch (e) {
    // The phase is already recorded as verified; say which record is missing so the retry is not a guess.
    throw new Error(`${e.message}; the checks passed and the phase is recorded, but ${id}'s verified_files is not: run verify again`);
  }
  recordVerified(planningDir, slug, id, fingerprintOf(items.get(g.work)), files);
  return showRun(planningDir, slug);
}

// `run review-change`: the change the run's final review reads. Committed work
// is `<base>...HEAD`; with commit mode none, no base, or anything still
// uncommitted outside the planning dir (the closing docs), the working tree
// against base, untracked files included. Planning files are never in it.
export function runReviewChange({ planningDir, root, slug, exclude }) {
  const { base, commit } = showRun(planningDir, slug);
  if (!base) return { base: null, mode: 'worktree', files: null, note: 'no base recorded: review the working tree' };
  const git = (args) => spawnGit(root, args);
  // A git that failed says nothing about the tree: it is an error, never "clean" or "no merge base".
  const must = (r, what) => {
    if (r.error || r.status !== 0) throw new Error(`${what} failed: ${(r.error?.message || r.stderr).trim()}`);
    return r.stdout.trim();
  };
  const dirty = must(git(['status', '--porcelain', '-uall', '--', '.', ...exclude.map((p) => `:(exclude,literal)${p}`)]), 'git status');
  if (commit === 'none' || dirty) return { base, mode: 'worktree', ...treeDiff(root, base, snapshot(root, { exclude }), { exclude }) };
  const mb = git(['merge-base', base, 'HEAD']);
  // Exit 1 is no common ancestor (rewritten history): review from the base itself.
  const from = mb.status === 1 ? base : must(mb, 'git merge-base');
  return { base, mode: 'range', ...treeDiff(root, from, 'HEAD', { exclude }) };
}

// Where the plan lists record entry `want` (a `<id>#<n>` key), 1-based, or 0 when it is not found.
// By id first: a plan that still lists as many entries as the record holds for this item has its
// entry at the key's place. A plan that lost entries (ship-it rejected some plan-side, so its list
// closed up) is searched by text, and only a unique text is trusted. Equal texts cannot be told apart
// once the lists differ, so nothing is guessed: the plan is left alone and `ambiguous` names every id
// that shares the text, for the followup to hand to the user.
export function planIndex(assumptions, want, planList) {
  const own = assumptions.map(splitKey).filter((k) => k && k.id === want.id && k.text !== undefined).sort((a, b) => a.n - b.n);
  const pos = own.findIndex((k) => k.n === want.n);
  if (pos < 0) return { at: 0, ambiguous: null };
  const text = own[pos].text;
  if (planList.length === own.length && planList[pos] === text) return { at: pos + 1, ambiguous: null };
  const same = own.filter((k) => k.text === text);
  if (same.length > 1) return { at: 0, ambiguous: same.map((k) => `${want.id}#${k.n}`) };
  return { at: planList.indexOf(text) + 1, ambiguous: null };
}

// `run reject-assumption`: the plan's event fires first, so a plan that refuses leaves the record
// untouched. The plan's entry is found by planIndex (the id's place while the plan's list matches the
// record, else the recorded text among the plan's remaining entries). A plan that is
// auditing or shipping reopens. A plan that no longer lists the text (ship-it rejected it plan-side, or
// it was edited) gets only the record updated; a plan in another state, or no plan at all, is named
// in `followup`, never called closed unless it is.
export function runRejectAssumption({ planningDir, slug, key, instead, items, date }) {
  const want = splitKey(key);
  if (!want || want.text !== undefined) throw new Error('run reject-assumption needs <work id>#<n>');
  const text = String(instead ?? '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('run reject-assumption needs what replaces the assumption');
  const entry = showRun(planningDir, slug).assumptions.find((a) => a.startsWith(`${key}: `));
  if (!entry) throw new Error(`no recorded assumption ${key}`);
  let plan = null;
  try {
    plan = items.get(want.id);
  } catch (e) {
    // items.get says "no plan for <id>" when the item is gone; any other failure is not "closed".
    if (!/^no plan for /.test(e.message)) throw e;
  }
  const status = plan?.state.status;
  const { at, ambiguous } = plan ? planIndex(showRun(planningDir, slug).assumptions, want, plan.state.assumptions) : { at: 0, ambiguous: null };
  const live = ['auditing', 'shipping'].includes(status) && at > 0;
  if (live) items.fire(want.id, 'reject-assumption', { n: at, text, date });
  const { record: next } = rejectAssumption(planningDir, slug, key, text);
  let followup = null;
  if (!plan) followup = `no plan for ${want.id} (the item is closed, or this is a sweep default): the user files a fix: or log-it entry`;
  else if (!live && ['auditing', 'shipping'].includes(status)) followup = `plan ${want.id} no longer lists it (rejected plan-side or edited): only the record changed`;
  else if (['done', 'closed'].includes(status)) followup = `plan ${want.id} is ${status}: the user files a new fix item (log-it); its plan is not edited`;
  else if (!live) followup = `plan ${want.id} is ${status}, not reopened: add the change to its fix: list`;
  if (ambiguous) followup = `equal texts (${ambiguous.join(', ')}): the plan was not changed, check its list by hand; ${followup ?? ''}`.trim();
  return { rejected: key, reopened: live, followup, record: next };
}
