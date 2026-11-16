// A complete run's record: level, commit mode, branch, caps, per-slice state,
// assumptions taken and verification limits. It lives at
// <planning dir>/<roadmap-slug>.run/RUN.md. `createRun` writes the file once; every
// later change goes through `updateRun`, whoever calls it (gate.mjs keeps its per-slice
// facts the same way).
// The directory has no README.md, so items.mjs never lists it as a work item.

import fs from 'node:fs';
import path from 'node:path';
import { parseBlock, writeBlock } from './block.mjs';
import { splitFrontmatter, joinFrontmatter } from '../../track-it/scripts/frontmatter.mjs';
import { isId } from './ids.mjs';
import { sharedPaths } from './fileset.mjs';

const LEVELS = ['lite', 'full', 'ultra'];
const COMMIT_MODES = ['phase', 'slice', 'none'];
const SLICE_STATUSES = ['shipped', 'parked', 'blocked'];
const NEEDS = ['user', 'decision'];
const SETTABLE = ['level', 'commit', 'branch', 'tracks', 'max_slices', 'slice_cap_min', 'audit_cap', 'final_audit_cap', 'audit_total_cap', 'limits'];
// The hard ceiling on tracks, whatever the flag, the environment or the record says.
export const TRACKS_CEILING = 5;
// Changing a cap puts every refusal marker back to unset, so lowering a cap to the value
// it once refused at cannot revive an old refusal.
const CAPS = ['max_slices', 'audit_cap', 'final_audit_cap', 'audit_total_cap'];

// A path a record stores uses / on every platform, as runs.mjs does.
const toPosix = (p) => p.split(path.sep).join('/');

// The repo root a record stores: the real path, in posix form, so a symlink, a Windows
// short name or another spelling of the same checkout does not read as a different repo.
export function repoRoot(root) {
  if (root === null || root === undefined || root === '') return null;
  try {
    return toPosix(fs.realpathSync.native(root));
  } catch {
    return toPosix(path.resolve(root));
  }
}

export function runPath(planningDir, slug) {
  return path.join(planningDir, `${slug}.run`, 'RUN.md');
}

function checkSlug(slug) {
  if (!isId(slug)) throw new Error('run needs a roadmap slug (kebab-case)');
}

// A positive whole number, or null where the cap is optional and unset.
function cap(name, value, { optional = false } = {}) {
  if (value === null || value === undefined || value === '') {
    if (optional) return null;
    throw new Error(`${name} needs a positive whole number`);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive whole number, got ${value}`);
  return n;
}

function oneOf(name, value, allowed) {
  if (!allowed.includes(value)) throw new Error(`${name} must be one of ${allowed.join(', ')}, got ${value}`);
  return value;
}

function list(name, value) {
  if (!Array.isArray(value) || value.some((x) => typeof x !== 'string' || !x.trim())) {
    throw new Error(`${name} must be a JSON array of non-empty strings`);
  }
  return value;
}

// `--tracks` is the run's ask and defaults to 1, so a run changes nothing unless it asks.
// DO_IT_TRACKS caps the ask (default 3, the measured value) and 5 caps both.
function tracksValue(flag, room) {
  const ask = flag === undefined || flag === null || flag === '' ? 1 : cap('tracks', flag);
  const ceiling = room === undefined || room === null || room === '' ? 3 : cap('DO_IT_TRACKS', room);
  return Math.min(ask, ceiling, TRACKS_CEILING);
}

// A track commits on its own `do-it/<slug>--<slice>` branch, so a run that commits nothing leaves it
// no branch to merge: refuse the ask instead of starting a track that cannot land. `--tracks 1` is
// unchanged, because it builds in place and merges nothing.
export function requireTrackBranch(commit, tracks) {
  if (commit !== 'none' || tracks <= 1) return;
  throw new Error(
    `--tracks ${tracks} needs a commit mode that writes a branch: this run's commit mode is none (--commit none, or DO_IT_COMMIT=never), so its tracks would have no branch to merge; pass --commit phase or slice, or hold one track`,
  );
}

// How many tracks the run starts now: none at `tracks` 1 (the run builds in place, exactly as a run
// that never asked), else min(the ready slices, the machine's resource cap, `tracks`). The hard
// ceiling holds whatever the record says; `resource` stands for the heavy suites the machine runs at
// once, and the ceiling stands in when the caller does not know it.
export function trackWidth({ ready, tracks = 1, resource = TRACKS_CEILING }) {
  const n = cap('tracks', tracks);
  if (n === 1) return 0;
  const room = resource === undefined || resource === null ? TRACKS_CEILING : cap('resource', resource);
  return Math.max(0, Math.min(Number(ready) || 0, n, room, TRACKS_CEILING));
}

