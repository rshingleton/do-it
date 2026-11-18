// Checkable stop conditions of a complete run. Per-slice facts live in the run
// record's `gates` list (work id, start time, fingerprint at the last passing
// verify, failed verify rounds in a row, audit rounds started, the rounds that
// repeated a Must); run-wide audit rounds in `audit_rounds`, the final review's in
// `final_audit_rounds`. This holds the rule, the counters and the record writers;
// the `run <sub>` handlers that call them are in runs.mjs. work.mjs calls the start
// and audit counters; runs.mjs calls the rest.

import { closeSpan, openSpan, updateRun } from './run.mjs';

// Failed verify rounds in a row that park the slice: a check that keeps failing stops there
// instead of looping, and the two before it throw as they always have.
export const VERIFY_CAP_ROUNDS = 3;

function entry(record, id) {
  record.gates = Array.isArray(record.gates) ? record.gates : [];
  let g = record.gates.find((x) => x.id === id);
  if (!g) record.gates.push((g = { id }));
  return g;
}

// Start the slice's clock (`at`, an ISO time) and name its work item. A slice already in flight
// closes its open span where the last command saw it (`last_seen`), so the gap since then is not
// work, and opens a fresh one; `started` keeps the first time, for a pre-span record's fallback.
export function startSlice(planningDir, slug, id, { work, at }) {
  if (!id || !work || !at) throw new Error('run start needs a slice id, --work <id> and a start time');
  return updateRun(planningDir, slug, (r) => {
    const g = entry(r, id);
    g.work = work;
    // A slice resumed under a new work item keeps the old ones, so the digest still lists their phase tags.
    g.works = [...new Set([...(g.works ?? []), work])];
    openSpan(g, at);
    // A first start keeps the time, after the open has decided whether there was a span to close.
    g.started ??= at;
  });
}

// The last moment a command showed the slice alive. The next close charges work up to here, so a
// machine that slept or a session that lost its host does not spend the cap on the gap.
export function recordSeen(planningDir, slug, id, at) {
  return updateRun(planningDir, slug, (r) => {
    entry(r, id).last_seen = at;
  });
}

// What `run verify` saw: the slice's `verified_fingerprint` (its work item's change now),
// `verified_root` (the tree it ran in, from the coordinator: `.` for its own checkout, else
// `run verify --in` or a track's worktree) and `verified_files`,
// `{<repo-relative name>: <755|644|120000>:<blob hash> | 'sub:<hash>' | 'gone' | 'dir'}` from commit.mjs
// `dirtyHashes`, which the lane M code commit compares its named paths against.
export function recordVerified(planningDir, slug, id, fingerprint, files, root) {
  return updateRun(planningDir, slug, (r) => {
    const g = entry(r, id);
    g.verified_fingerprint = fingerprint;
    if (root) g.verified_root = root;
    else delete g.verified_root;
    // A verify of the slice's own tree drops an older merged fact: the merged tree no longer
    // holds what just passed, so the coordinator merges again and re-runs the merged check.
    delete g.merged_fingerprint;
    // A verify without --paths records no files, and must not leave an older record standing.
    if (files) g.verified_files = files;
    else delete g.verified_files;
    // A pass breaks the run of failures, so the next failure counts from one.
    delete g.verify_failures;
  });
}

// A verify round whose check ran and failed: `verify_failures` on the slice's gate entry counts
// the failures in a row (a pass, or a resume, clears them). Returns the count after this round.
export function recordVerifyFailure(planningDir, slug, id) {
  let failures = 0;
  updateRun(planningDir, slug, (r) => {
    const g = entry(r, id);
    failures = (Number(g.verify_failures) || 0) + 1;
    g.verify_failures = failures;
  });
  return failures;
}

// The suite on the merged tree: `run verify --merged`. It says the merge passed too, on the
// slice's gate entry; the work item's status and phases stay as its own verify left them.
export function recordMerged(planningDir, slug, id, fingerprint) {
  return updateRun(planningDir, slug, (r) => {
    entry(r, id).merged_fingerprint = fingerprint;
  });
}

