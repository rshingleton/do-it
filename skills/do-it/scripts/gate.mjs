// Checkable stop conditions of a complete run. Per-slice facts live in the run
// record's `gates` list (work id, start time, fingerprint at the last passing
// verify, audit rounds spent); run-wide audit rounds in `audit_rounds`, the final
// review's in `final_audit_rounds`. This holds the rule, the counters and the
// record writers; the `run <sub>` handlers that call them are in runs.mjs.
// work.mjs is the only caller.

import { updateRun } from './run.mjs';

function entry(record, id) {
  record.gates = Array.isArray(record.gates) ? record.gates : [];
  let g = record.gates.find((x) => x.id === id);
  if (!g) record.gates.push((g = { id }));
  return g;
}

// Start the slice's clock (`at`, an ISO time) and name its work item. A restart keeps the first time.
export function startSlice(planningDir, slug, id, { work, at }) {
  if (!id || !work || !at) throw new Error('run start needs a slice id, --work <id> and a start time');
  return updateRun(planningDir, slug, (r) => {
    const g = entry(r, id);
    g.work = work;
    // A slice resumed under a new work item keeps the old ones, so the digest still lists their phase tags.
    g.works = [...new Set([...(g.works ?? []), work])];
    g.started ??= at;
  });
}

// What `run verify` saw: the slice's `verified_fingerprint` (its work item's change now) and
// `verified_files`, `{<repo-relative name>: <mode>:<blob hash> | 'gone' | 'dir'}` from commit.mjs
// `dirtyHashes`, which the lane M code commit compares its named paths against.
export function recordVerified(planningDir, slug, id, fingerprint, files) {
  return updateRun(planningDir, slug, (r) => {
    entry(r, id).verified_fingerprint = fingerprint;
    // A verify without --paths records no files, and must not leave an older record standing.
    if (files) entry(r, id).verified_files = files;
    else delete entry(r, id).verified_files;
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

// `audit_refused` (and `final_audit_refused`) is the marker of a round `run audit` turned away: it holds
// the rounds spent then. A limit is exhausted past its cap, or at it while the marker still equals the
// rounds spent, so a caller that ignored the refusal is still stopped. Setting a cap again clears the
// marker (run.mjs), and another counted round moves the count off it.
const exhausted = (l) => spent(l) > l.cap || (l.at[l.refused] === spent(l) && spent(l) >= l.cap);

// Counts one audit round (`id`: a slice's; `final`: the final review's), unless a limit that applies is
// already spent: then the round is refused and not counted, the limit that fired is named and kept on
// the record for the digest, so the loop stops before another round is spent.
export function countAudit(planningDir, slug, { id, final = false } = {}) {
  if (!final && !id) throw new Error('run audit needs a slice id, or --final for the final review');
  let refused = null;
  const record = updateRun(planningDir, slug, (r) => {
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
  // Past a cap, never at it: a slice whose last allowed round passed still ships.
  const spentLimit = auditLimits(record, id, false).find(exhausted);
  if (spentLimit) return stop('AUDIT_CAP', describe(spentLimit));
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