function validate(key, value) {
  switch (key) {
    case 'level':
      return oneOf('level', value, LEVELS);
    case 'commit':
      return oneOf('commit', value, COMMIT_MODES);
    case 'branch':
      if (value !== null && (typeof value !== 'string' || !value.trim())) throw new Error('branch must be a non-empty string or null');
      return value;
    // A set is the user's word for this record: the hard ceiling holds, the environment's does not.
    case 'tracks':
      return Math.min(cap('tracks', value), TRACKS_CEILING);
    case 'max_slices':
      return cap('max_slices', value, { optional: true });
    case 'slice_cap_min':
      return cap('slice_cap_min', value);
    case 'audit_cap':
      return cap('audit_cap', value);
    case 'final_audit_cap':
      return cap('final_audit_cap', value);
    case 'audit_total_cap':
      return cap('audit_total_cap', value, { optional: true });
    default:
      return list(key, value);
  }
}

function read(file, slug) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    throw new Error(`no run record for ${slug}: run new ${slug} first`);
  }
  const parts = splitFrontmatter(text);
  if (!parts) throw new Error(`${file}: no run record block (YAML frontmatter)`);
  const r = parseBlock(parts.yaml);
  r.slices = Array.isArray(r.slices) ? r.slices : [];
  r.assumptions = Array.isArray(r.assumptions) ? r.assumptions : [];
  r.limits = Array.isArray(r.limits) ? r.limits : [];
  r.rejected = Array.isArray(r.rejected) ? r.rejected : [];
  return { record: r, body: parts.body, eol: parts.eol };
}

// A temp file and a rename, as block.mjs does: a failed write leaves the old record whole.
function write(file, { record, body, eol }) {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, joinFrontmatter(writeBlock(record), body, eol ?? '\n'));
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

// The one read-modify-write of a record: `change(record)` edits it in place, and a throw leaves the file as it was.
export function updateRun(planningDir, slug, change) {
  checkSlug(slug);
  const file = runPath(planningDir, slug);
  const cur = read(file, slug);
  change(cur.record);
  write(file, cur);
  return cur.record;
}