// The time a check spent queuing for the run's check slot, added to the slice's gate entry: it is not
// work, so `gate` takes it off the in-flight spans. A check that did not wait records nothing.
export function recordWaited(planningDir, slug, id, ms) {
  if (!ms) return;
  return updateRun(planningDir, slug, (r) => {
    const g = entry(r, id);
    g.waited_ms = (Number(g.waited_ms) || 0) + Math.round(ms);
  });
}

// The audit limits that apply to a round: the slice's own, the run total across slices (its cap
// is `audit_total_cap`, else `max_slices` x the per-slice cap, else none), or the final review's.
// Each holds its counter and refusal marker on `at` (a gates entry or the record). A slice's cap
// reads `audit_spent`, which only a round that repeats an earlier Must advances; the run total and
// the final review count every round they saw, in `audit_rounds` / `final_audit_rounds`.
function auditLimits(record, id, final, { create = true } = {}) {
  if (final) {
    return [{ limit: 'final review', at: record, rounds: 'final_audit_rounds', refused: 'final_audit_refused', cap: record.final_audit_cap ?? record.audit_cap }];
  }
  const total = record.audit_total_cap ?? (record.max_slices == null ? null : record.max_slices * record.audit_cap);
  // `gate` only reads: it must not add a gates entry to the record it was handed.
  const g = create ? entry(record, id) : (record.gates ?? []).find((x) => x.id === id) ?? {};
  const limits = [{ limit: `slice ${id}`, at: g, rounds: 'audit_spent', refused: 'audit_refused', cap: record.audit_cap }];
  // No total cap still counts, so the digest and a later `audit_total_cap` see the rounds spent.
  limits.push({ limit: 'run total', at: record, rounds: 'audit_rounds', refused: 'audit_refused', cap: total ?? Infinity });
  return limits;
}

const spent = (l) => Number(l.at[l.rounds]) || 0;
// A slice's cap counts the rounds that repeated a Must already raised; the run total and the final
// review count every round, so their line says so.
const describe = (l) => `${l.limit}: ${spent(l)} ${l.rounds === 'audit_spent' ? 'rounds repeated an earlier Must' : 'audit rounds'}, cap ${l.cap}`;
// No round is left: the cap is spent, whether or not a round was already refused at it.
const atCap = (l) => spent(l) >= l.cap;
// A slice's own cap parks that slice and the run goes on; the final review and the run total stop the run.
const isSliceLimit = (l) => l.limit.startsWith('slice ');
export const auditCode = (l) => (isSliceLimit(l) ? 'SLICE_AUDIT_CAP' : 'AUDIT_CAP');

// A slice whose last allowed round passed is not parked by a refused extra round: the gate entry
// names its work item, and `shipping` or a PASS verdict says the last round passed. No item, no
// `items` lookup (a direct call), or an unreadable plan counts as not passed.
function lastRoundPassed(items, g) {
  if (!items || !g?.work) return false;
  try {
    const { state } = items.get(g.work);
    return state.status === 'shipping' || state.audit?.verdict === 'PASS';
  } catch {
    return false;
  }
}

// `audit_refused` (and `final_audit_refused`) is the marker of a round `run audit` turned away: it holds
// the rounds spent then. A limit is exhausted past its cap, or at it while the marker still equals the
// rounds spent, so a caller that ignored the refusal is still stopped. Setting a cap again clears the
// marker (run.mjs), and another counted round moves the count off it.
const exhausted = (l) => spent(l) > l.cap || (l.at[l.refused] === spent(l) && spent(l) >= l.cap);

