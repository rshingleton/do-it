// Checkable stop conditions of a complete run. Per-slice facts live in the run
// record's `gates` list (work id, start time, fingerprint at the last passing
// verify); run-wide audit rounds in `audit_rounds`. work.mjs is the only caller.

import { read, runPath, write } from './run.mjs';

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

export function recordVerified(planningDir, slug, id, fingerprint) {
  return update(planningDir, slug, (r) => {
    entry(r, id).verified_fingerprint = fingerprint;
  });
}

export function countAudit(planningDir, slug) {
  return update(planningDir, slug, (r) => {
    r.audit_rounds = (Number(r.audit_rounds) || 0) + 1;
  });
}

// {allow, reason, detail}: reason is a code from stops.mjs. `current` is the
// slice's fingerprint now. Caps first, then freshness of the last verify.
export function gate(record, id, { current, now = Date.now() }) {
  const stop = (reason, detail) => ({ allow: false, reason, detail });
  const shipped = record.slices.filter((s) => s.status === 'shipped').length;
  if (record.max_slices != null && shipped >= record.max_slices) return stop('MAX_SLICES', `${shipped} shipped, cap ${record.max_slices}`);
  const rounds = Number(record.audit_rounds) || 0;
  if (rounds >= record.audit_cap) return stop('AUDIT_CAP', `${rounds} audit rounds, cap ${record.audit_cap}`);
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
