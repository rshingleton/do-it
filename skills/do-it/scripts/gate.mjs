// Checkable stop conditions of a complete run. Per-slice facts live in the run
// record's `gates` list (work id, start time, fingerprint at the last passing
// verify); run-wide audit rounds in `audit_rounds`. work.mjs is the only caller.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { dirtyHashes } from './commit.mjs';
import { read, runPath, showRun, sliceRun, write } from './run.mjs';

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

// Counts one audit round, unless the run is already at its cap: then the round
// is refused and not counted, so the loop stops before another round is spent.
export function countAudit(planningDir, slug) {
  let refused = null;
  const record = update(planningDir, slug, (r) => {
    const rounds = Number(r.audit_rounds) || 0;
    if (rounds >= r.audit_cap) {
      refused = `${rounds} audit rounds, cap ${r.audit_cap}`;
      r.audit_refused = rounds;
    } else r.audit_rounds = rounds + 1;
  });
  return { audit_rounds: record.audit_rounds, allow: !refused, reason: refused && 'AUDIT_CAP', detail: refused };
}

// {allow, reason, detail}: reason is a code from stops.mjs. `current` is the
// slice's fingerprint now. Caps first, then freshness of the last verify.
export function gate(record, id, { current, now = Date.now() }) {
  const stop = (reason, detail) => ({ allow: false, reason, detail });
  const shipped = record.slices.filter((s) => s.status === 'shipped').length;
  if (record.max_slices != null && shipped >= record.max_slices) return stop('MAX_SLICES', `${shipped} shipped, cap ${record.max_slices}`);
  // Past the cap, never at it: a slice whose last allowed round passed still ships.
  const rounds = Number(record.audit_rounds) || 0;
  // A refused round is remembered by the rounds spent then: a caller that ignored it is still stopped here, until
  // the cap is raised or another round is counted.
  if (rounds > record.audit_cap || (record.audit_refused === rounds && rounds >= record.audit_cap)) return stop('AUDIT_CAP', `${rounds} audit rounds, cap ${record.audit_cap}`);
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
