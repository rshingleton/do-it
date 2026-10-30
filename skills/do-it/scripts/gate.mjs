// Checkable stop conditions of a complete run. Per-slice facts live in the run
// record's `gates` list (work id, start time, fingerprint at the last passing
// verify, audit rounds spent); run-wide audit rounds in `audit_rounds`, the final
// review's in `final_audit_rounds`. work.mjs is the only caller.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { snapshot, treeDiff } from './changeset.mjs';
import { dirtyHashes } from './commit.mjs';
import { read, rejectAssumption, runPath, showRun, sliceRun, write } from './run.mjs';

function entry(record, id) {
  record.gates = Array.isArray(record.gates) ? record.gates : [];
  let g = record.gates.find((x) => x.id === id);
  if (!g) record.gates.push((g = { id }));
  return g;
}

function update(planningDir, slug, change) {
  const file = runPath(planningDir, slug);
  const cur = read(file, slug);
  change(cur.record);
  write(file, cur);
  return cur.record;
}

// Start the slice's clock and name its work item. A restart keeps the first time.
export function startSlice(planningDir, slug, id, { work, at }) {
  if (!id || !work) throw new Error('run start needs a slice id and --work <id>');
  return update(planningDir, slug, (r) => {
    const g = entry(r, id);
    g.work = work;
    g.started ??= at ?? new Date().toISOString();
  });
}

export function recordVerified(planningDir, slug, id, fingerprint, files) {
  return update(planningDir, slug, (r) => {
    entry(r, id).verified_fingerprint = fingerprint;
    if (files) entry(r, id).verified_files = files;
  });
}

// The audit limits that apply to a round: the slice's own, the run total across slices (its cap
// is `audit_total_cap`, else `max_slices` x the per-slice cap, else none), or the final review's.
// Each holds its counter and refusal marker on `at` (a gates entry or the record).
function auditLimits(record, id, final) {
  if (final) {
    return [{ limit: 'final review', at: record, rounds: 'final_audit_rounds', refused: 'final_audit_refused', cap: record.final_audit_cap ?? record.audit_cap }];
  }
  const total = record.audit_total_cap ?? (record.max_slices == null ? null : record.max_slices * record.audit_cap);
  const g = entry(record, id);
  const limits = [{ limit: `slice ${id}`, at: g, rounds: 'audit_rounds', refused: 'audit_refused', cap: record.audit_cap }];
  // No total cap still counts, so the digest and a later `audit_total_cap` see the rounds spent.
  limits.push({ limit: 'run total', at: record, rounds: 'audit_rounds', refused: 'audit_refused', cap: total ?? Infinity });
  return limits;
}

const spent = (l) => Number(l.at[l.rounds]) || 0;
const describe = (l) => `${l.limit}: ${spent(l)} audit rounds, cap ${l.cap}`;

// Counts one audit round (`id`: a slice's; `final`: the final review's), unless a limit that applies is
// already spent: then the round is refused and not counted, the limit that fired is named and kept on
// the record for the digest, so the loop stops before another round is spent.
export function countAudit(planningDir, slug, { id, final = false } = {}) {
  if (!final && !id) throw new Error('run audit needs a slice id, or --final for the final review');
  let refused = null;
  const record = update(planningDir, slug, (r) => {
    const limits = auditLimits(r, id, final);
    const hit = limits.find((l) => spent(l) >= l.cap);
    if (hit) {
      refused = hit;
      hit.at[hit.refused] = spent(hit);
      r.audit_stop = describe(hit);
    } else for (const l of limits) l.at[l.rounds] = spent(l) + 1;
  });
  const mine = auditLimits(record, id, final)[0];
  return {
    audit_rounds: spent(mine),
    allow: !refused,
    reason: refused && 'AUDIT_CAP',
    limit: refused?.limit ?? null,
    detail: refused && describe(refused),
  };
}

// {allow, reason, detail}: reason is a code from stops.mjs. `current` is the
// slice's fingerprint now. Caps first, then freshness of the last verify.
export function gate(record, id, { current, now = Date.now() }) {
  const stop = (reason, detail) => ({ allow: false, reason, detail });
  const shipped = record.slices.filter((s) => s.status === 'shipped').length;
  if (record.max_slices != null && shipped >= record.max_slices) return stop('MAX_SLICES', `${shipped} shipped, cap ${record.max_slices}`);
  // Past a cap, never at it: a slice whose last allowed round passed still ships. A refused round is
  // remembered by the rounds spent then: a caller that ignored it is still stopped here, until a cap
  // is set again (which clears the marker) or another round is counted.
  for (const l of auditLimits(record, id, false)) {
    const rounds = spent(l);
    if (rounds > l.cap || (l.at[l.refused] === rounds && rounds >= l.cap)) return stop('AUDIT_CAP', describe(l));
  }
  const g = (record.gates ?? []).find((x) => x.id === id);
  if (g?.started) {
    const mins = (now - Date.parse(g.started)) / 60000;
    if (mins > record.slice_cap_min) return stop('SLICE_CAP', `${Math.floor(mins)} min, cap ${record.slice_cap_min}`);
  }
  if (!g?.verified_fingerprint) return stop('UNVERIFIED', `${id} has no passing verify-phase`);
  if (g.verified_fingerprint !== current) return stop('STALE_VERIFY', `${id} changed since its last passing verify-phase`);
  return { allow: true, reason: null, detail: null };
}

// A check run once; a failure is rerun once, never more. A pass on the rerun
// is a failure with reason FLAKY: the check cannot be trusted, so the slice parks.
export function checkWithRerun(attempt) {
  const first = attempt();
  if (first.ok) return first;
  const second = attempt();
  if (second.ok) return { ok: false, flaky: true, why: `FLAKY: ${first.why}, then passed on rerun` };
  return first;
}

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
