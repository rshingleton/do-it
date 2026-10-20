// A work item's state block: read, write, and the moves it may make.
//
// The block is YAML frontmatter on the plan (docs/planning/<id>.md for lane S,
// docs/planning/<id>/README.md for lane M). This module reads the subset the
// flow writes, plus the flow-map style older plans use, and writes block
// style only. Every status change goes through transition(), so the rules in
// ../STATE.md live in one place.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Parsing

function scalar(text) {
  const t = text.trim();
  if (t === '' || t === '~' || t === 'null') return null;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+$/.test(t) && t.length < 16) return Number(t);
  return t;
}

function stripComment(text) {
  return text.replace(/\s+#.*$/, '');
}

// Flow values: { a: b }, [a, b], "x", 'x', plain. Plain values end at a comma
// or closing bracket outside parentheses, so `title: Fixes (report, code)`
// stays one value.
function parseFlow(text) {
  let i = 0;
  const ws = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  const fail = (why) => {
    throw new Error(`state block: ${why} at column ${i + 1} in: ${text}`);
  };

  function quoted() {
    const q = text[i];
    if (q === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      if (j >= text.length) fail('unterminated string');
      const out = JSON.parse(text.slice(i, j + 1));
      i = j + 1;
      return out;
    }
    let out = '';
    i++;
    for (;;) {
      if (i >= text.length) fail('unterminated string');
      if (text[i] === "'") {
        if (text[i + 1] === "'") {
          out += "'";
          i += 2;
          continue;
        }
        i++;
        return out;
      }
      out += text[i++];
    }
  }

  function plain(stops) {
    let depth = 0;
    const start = i;
    while (i < text.length) {
      const c = text[i];
      if (c === '(') depth++;
      else if (c === ')') depth = Math.max(0, depth - 1);
      else if (depth === 0 && stops.includes(c)) break;
      i++;
    }
    return text.slice(start, i);
  }

  function value(stops) {
    ws();
    const c = text[i];
    if (c === '{') return map();
    if (c === '[') return list();
    if (c === '"' || c === "'") return quoted();
    return scalar(plain(stops));
  }

  function map() {
    const out = {};
    i++;
    for (;;) {
      ws();
      if (text[i] === '}') {
        i++;
        return out;
      }
      const key = text[i] === '"' || text[i] === "'" ? String(quoted()) : plain(':,}').trim();
      ws();
      if (text[i] !== ':') fail(`expected ':' after ${key}`);
      i++;
      out[key] = value(',}');
      ws();
      if (text[i] === ',') i++;
      else if (text[i] !== '}') fail("expected ',' or '}'");
    }
  }

  function list() {
    const out = [];
    i++;
    for (;;) {
      ws();
      if (text[i] === ']') {
        i++;
        return out;
      }
      out.push(value(',]'));
      ws();
      if (text[i] === ',') i++;
      else if (text[i] !== ']') fail("expected ',' or ']'");
    }
  }

  const out = value('');
  ws();
  if (i < text.length && text[i] !== '#') fail('unexpected text');
  return out;
}

function inline(text) {
  const t = text.trim();
  if (/^[{["']/.test(t)) return parseFlow(t);
  return scalar(stripComment(t));
}

// Bracket balance of a line, ignoring quoted text and comments.
function balance(line) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      if (i === 0 || /[\s[{,:-]/.test(line[i - 1])) quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) break;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
  }
  return depth;
}

// A line without its trailing comment, quotes respected.
function uncomment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      if (i === 0 || /[\s[{,:-]/.test(line[i - 1])) quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i).trimEnd();
  }
  return line;
}

// Lines of the block with indentation, multi-line flow values joined.
function logicalLines(yaml) {
  const out = [];
  const raw = yaml.split(/\r?\n/);
  for (let n = 0; n < raw.length; n++) {
    let line = raw[n];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    let depth = balance(line);
    if (depth > 0) line = uncomment(line);
    while (depth > 0 && n + 1 < raw.length) {
      const next = raw[++n];
      line += ` ${uncomment(next).trim()}`;
      depth += balance(next);
    }
    const indent = line.match(/^ */)[0].length;
    out.push({ indent, text: line.trim() });
  }
  return out;
}

const KEY = /^([A-Za-z0-9_.-]+|"[^"]*"):(?:\s+(.*))?$/;

function keyOf(raw) {
  return raw.startsWith('"') ? JSON.parse(raw) : raw;
}

function parseNode(lines, i, indent) {
  if (i >= lines.length || lines[i].indent < indent) return [null, i];
  const at = lines[i].indent;
  if (lines[i].text === '-' || lines[i].text.startsWith('- ')) return parseList(lines, i, at);
  return parseMap(lines, i, at);
}

function parseMap(lines, i, indent) {
  const out = {};
  while (i < lines.length && lines[i].indent === indent) {
    const m = lines[i].text.match(KEY);
    if (!m) throw new Error(`state block: cannot read line: ${lines[i].text}`);
    const key = keyOf(m[1]);
    const rest = m[2] ?? '';
    i++;
    if (rest.trim() && !rest.trim().startsWith('#')) {
      out[key] = inline(rest);
      continue;
    }
    const next = lines[i];
    if (next && next.indent > indent) [out[key], i] = parseNode(lines, i, next.indent);
    else if (next && next.indent === indent && (next.text === '-' || next.text.startsWith('- '))) {
      [out[key], i] = parseList(lines, i, indent);
    } else out[key] = null;
  }
  return [out, i];
}

function parseList(lines, i, indent) {
  const out = [];
  while (i < lines.length && lines[i].indent === indent && (lines[i].text === '-' || lines[i].text.startsWith('- '))) {
    const content = lines[i].text.slice(1).trim();
    if (!content) {
      const [v, j] = parseNode(lines, i + 1, indent + 1);
      out.push(v);
      i = j;
      continue;
    }
    if (!/^[{["']/.test(content) && KEY.test(content)) {
      // A map item: its first key sits on the dash line, the rest below it.
      const inner = indent + 2;
      const copy = [...lines];
      copy[i] = { indent: inner, text: content };
      const [v, j] = parseMap(copy, i, inner);
      out.push(v);
      i = j;
      continue;
    }
    out.push(inline(content));
    i++;
  }
  return [out, i];
}

export function parseBlock(yaml) {
  const lines = logicalLines(yaml);
  if (!lines.length) return {};
  const [out, i] = parseMap(lines, 0, lines[0].indent);
  if (i < lines.length) throw new Error(`state block: cannot read line: ${lines[i].text}`);
  return out;
}

// ---------------------------------------------------------------------------
// Writing

function plainOk(s) {
  return (
    s !== '' &&
    s === s.trim() &&
    /^[A-Za-z0-9_./]/.test(s) &&
    !/[:,[\]{}"'()]|\s#|[^\S ]/.test(s) &&
    scalar(s) === s
  );
}

function fmtScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v);
  return plainOk(s) ? s : JSON.stringify(s);
}

function isScalar(v) {
  return v === null || v === undefined || typeof v !== 'object';
}

function fmtKey(k) {
  return /^[A-Za-z0-9_.-]+$/.test(k) ? k : JSON.stringify(k);
}

// Short scalar lists stay on one line: blocked_by: [1, 2].
function shortList(v) {
  return v.every(isScalar) && v.every((x) => fmtScalar(x).length <= 40) && v.length <= 8;
}

function writeValue(key, v, indent, out) {
  const pad = ' '.repeat(indent);
  const head = `${pad}${fmtKey(key)}:`;
  if (Array.isArray(v)) {
    if (!v.length || shortList(v)) out.push(`${head} [${v.map(fmtScalar).join(', ')}]`);
    else {
      out.push(head);
      writeList(v, indent + 2, out);
    }
  } else if (v && typeof v === 'object') {
    if (!Object.keys(v).length) out.push(`${head} {}`);
    else {
      out.push(head);
      for (const [k, x] of Object.entries(v)) writeValue(k, x, indent + 2, out);
    }
  } else out.push(`${head} ${fmtScalar(v)}`);
}

function writeList(v, indent, out) {
  const pad = ' '.repeat(indent);
  for (const item of v) {
    if (item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length) {
      const lines = [];
      for (const [k, x] of Object.entries(item)) writeValue(k, x, indent + 2, lines);
      lines[0] = `${pad}- ${lines[0].slice(indent + 2)}`;
      out.push(...lines);
    } else if (Array.isArray(item)) {
      out.push(`${pad}- [${item.map(fmtScalar).join(', ')}]`);
    } else out.push(`${pad}- ${fmtScalar(item)}`);
  }
}

// Keys in the order STATE.md documents; anything else follows in its own order.
const ORDER = [
  'id', 'title', 'lane', 'status', 'tracker', 'sources', 'roadmap', 'todo', 'blocked_by',
  'base_ref', 'approvals', 'phases', 'verified', 'assumptions', 'fix', 'audit', 'ship', 'blocker',
];

export function writeBlock(state) {
  const keys = [...ORDER.filter((k) => k in state), ...Object.keys(state).filter((k) => !ORDER.includes(k))];
  const out = [];
  for (const k of keys) writeValue(k, state[k], 0, out);
  return `${out.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Shape

const STATUSES = ['draft', 'planned', 'building', 'blocked', 'auditing', 'shipping'];
const PHASE_STATUSES = ['ready', 'done', 'blocked'];

export function emptyBlock({ id, title, lane }) {
  const block = {
    id,
    title,
    lane,
    status: 'draft',
    tracker: null,
    sources: [],
    roadmap: null,
    todo: [],
    base_ref: null,
    approvals: { plan: null },
  };
  if (lane === 'm') block.phases = [];
  else block.verified = null;
  Object.assign(block, {
    assumptions: [],
    fix: [],
    audit: { verdict: null, round: 0, must: [], fingerprint: null, at: null },
    ship: { prepared: null, fingerprint: null },
    blocker: null,
  });
  return block;
}

function phaseShape(p) {
  return {
    n: Number(p.n),
    title: p.title ?? '',
    blocked_by: (p.blocked_by ?? []).map(Number),
    status: p.status ?? 'ready',
    verified: p.verified ?? null,
    ...(p.blocker ? { blocker: p.blocker } : {}),
  };
}

function asList(v) {
  if (v === null || v === undefined || v === '') return [];
  return Array.isArray(v) ? v : [v];
}

// Fill missing fields and coerce the ones older plans wrote differently
// (todo as a scalar, a numeric-looking base_ref), keeping unknown keys.
export function normalize(raw) {
  const lane = String(raw.lane ?? 's').toLowerCase();
  const base = emptyBlock({ id: raw.id, title: raw.title, lane });
  const out = { ...base, ...raw, lane };
  out.todo = asList(raw.todo).map(String);
  out.sources = asList(raw.sources);
  out.assumptions = asList(raw.assumptions);
  out.fix = asList(raw.fix);
  if (out.base_ref !== null && out.base_ref !== undefined) out.base_ref = String(out.base_ref);
  out.approvals = { ...base.approvals, ...(raw.approvals || {}) };
  if (out.approvals.plan !== null) out.approvals.plan = String(out.approvals.plan);
  out.audit = { ...base.audit, ...(raw.audit || {}) };
  out.audit.must = asList(out.audit.must);
  out.ship = { ...base.ship, ...(raw.ship || {}) };
  if (lane === 'm') out.phases = asList(raw.phases).map(phaseShape);
  return out;
}

// ---------------------------------------------------------------------------
// Files

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function splitPlan(text) {
  const m = text.match(FRONT);
  if (!m) return null;
  return { yaml: m[1], body: text.slice(m[0].length) };
}

export function planPath(planningDir, id) {
  const single = path.join(planningDir, `${id}.md`);
  if (fs.existsSync(single)) return single;
  const dir = path.join(planningDir, id, 'README.md');
  if (fs.existsSync(dir)) return dir;
  return null;
}

export function readItem(file) {
  const text = fs.readFileSync(file, 'utf8');
  const parts = splitPlan(text);
  if (!parts) throw new Error(`${file}: no state block (YAML frontmatter)`);
  const state = normalize(parseBlock(parts.yaml));
  return { path: file, lane: state.lane, state, body: parts.body, eol: text.includes('\r\n') ? '\r\n' : '\n' };
}

// Keeps the file's line endings, so a CRLF plan stays CRLF throughout.
export function writeItem(item) {
  const eol = item.eol ?? '\n';
  const block = `---\n${writeBlock(item.state)}---\n`;
  fs.writeFileSync(item.path, `${eol === '\n' ? block : block.replace(/\n/g, eol)}${item.body}`);
}

export function listItems(planningDir) {
  let entries;
  try {
    entries = fs.readdirSync(planningDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const file = e.isDirectory()
      ? path.join(planningDir, e.name, 'README.md')
      : e.name.endsWith('.md') ? path.join(planningDir, e.name) : null;
    if (!file || !fs.existsSync(file)) continue;
    try {
      const { state } = readItem(file);
      out.push({ id: state.id, title: state.title, lane: state.lane, status: state.status, roadmap: state.roadmap, path: file });
    } catch (err) {
      out.push({ id: e.name.replace(/\.md$/, ''), status: 'unreadable', error: err.message, path: file });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Transitions

function phase(state, n) {
  const p = (state.phases || []).find((x) => x.n === Number(n));
  if (!p) throw new Error(`no phase ${n} in ${state.id}`);
  return p;
}

const fixMode = (s) => s.audit.verdict === 'FAIL' || s.fix.length > 0;

// Each event: the statuses it may fire from, and what it does. `apply`
// mutates a copy and returns the new status (or undefined to keep it).
const EVENTS = {
  approve: {
    from: ['draft'],
    apply: (s, a) => {
      s.approvals.plan = a.date;
      return 'planned';
    },
  },
  start: {
    from: ['planned', 'building'],
    apply: (s, a) => {
      if (!s.base_ref) {
        if (!a.head) throw new Error('start needs the current HEAD');
        s.base_ref = a.head;
      }
      return 'building';
    },
  },
  'phase-done': {
    from: ['building'],
    apply: (s, a) => {
      if (!a.verified) throw new Error('phase-done needs the commands that passed (verified)');
      if (s.lane !== 'm') {
        s.verified = a.verified;
        return undefined;
      }
      if (a.n === undefined) throw new Error('lane M: phase-done needs a phase number');
      const p = phase(s, a.n);
      const open = p.blocked_by.filter((b) => phase(s, b).status !== 'done');
      if (open.length) throw new Error(`phase ${p.n} is blocked by phase(s) ${open.join(', ')}, not done`);
      p.status = 'done';
      p.verified = a.verified;
      delete p.blocker;
      return undefined;
    },
  },
  block: {
    from: ['planned', 'building', 'auditing', 'shipping'],
    apply: (s, a) => {
      if (!a.why) throw new Error('block needs a one-line reason');
      if (a.n !== undefined) {
        const p = phase(s, a.n);
        p.status = 'blocked';
        p.blocker = a.why;
        return undefined;
      }
      s.blocker = a.why;
      return 'blocked';
    },
  },
  unblock: {
    from: ['blocked', 'building'],
    apply: (s, a) => {
      if (a.n !== undefined) {
        const p = phase(s, a.n);
        if (p.status !== 'blocked') throw new Error(`phase ${p.n} is not blocked`);
        p.status = 'ready';
        delete p.blocker;
        return undefined;
      }
      if (s.status !== 'blocked') throw new Error(`${s.id} is not blocked`);
      s.blocker = null;
      return 'building';
    },
  },
  'build-done': {
    from: ['building'],
    apply: (s) => {
      if (fixMode(s)) {
        s.fix = [];
        return 'auditing';
      }
      if (s.lane === 'm') {
        if (!s.phases.length) throw new Error('lane M has no phases: set phases first');
        const left = s.phases.filter((p) => p.status !== 'done').map((p) => p.n);
        if (left.length) throw new Error(`phase(s) ${left.join(', ')} not done`);
      } else if (!s.verified) throw new Error('no verified record: run phase-done first');
      return 'auditing';
    },
  },
  'audit-pass': {
    from: ['auditing'],
    apply: (s, a) => {
      if (!a.fingerprint) throw new Error('audit-pass needs the fingerprint');
      // round counts consecutive failed audits.
      Object.assign(s.audit, { verdict: 'PASS', round: 0, must: [], fingerprint: a.fingerprint, at: a.date });
      return 'shipping';
    },
  },
  'audit-fail': {
    from: ['auditing'],
    apply: (s, a) => {
      if (!a.must?.length) throw new Error('audit-fail needs at least one Must finding');
      Object.assign(s.audit, {
        verdict: 'FAIL',
        round: (s.audit.round || 0) + 1,
        must: a.must,
        fingerprint: a.fingerprint ?? null,
        at: a.date,
      });
      // The third failed round in a row waits for the user; unblock is their answer.
      if (s.audit.round >= 3) {
        s.blocker = `audit failed ${s.audit.round} times in a row: fix, accept with a recorded decision, or re-plan`;
        return 'blocked';
      }
      return 'building';
    },
  },
  replan: {
    from: ['planned', 'building', 'blocked', 'auditing', 'shipping'],
    apply: (s) => {
      // Back to scope-it: the plan needs approving again; work done so far
      // stays, but the new plan is built and audited afresh, not in fix mode.
      s.approvals.plan = null;
      s.blocker = null;
      s.fix = [];
      s.audit = { verdict: null, round: 0, must: [], fingerprint: null, at: null };
      s.ship = { prepared: null, fingerprint: null };
      return 'draft';
    },
  },
  'ship-prepared': {
    from: ['shipping'],
    apply: (s, a) => {
      if (!a.fingerprint) throw new Error('ship-prepared needs the fingerprint');
      s.ship = { prepared: a.date, fingerprint: a.fingerprint, tree: a.tree ?? null };
      return undefined;
    },
  },
  reaudit: {
    from: ['shipping'],
    apply: (s) => {
      // The review changed code the user wants checked again.
      s.ship = { prepared: null, fingerprint: null };
      return 'auditing';
    },
  },
  'reject-assumption': {
    from: ['auditing', 'shipping'],
    apply: (s, a) => {
      const i = Number(a.n) - 1;
      if (!Number.isInteger(i) || !s.assumptions[i]) {
        throw new Error(`reject-assumption needs an assumption number (1-${s.assumptions.length}) and what replaces it`);
      }
      if (!a.text) throw new Error('reject-assumption needs what replaces the assumption');
      const [old] = s.assumptions.splice(i, 1);
      s.fix.push(`Rejected assumption: ${old}. Instead: ${a.text}`);
      s.ship = { prepared: null, fingerprint: null };
      return 'building';
    },
  },
};

export const EVENT_NAMES = Object.keys(EVENTS);

export function allowedEvents(status) {
  return EVENT_NAMES.filter((e) => EVENTS[e].from.includes(status));
}

// Returns a new state; never mutates the input. Throws on an illegal move,
// naming the events the current status allows.
export function transition(state, event, args = {}) {
  const def = EVENTS[event];
  if (!def) throw new Error(`unknown event ${event}; events: ${EVENT_NAMES.join(', ')}`);
  if (!STATUSES.includes(state.status)) throw new Error(`${state.id}: unknown status ${state.status}`);
  if (!def.from.includes(state.status)) {
    throw new Error(`${event} is not allowed from ${state.status}; allowed: ${allowedEvents(state.status).join(', ') || 'none'}`);
  }
  const next = structuredClone(state);
  const to = def.apply(next, { ...args, date: args.date || today() });
  if (to) next.status = to;
  for (const p of next.phases || []) {
    if (!PHASE_STATUSES.includes(p.status)) throw new Error(`phase ${p.n}: unknown status ${p.status}`);
  }
  return next;
}

// Blocked items wait for the user, including after a third failed audit.
export function needsUser(state) {
  return state.status === 'blocked';
}

export function today(now = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${z(now.getMonth() + 1)}-${z(now.getDate())}`;
}

// ---------------------------------------------------------------------------
// Roadmaps

const RISK = { high: 0, med: 1, medium: 1, low: 2 };

function cells(row) {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function sectionLines(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^##\\s+${heading}\\s*$`, 'i').test(l));
  if (start < 0) return [];
  const out = [];
  for (const l of lines.slice(start + 1)) {
    if (/^##\s/.test(l)) break;
    out.push(l);
  }
  return out;
}

export function parseRoadmap(text) {
  const slices = [];
  let header = null;
  let milestone = 0;
  for (const line of text.split(/\r?\n/)) {
    if (/^###\s/.test(line)) milestone++;
    if (!/^\s*\|/.test(line)) {
      header = null;
      continue;
    }
    const row = cells(line);
    if (!header) {
      const lower = row.map((c) => c.toLowerCase());
      if (lower.includes('slice') && lower.includes('status')) header = lower;
      continue;
    }
    if (row.every((c) => /^:?-+:?$/.test(c))) continue;
    const get = (name) => row[header.indexOf(name)] ?? '';
    const id = get('slice');
    if (!/^R\d+$/.test(id)) continue;
    const blockedBy = get('blocked by');
    slices.push({
      id,
      milestone,
      kind: get('kind'),
      delivers: get('delivers'),
      risk: get('risk').toLowerCase(),
      blocked_by: /^(none|-|)$/i.test(blockedBy) ? [] : [...blockedBy.matchAll(/\b([RD]\d+)\b/g)].map((m) => m[1]),
      status: get('status'),
      ref: header.includes('ref') ? get('ref') || null : null,
    });
  }
  const open = sectionLines(text, 'Open decisions')
    .map((l) => l.match(/^\s*-\s*(D\d+)\b/))
    .filter(Boolean)
    .map((m) => m[1]);
  return { slices, openDecisions: open };
}

function isTracked(root, file) {
  const r = spawnSync('git', ['ls-files', '--error-unmatch', '--', path.relative(root, file)], { cwd: root, encoding: 'utf8' });
  return r.status === 0;
}

// Derive every slice's state from the roadmap and the plans that name it.
// A plan that git tracks was committed outside ship-it (the flow never
// commits a plan), so its slice is reported stale instead of in flight.
export function roadmapSlices(file, { root, planningDir, tracked = (f) => isTracked(root, f) }) {
  const { slices, openDecisions } = parseRoadmap(fs.readFileSync(file, 'utf8'));
  const target = path.resolve(root, file);
  const plans = new Map();
  for (const item of listItems(planningDir)) {
    if (item.status === 'unreadable') continue;
    const [ref, slice] = String(item.roadmap ?? '').split('#');
    if (ref && slice && path.resolve(root, ref) === target) plans.set(slice, { id: item.id, status: item.status, path: item.path });
  }
  const status = new Map(slices.map((s) => [s.id, s.status.toLowerCase()]));
  const done = (id) => /^(shipped|dropped)\b/.test(status.get(id) ?? '');

  const out = slices.map((s) => {
    const st = s.status.toLowerCase();
    const plan = plans.get(s.id);
    let state;
    let note = null;
    if (st.startsWith('shipped')) state = 'shipped';
    else if (st.startsWith('dropped')) state = 'dropped';
    else if (plan && tracked(plan.path)) {
      state = 'stale';
      note = `plan ${plan.id} is committed, so it shipped outside ship-it: set the slice's Status to shipped <date> ${plan.id} and git rm the plan, or re-scope the slice`;
    } else if (plan) {
      state = 'in flight';
      note = `${plan.id} (${plan.status})`;
    } else {
      const waiting = s.blocked_by.filter((b) => (b.startsWith('D') ? openDecisions.includes(b) : !done(b)));
      if (waiting.length) {
        state = 'blocked';
        note = `waiting on ${waiting.join(', ')}`;
      } else state = st === 'refine' ? 'refine' : 'ready';
    }
    return { ...s, state, note, plan: plan?.id ?? null };
  });

  const ready = out
    .filter((s) => s.state === 'ready' || s.state === 'refine')
    .sort(
      (a, b) =>
        a.milestone - b.milestone ||
        (RISK[a.risk] ?? 1) - (RISK[b.risk] ?? 1) ||
        a.blocked_by.length - b.blocked_by.length ||
        Number(a.id.slice(1)) - Number(b.id.slice(1)),
    );
  return { slices: out, openDecisions, next: ready[0]?.id ?? null };
}