// Counts one audit round (`id`: a slice's; `final`: the final review's), unless a limit that applies is
// already spent: then the round is refused and not counted, the limit that fired is named and kept on
// the record for the digest, so the loop stops before another round is spent. A slice's round is
// classified against every round already raised: `musts` (the plan's `audit.must`, from work.mjs) that
// all appear in `seen_musts` is a repeat and spends one of the slice's rounds; a Must not seen before is
// new work and spends nothing, so a slice whose rounds keep finding something new is not parked. A
// counted call advances the slice's `audit_rounds` whatever it found and the run total's, stores
// `musts` as `last_musts` and adds them to `seen_musts`; a refused or unclassified call advances
// neither. Returns `{audit_rounds, audit_spent, allow, reason, limit, detail}`: `audit_rounds` is the
// honest count the digest reports, `audit_spent` the counter the slice's cap reads; `limit` and
// `detail` are null on allow, and a refusal says the last fix went unreviewed. A slice's round stamps
// `last_seen`; the final review has no slice, so none.
export function countAudit(planningDir, slug, { id, final = false, musts, items, at = new Date().toISOString() } = {}) {
  if (!final && !id) throw new Error('run audit needs a slice id, or --final for the final review');
  let refusal = null;
  const record = updateRun(planningDir, slug, (r) => {
    // Each attempt answers for the record it read: a refusal an earlier attempt saw may not hold
    // once another writer's round is in, so it is decided again, never carried over.
    let refused = null;
    // A slice the run never started holds no gate entry: refuse before one is made, so no round is spent on it.
    if (!final && !(r.gates ?? []).some((x) => x.id === id)) throw new Error(`run audit: ${id} has no gate entry; run start first`);
    const g = final ? null : entry(r, id);
    // The round is a command that showed the slice alive, refused or not.
    if (g) g.last_seen = at;
    const limits = auditLimits(r, id, final);
    const hit = limits.find(atCap);
    if (hit) {
      refused = hit;
      // The cap still refuses the round, but a slice whose last allowed round passed keeps no marker,
      // so the gate can ship it; run-total and final-review refusals are unchanged.
      const passed = isSliceLimit(hit) && lastRoundPassed(items, hit.at);
      if (passed) {
        // The passing round excuses the cap, so a marker an earlier refused round left must not
        // outlive it: the gate would read the stale marker as a spent cap.
        delete hit.at[hit.refused];
        if (r.audit_stop?.startsWith(`slice ${id}:`)) delete r.audit_stop;
      } else {
        hit.at[hit.refused] = spent(hit);
        r.audit_stop = describe(hit);
        // The loop's own stop would end the whole run on one slice stuck in a failing audit. Park it
        // instead (resume gives it fresh rounds); a slice already shipped or parked stays as it is.
        if (isSliceLimit(hit) && !r.slices.some((s) => s.id === id && (s.status === 'shipped' || s.status === 'parked'))) {
          const parked = { id, status: 'parked', reason: `${describe(hit)}; last fix unreviewed`, needs: 'decision' };
          // The park stops the slice's clock: an audited slice does not leave one running.
          closeSpan(entry(r, id), at);
          r.slices = r.slices.some((s) => s.id === id) ? r.slices.map((s) => (s.id === id ? parked : s)) : [...r.slices, parked];
        }
      }
    } else if (final) {
      r.final_audit_rounds = (Number(r.final_audit_rounds) || 0) + 1;
    } else {
      g.audit_rounds = (Number(g.audit_rounds) || 0) + 1;
      r.audit_rounds = (Number(r.audit_rounds) || 0) + 1;
      const raised = Array.isArray(musts) ? musts.map((m) => String(m).trim()) : [];
      // Any earlier round counts, not just the one before: A, B, A is the same loop as A, A.
      const before = [...new Set([...(g.seen_musts ?? []), ...(g.last_musts ?? [])])];
      // shortcut: a slice whose earlier rounds were counted before `seen_musts` existed is classified
      // from `last_musts` alone, so a repeat older than one round spends nothing, upgrade when an old
      // record's multi-round loop must count
      if (raised.length && raised.every((m) => before.includes(m))) g.audit_spent = (Number(g.audit_spent) || 0) + 1;
      // No plan to read is no classification: the lists stand and the round spends nothing.
      if (Array.isArray(musts)) {
        g.last_musts = raised;
        g.seen_musts = [...new Set([...before, ...raised])];
      }
    }
    refusal = refused;
  });
  const mine = auditLimits(record, id, final)[0];
  const g = final ? null : (record.gates ?? []).find((x) => x.id === id);
  return {
    audit_rounds: final ? spent(mine) : Number(g?.audit_rounds) || 0,
    // The final review has no slice, so it has no per-slice counter to report.
    audit_spent: final ? null : spent(mine),
    allow: !refusal,
    reason: refusal && auditCode(refusal),
    limit: refusal?.limit ?? null,
    detail: refusal && `${describe(refusal)}; last fix unreviewed`,
  };
}

