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
const SETTABLE = ['level', 'commit', 'branch', 'max_slices', 'slice_cap_min', 'audit_cap', 'assumptions', 'limits'];

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
    max_slices: cap('max_slices', opts['max-slices'] ?? defaults.DO_IT_MAX_SLICES, { optional: true }),
    slice_cap_min: cap('slice_cap_min', opts['slice-cap-min'] ?? defaults.DO_IT_SLICE_CAP_MIN),
    audit_cap: cap('audit_cap', opts['audit-cap'] ?? defaults.DO_IT_AUDIT_CAP),
    slices: [],
    assumptions: [],
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

export function setRun(planningDir, slug, key, value) {
  checkSlug(slug);
  if (!SETTABLE.includes(key)) throw new Error(`run set takes one of: ${SETTABLE.join(', ')}`);
  if (value === undefined) throw new Error(`run set ${key} needs a value`);
  const file = runPath(planningDir, slug);
  const cur = read(file, slug);
  cur.record[key] = validate(key, value);
  write(file, cur);
  return cur.record;
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
    cur.record.slices = cur.record.slices.filter((s) => s.id !== id);
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
  return { next, parked: [...held], waiting };
}
