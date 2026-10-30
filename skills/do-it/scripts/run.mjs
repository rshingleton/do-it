// A complete run's record: level, commit mode, branch, caps, per-slice state,
// assumptions taken and verification limits. It lives at
// <planning dir>/<roadmap-slug>.run/RUN.md and work.mjs is its only writer.
// The directory has no README.md, so items.mjs never lists it as a work item.

import fs from 'node:fs';
import path from 'node:path';
import { parseBlock, writeBlock } from './block.mjs';
import { splitFrontmatter, joinFrontmatter } from '../../track-it/scripts/frontmatter.mjs';

export const LEVELS = ['lite', 'full', 'ultra'];
export const COMMIT_MODES = ['phase', 'slice', 'none'];
export const SLICE_STATUSES = ['shipped', 'parked', 'blocked'];
export const NEEDS = ['user', 'decision'];
const SETTABLE = ['level', 'commit', 'branch', 'max_slices', 'slice_cap_min', 'audit_cap', 'final_audit_cap', 'audit_total_cap', 'assumptions', 'limits'];
// Changing a cap puts every refusal marker back to unset, so lowering a cap to the value
// it once refused at cannot revive an old refusal.
const CAPS = ['max_slices', 'audit_cap', 'final_audit_cap', 'audit_total_cap'];

export function runPath(planningDir, slug) {
  return path.join(planningDir, `${slug}.run`, 'RUN.md');
}

function checkSlug(slug) {
  if (!slug || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(slug)) throw new Error('run needs a roadmap slug (kebab-case)');
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

function validate(key, value) {
  switch (key) {
    case 'level':
      return oneOf('level', value, LEVELS);
    case 'commit':
      return oneOf('commit', value, COMMIT_MODES);
    case 'branch':
      if (value !== null && (typeof value !== 'string' || !value.trim())) throw new Error('branch must be a non-empty string or null');
      return value;
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

export function read(file, slug) {
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
export function write(file, { record, body, eol }) {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, joinFrontmatter(writeBlock(record), body, eol ?? '\n'));
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

// `defaults` carries the config's caps; a flag in `opts` wins over it.
export function createRun(planningDir, slug, opts, defaults, { now = () => new Date().toISOString() } = {}) {
  checkSlug(slug);
  const file = runPath(planningDir, slug);
  if (fs.existsSync(file)) throw new Error(`${slug} already has a run record`);
  const record = {
    id: slug,
    level: oneOf('level', opts.level ?? 'full', LEVELS),
    // A commit flag wins over DO_IT_COMMIT=never; without one, never means none.
    commit: oneOf('commit', opts.commit ?? (defaults.DO_IT_COMMIT === 'never' ? 'none' : 'phase'), COMMIT_MODES),
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
  checkSlug(slug);
  if (!SETTABLE.includes(key)) throw new Error(`run set takes one of: ${SETTABLE.join(', ')}`);
  if (value === undefined) throw new Error(`run set ${key} needs a value`);
  const file = runPath(planningDir, slug);
  const cur = read(file, slug);
  cur.record[key] = validate(key, value);
  if (CAPS.includes(key)) clearRefusals(cur.record);
  write(file, cur);
  return cur.record;
}

// Merge one work item's plan assumptions into the record, each stored as
// `<id>#<n>: text` (n = its place in the item's own list, what reject-assumption
// takes). Re-adding an id replaces that id's entries; other entries stay.
export function addAssumptions(planningDir, slug, id, items) {
  checkSlug(slug);
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(id)) throw new Error('run add-assumptions needs the work id');
  list('assumptions', items);
  const file = runPath(planningDir, slug);
  const cur = read(file, slug);
  cur.record.assumptions = [...cur.record.assumptions.filter((a) => !a.startsWith(`${id}#`)), ...items.map((t, i) => `${id}#${i + 1}: ${t}`)];
  write(file, cur);
  return cur.record;
}

// Remove one recorded assumption by its `<id>#<n>` key (never by index, so the
// other keys keep their numbers) and keep it under `rejected` with what replaces it.
export function rejectAssumption(planningDir, slug, key, instead) {
  checkSlug(slug);
  const file = runPath(planningDir, slug);
  const cur = read(file, slug);
  const entry = cur.record.assumptions.find((a) => a.startsWith(`${key}: `));
  if (!entry) throw new Error(`no recorded assumption ${key}`);
  cur.record.assumptions = cur.record.assumptions.filter((a) => a !== entry);
  cur.record.rejected = [...cur.record.rejected, instead ? `${entry} (instead: ${instead})` : entry];
  write(file, cur);
  return { record: cur.record, text: entry.slice(key.length + 2) };
}

// A slice moves to shipped, parked (with a reason and who must act) or
// blocked (waiting on a parked slice). A shipped slice never moves again.
export function sliceRun(planningDir, slug, id, status, { reason, needs } = {}) {
  checkSlug(slug);
  if (!id) throw new Error('run slice needs a slice id');
  oneOf('status', status, [...SLICE_STATUSES, 'ready']);
  const file = runPath(planningDir, slug);
  const cur = read(file, slug);
  const prior = cur.record.slices.find((s) => s.id === id);
  if (prior?.status === 'shipped') throw new Error(`slice ${id} is shipped; a shipped slice does not move`);
  if (status === 'ready') {
    // Resume: the user settled what parked it, so the slice rejoins the queue.
    // What it was is kept in `retries`, so the digest can say how the retry ended.
    if (prior) cur.record.retries = [...(cur.record.retries ?? []), { id, was: prior.status, reason: prior.reason ?? null }];
    cur.record.slices = cur.record.slices.filter((s) => s.id !== id);
    // A resumed slice starts its audit rounds again: what stopped it is settled.
    const g = (cur.record.gates ?? []).find((x) => x.id === id);
    if (g) {
      delete g.audit_rounds;
      delete g.audit_refused;
    }
    write(file, cur);
    return cur.record;
  }
  const entry = { id, status };
  if (status === 'parked') {
    if (!reason || !String(reason).trim()) throw new Error('a parked slice needs --reason');
    entry.reason = String(reason);
    entry.needs = oneOf('needs', needs, NEEDS);
  } else if (reason) entry.reason = String(reason);
  cur.record.slices = prior ? cur.record.slices.map((s) => (s.id === id ? entry : s)) : [...cur.record.slices, entry];
  write(file, cur);
  return cur.record;
}

// The slice a run builds next. `road` is roadmapSlices' result, `record` the run
// record. A parked or blocked slice is skipped, and so is anything that waits on
// one (through any chain of Blocked-by); every other slice goes on. A slice
// already in flight resumes before a new one starts.
export function nextSlice(road, record) {
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
  const flying = open.find((s) => s.state === 'in flight' && free(s.id));
  const next = flying?.id ?? road.ready.find(free) ?? null;
  // The slice cap is checked before a slice is built, not when it comes to ship, and only when a
  // slice is left: a run that has nothing more to build finishes, it is not stopped. A slice
  // already in flight at the cap is named, so it is not dropped without a word.
  const shipped = record.slices.filter((s) => s.status === 'shipped').length;
  if (next && record.max_slices != null && shipped >= record.max_slices) {
    const inFlight = flying ? `; ${flying.id} is in flight` : '';
    return { next: null, parked: [...held], waiting, stop: { reason: 'MAX_SLICES', detail: `${shipped} shipped, cap ${record.max_slices}${inFlight}` } };
  }
  return { next, parked: [...held], waiting };
}