// The round a slice has left, from the same limits `run audit` refuses at. `run tracks` asks before it
// dispatches a track, so a spent cap stops the work before a round is spent, not after. It reads the
// record and creates nothing; `reason` is the gate's own code for the limit that fired.
export function auditRoom(record, id) {
  const hit = auditLimits(record, id, false, { create: false }).find(atCap);
  return hit ? { allow: false, reason: auditCode(hit), limit: hit.limit, detail: describe(hit) } : { allow: true, reason: null, limit: null, detail: null };
}

// {allow, reason, detail}: reason is a code from stops.mjs. `current` is the
// slice's fingerprint in the tree its verify recorded; `merged` is the merged tree's now, when
// the caller has one. Caps first, then the verified rounds in a row, then freshness of the
// last verify, then the merged tree.
export function gate(record, id, { current, merged, now = Date.now() }) {
  const stop = (reason, detail) => ({ allow: false, reason, detail });
  const shipped = record.slices.filter((s) => s.status === 'shipped').length;
  if (record.max_slices != null && shipped >= record.max_slices) return stop('MAX_SLICES', `${shipped} shipped, cap ${record.max_slices}`);
  // Past a cap, never at it: a slice whose last allowed round passed still ships.
  const spentLimit = auditLimits(record, id, false, { create: false }).find(exhausted);
  if (spentLimit) return stop(auditCode(spentLimit), describe(spentLimit));
  const g = (record.gates ?? []).find((x) => x.id === id);
  // The cap counts in-flight minutes: the closed spans plus the open one, less the queue time a check
  // already recorded. A record written before spans reads its open span from `started`; a closed span
  // leaves `active_ms` set and no `active_since`, so time between sessions is never charged.
  const open = g?.active_since ?? (g && g.active_ms === undefined ? g.started : undefined);
  if (record.slice_cap_min != null && g && (open !== undefined || g.active_ms !== undefined)) {
    const banked = (Number(g.active_ms) || 0) + (open === undefined ? 0 : now - Date.parse(open));
    const worked = banked - Math.min(Number(g.waited_ms) || 0, banked);
    const mins = worked / 60000;
    if (mins > record.slice_cap_min) return stop('SLICE_CAP', `${Math.floor(mins)} min, cap ${record.slice_cap_min}`);
  }
  // Three failed rounds in a row park the slice, and an older pass cannot ship it: the count is
  // checked before the freshness of that pass. A pass or a resume clears it.
  if ((Number(g?.verify_failures) || 0) >= VERIFY_CAP_ROUNDS) {
    return stop('VERIFY_CAP', `${g.verify_failures} failed verify rounds in a row`);
  }
  if (!g?.verified_fingerprint) return stop('UNVERIFIED', `${id} has no passing verify-phase`);
  if (g.verified_fingerprint !== current) return stop('STALE_VERIFY', `${id} changed since its last passing verify-phase`);
  // A slice verified in another tree (a track's worktree) is merged back, so its ship needs the
  // suite on the merged tree as well; the coordinator's own checkout is the merged tree.
  if (g.verified_root !== undefined && g.verified_root !== '.' && !g.merged_fingerprint) {
    return stop('UNVERIFIED', `${id} ran in ${g.verified_root} and has no passing check on the merged tree: run verify --merged <dir>`);
  }
  if (g.merged_fingerprint && merged !== undefined && g.merged_fingerprint !== merged) {
    return stop('STALE_VERIFY', `${id}'s merged tree changed since its passing merged check`);
  }
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