// `defaults` carries the config's caps; a flag in `opts` wins over it.
export function createRun(planningDir, slug, opts, defaults, { now = () => new Date().toISOString(), root = null } = {}) {
  checkSlug(slug);
  const file = runPath(planningDir, slug);
  if (fs.existsSync(file)) throw new Error(`${slug} already has a run record`);
  // A commit flag wins over DO_IT_COMMIT=never; without one, never means none.
  const commit = oneOf('commit', opts.commit ?? (defaults.DO_IT_COMMIT === 'never' ? 'none' : 'phase'), COMMIT_MODES);
  // Tracks this run may hold at once: `--tracks` (default 1) under DO_IT_TRACKS and the ceiling of 5.
  const tracks = tracksValue(opts.tracks, defaults.DO_IT_TRACKS);
  requireTrackBranch(commit, tracks);
  const record = {
    id: slug,
    // The repo this run belongs to: it is not settable, and a command from another
    // checkout is refused (work.mjs) rather than reading a record that is not its own.
    root: repoRoot(root),
    level: oneOf('level', opts.level ?? 'full', LEVELS),
    commit,
    tracks,
    branch: null,
    started: opts.date ?? now(),
    // The commit HEAD resolved to at run new: the final review's fixed point. null outside git.
    base: opts.base ?? null,
    max_slices: cap('max_slices', opts['max-slices'] ?? defaults.DO_IT_MAX_SLICES, { optional: true }),
    slice_cap_min: cap('slice_cap_min', opts['slice-cap-min'] ?? defaults.DO_IT_SLICE_CAP_MIN),
    // Audit rounds: `audit_cap` per slice, `final_audit_cap` for the final review, `audit_total_cap`
    // over every slice's rounds (unset: max_slices x audit_cap when max_slices is set, else none).
    // A round `run audit` turns away is remembered as `audit_refused` on the slice's gates entry or
    // here (`final_audit_refused` for the final review), `audit_stop` names the limit; changing a cap clears them.
    audit_cap: cap('audit_cap', opts['audit-cap'] ?? defaults.DO_IT_AUDIT_CAP),
    final_audit_cap: cap('final_audit_cap', opts['final-audit-cap'] ?? defaults.DO_IT_FINAL_AUDIT_CAP),
    audit_total_cap: cap('audit_total_cap', opts['audit-total-cap'] ?? defaults.DO_IT_AUDIT_TOTAL_CAP, { optional: true }),
    slices: [],
    assumptions: [],
    rejected: [],
    limits: [],
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  write(file, { record, body: `\n# Run: ${slug}\n` });
  return record;
}

export function showRun(planningDir, slug) {
  checkSlug(slug);
  return read(runPath(planningDir, slug), slug).record;
}

function clearRefusals(r) {
  for (const k of ['audit_refused', 'final_audit_refused', 'audit_stop']) delete r[k];
  for (const g of r.gates ?? []) delete g.audit_refused;
}

export function setRun(planningDir, slug, key, value) {
  if (key === 'assumptions') throw new Error('run set does not take assumptions: use run add-assumptions <slug> <id> <json array> (the sweep uses the id `sweep`), so each one keeps a key reject-assumption can take');
  if (!SETTABLE.includes(key)) throw new Error(`run set takes one of: ${SETTABLE.join(', ')}`);
  if (value === undefined) throw new Error(`run set ${key} needs a value`);
  return updateRun(planningDir, slug, (r) => {
    r[key] = validate(key, value);
    if (CAPS.includes(key)) clearRefusals(r);
  });
}

// Merge one work item's plan assumptions into the record, each stored as
// `<id>#<n>: text` (n = its place in the item's own list, what reject-assumption
// takes). Re-adding an id replaces that id's entries; other entries stay.
export function addAssumptions(planningDir, slug, id, items) {
  if (!isId(id)) throw new Error('run add-assumptions needs the work id');
  list('assumptions', items);
  return updateRun(planningDir, slug, (r) => {
    // Rejections made against the list being replaced stay as history, marked so their keys cannot read
    // as the new list's.
    r.rejected = r.rejected.map((a) => (a.startsWith(`${id}#`) ? `earlier ${a}` : a));
    r.assumptions = [...r.assumptions.filter((a) => !a.startsWith(`${id}#`)), ...items.map((t, i) => `${id}#${i + 1}: ${t}`)];
  });
}

// Remove one recorded assumption by its `<id>#<n>` key (never by index, so the
// other keys keep their numbers) and keep it under `rejected` with what replaces it.
export function rejectAssumption(planningDir, slug, key, instead) {
  if (!instead) throw new Error('run reject-assumption needs what replaces the assumption');
  let text;
  const record = updateRun(planningDir, slug, (r) => {
    const entry = r.assumptions.find((a) => a.startsWith(`${key}: `));
    if (!entry) throw new Error(`no recorded assumption ${key}`);
    r.assumptions = r.assumptions.filter((a) => a !== entry);
    r.rejected = [...r.rejected, `${entry} (instead: ${instead})`];
    text = entry.slice(key.length + 2);
  });
  return { record, text };
}

// A slice moves to shipped, parked (with a reason and who must act) or
// blocked (waiting on a parked slice). A shipped slice never moves again.
export function sliceRun(planningDir, slug, id, status, { reason, needs } = {}) {
  if (!id) throw new Error('run slice needs a slice id');
  oneOf('status', status, SLICE_STATUSES);
  const entry = { id, status };
  if (status === 'parked') {
    if (!reason || !String(reason).trim()) throw new Error('a parked slice needs --reason');
    entry.reason = String(reason);
    entry.needs = oneOf('needs', needs, NEEDS);
  } else if (reason) entry.reason = String(reason);
  return updateRun(planningDir, slug, (r) => {
    const prior = r.slices.find((s) => s.id === id);
    if (prior?.status === 'shipped') throw new Error(`slice ${id} is shipped; a shipped slice does not move`);
    r.slices = prior ? r.slices.map((s) => (s.id === id ? entry : s)) : [...r.slices, entry];
  });
}

// Resume (`run slice <id> ready`): the user settled what parked the slice, so it rejoins the queue.
// What it was is kept in `retries`, so the digest can say how the retry ended, and its audit rounds
// start again: what stopped it is settled.
export function resumeSlice(planningDir, slug, id) {
  if (!id) throw new Error('run slice needs a slice id');
  return updateRun(planningDir, slug, (r) => {
    const prior = r.slices.find((s) => s.id === id);
    if (prior?.status === 'shipped') throw new Error(`slice ${id} is shipped; a shipped slice does not move`);
    if (prior) r.retries = [...(r.retries ?? []), { id, was: prior.status, reason: prior.reason ?? null }];
    r.slices = r.slices.filter((s) => s.id !== id);
    // The stop that named this slice is settled by the resume, so it does not outlive it.
    if (r.audit_stop?.startsWith(`slice ${id}:`)) delete r.audit_stop;
    const g = (r.gates ?? []).find((x) => x.id === id);
    if (g) {
      delete g.audit_rounds;
      delete g.audit_refused;
    }
  });
}

// A batch's picks. The lead (the free in-flight slices) is taken before any hint is read, then each
// slice in queue order whose file hint shares no path with one already picked. A colliding slice is set
// aside and, if the queue cannot fill the batch, backfills a slot in queue order: the batch keeps the
// size it has today, and a hint only changes which slices fill it. A slice with no hint never collides.
function hintBatch(ids, leadCount, filesOf, batch) {
  const picked = ids.slice(0, leadCount);
  const taken = () => picked.flatMap((id) => filesOf(id));
  const aside = [];
  for (const id of ids.slice(leadCount)) {
    if (picked.length >= batch) break;
    if (sharedPaths(filesOf(id), taken()).length) aside.push(id);
    else picked.push(id);
  }
  for (const id of aside) {
    if (picked.length >= batch) break;
    picked.push(id);
  }
  return picked.slice(0, batch);
}

// The slices a run builds next. `road` is roadmapSlices' result, `record` the run
// record. A parked or blocked slice is skipped, and so is anything that waits on
// one (through any chain of Blocked-by); every other slice goes on. A slice
// already in flight resumes before a new one starts.
// `batch` (from `run next --batch n`) asks for the next n free slices in the order
// `road.ready` holds them (milestone, risk, blocks, id), after the free in-flight ones,
// a slice whose `files` hint shares no path with one already picked displacing a colliding
// one; without it `next` is the one id it has always been.
// A slice's `files` hint lets a batch prefer a slice that shares no file with one already
// picked, and backfill a set-aside collider when the queue cannot fill the batch.
export function nextSlice(road, record, { batch } = {}) {
  if (batch !== undefined && (!Number.isInteger(batch) || batch < 1)) {
    throw new Error(`run next --batch needs a positive whole number, got ${batch}`);
  }
  const held = new Set(record.slices.filter((s) => s.status === 'parked' || s.status === 'blocked').map((s) => s.id));
  const byId = new Map(road.slices.map((s) => [s.id, s]));
  const waitsOnHeld = (s, seen = new Set()) =>
    s.blocked_by.some((b) => {
      if (held.has(b)) return true;
      if (seen.has(b) || !byId.has(b)) return false;
      seen.add(b);
      return waitsOnHeld(byId.get(b), seen);
    });
  const open = road.slices.filter((s) => !['shipped', 'dropped'].includes(s.state));
  const waiting = open.filter((s) => !held.has(s.id) && waitsOnHeld(s)).map((s) => s.id);
  const free = (id) => !held.has(id) && !waiting.includes(id);
  const flying = open.filter((s) => s.state === 'in flight' && free(s.id));
  // A batch takes every free in-flight slice first, in roadmap order: a track run holds several at
  // once. Without one, the first only, so one slice still resumes before a new one starts.
  const lead = (batch === undefined ? flying.slice(0, 1) : flying).map((s) => s.id);
  const queue = [...lead, ...road.ready.filter((id) => !lead.includes(id) && free(id))];
  const picks = batch === undefined ? queue.slice(0, 1) : hintBatch(queue, lead.length, (id) => byId.get(id)?.files ?? [], batch);
  // `next` is a list only when the caller asked for a batch; the cap stop keeps that shape too.
  const shape = (ids) => (batch === undefined ? (ids[0] ?? null) : ids);
  // The slice cap is checked before a slice is built, not when it comes to ship, and only when a
  // slice is left: a run that has nothing more to build finishes, it is not stopped. A slice
  // already in flight at the cap is named, so it is not dropped without a word.
  // A slice behind an open decision is not parked by the run, so say so: `defects` names each open
  // decision and the slices it holds, or they would never be offered, parked or reported.
  const defects = (road.blocking ?? []).map((d) => ({ decision: d.id, blocks: d.blocks, note: 'ask-when-reached: settle the decision, then the slices can run' }));
  const shipped = record.slices.filter((s) => s.status === 'shipped').length;
  if (picks.length && record.max_slices != null && shipped >= record.max_slices) {
    const inFlight = flying.length ? `; ${flying[0].id} is in flight` : '';
    return { next: shape([]), parked: [...held], waiting, defects, stop: { reason: 'MAX_SLICES', detail: `${shipped} shipped, cap ${record.max_slices}${inFlight}` } };
  }
  return { next: shape(picks), parked: [...held], waiting, defects };
}
