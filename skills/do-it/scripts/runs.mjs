// The `work.mjs run <sub>` handlers that act on a run: each reads the run record and the
// work item, and calls the rule or the record writer. The rules and counters live in
// gate.mjs, the record in run.mjs, the commit in commit.mjs. work.mjs is the only caller.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { snapshot, treeDiff } from './changeset.mjs';
import { dirtyHashes } from './commit.mjs';
import { checkWithRerun, gate, recordVerified } from './gate.mjs';
import { rejectAssumption, showRun, sliceRun } from './run.mjs';

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
  recordVerified(planningDir, slug, id, fingerprintOf(items.get(g.work)), dirtyHashes(root));
  return showRun(planningDir, slug);
}

// `run review-change`: the change the run's final review reads. Committed work
// is `<base>...HEAD`; with commit mode none, no base, or anything still
// uncommitted outside the planning dir (the closing docs), the working tree
// against base, untracked files included. Planning files are never in it.
export function runReviewChange({ planningDir, root, slug, exclude }) {
  const { base, commit } = showRun(planningDir, slug);
  if (!base) return { base: null, mode: 'worktree', files: null, note: 'no base recorded: review the working tree' };
  const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
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

// `run reject-assumption`: the plan's event fires first, so a plan that refuses leaves the record
// untouched, and the plan entry is found by the key's number, not by its text. A recorded number
// is fixed when the assumption is added, while the plan's list closes up after each rejection,
// so earlier rejections of the same item are subtracted. A closed item has no plan to reopen:
// the record is the whole trace.
export function runRejectAssumption({ planningDir, slug, key, instead, items, date }) {
  const m = /^(.+)#(\d+)$/.exec(key ?? '');
  if (!m) throw new Error('run reject-assumption needs <work id>#<n>');
  if (!instead) throw new Error('run reject-assumption needs what replaces the assumption');
  const record = showRun(planningDir, slug);
  const entry = record.assumptions.find((a) => a.startsWith(`${key}: `));
  if (!entry) throw new Error(`no recorded assumption ${key}`);
  let plan = null;
  try {
    plan = items.get(m[1]);
  } catch {
    plan = null;
  }
  const live = Boolean(plan) && ['auditing', 'shipping'].includes(plan.state.status);
  if (live) {
    const n = Number(m[2]);
    const earlier = record.rejected.filter((r) => {
      const k = /^(.+)#(\d+): /.exec(r);
      return k && k[1] === m[1] && Number(k[2]) < n;
    }).length;
    const at = n - earlier;
    if (plan.state.assumptions[at - 1] !== entry.slice(key.length + 2)) {
      throw new Error(`plan ${m[1]} assumption ${at} no longer matches ${key}; nothing rejected`);
    }
    items.fire(m[1], 'reject-assumption', { n: at, text: instead, date });
  }
  const { record: next } = rejectAssumption(planningDir, slug, key, instead);
  return { rejected: key, reopened: live, followup: live ? null : 'item closed: the user files a fix: or log-it entry', record: next };
}
