// Token usage per agent run, summed from Claude Code transcripts and kept as
// one small JSONL file per day, pruned to a few days. Host-neutral: callers
// pass transcript text and a directory; nothing here reads the environment
// except usageDir().
//
// One record per agent run (a main session or a subagent):
//   { id, kind, agent, model, session, project, day, start, at, turns, in, out, cr, cc, ctx0, peak }
// day is the UTC date the file is kept under; start and at are the run's first and last
// message times (ISO, UTC). Reports show local days, derived by localDay().
// in = fresh input, cr = cache reads, cc = cache writes, out = output tokens.
// ctx0 and peak are the total context (in + cr + cc) of the run's first turn and
// of its largest turn; records from before they existed lack them.
// Records are keyed by id and rewritten in place, so a session that stops many
// times keeps one line with running totals.
//
// Day files older than DEFAULT_DAYS are rolled up into rollup.jsonl, one row per
// day, agent, model and project with summed counts and a run count, and kept
// DEFAULT_ROLLUP_DAYS for trending. Raw detail is not kept past the first window.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_DAYS = 30;
export const DEFAULT_ROLLUP_DAYS = 365;
const ROLLUP = 'rollup.jsonl';
const COUNTS = ['runs', 'turns', 'in', 'out', 'cr', 'cc'];

export function usageDir(env = process.env) {
  return env.DO_IT_USAGE_DIR || path.join(os.homedir(), '.claude', 'do-it', 'usage');
}

export function keepDays(env = process.env) {
  const n = Number(env.DO_IT_USAGE_DAYS);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAYS;
}

export function rollupKeepDays(env = process.env) {
  const n = Number(env.DO_IT_USAGE_ROLLUP_DAYS);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_ROLLUP_DAYS;
}

// Total context (tokens) at which the Stop hook first suggests /clear; 0 turns it off.
export const DEFAULT_CLEAR_AT = 300000;
export function clearLimit(env = process.env) {
  const n = Number(env.DO_IT_CLEAR_AT);
  return env.DO_IT_CLEAR_AT !== undefined && env.DO_IT_CLEAR_AT !== '' && Number.isInteger(n) && n >= 0 ? n : DEFAULT_CLEAR_AT;
}

const cutoffDay = (days, now) => new Date(now.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);
// The local calendar date of an ISO time (the machine's TZ), for reports; files stay UTC.
export function localDay(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// A record seen through the local clock: day comes from when the run started
// (older records without start: when it ended; rollup rows keep their UTC day).
export const localized = (r) => (r.start || r.at ? { ...r, day: localDay(r.start ?? r.at) } : r);

const dayOf = (iso) => String(iso).slice(0, 10);

// Transcripts repeat an API message once per content block with the same
// usage, so count each message.id once (the largest output wins).
export function sumTranscript(text) {
  const byId = new Map();
  let first = null;
  let last = null;
  let cwd = null;
  const models = new Map();
  let ctx0 = null;
  let peak = 0;
  for (const line of String(text).split('\n')) {
    if (!line) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const u = o?.message?.usage;
    if (!u || o.message.role !== 'assistant') continue;
    first ??= o.timestamp ?? null;
    last = o.timestamp ?? last;
    cwd ??= o.cwd ?? null;
    const key = o.message.id ?? o.requestId ?? o.uuid;
    const prev = byId.get(key);
    if (!prev) {
      const ctx = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      ctx0 ??= ctx;
      peak = Math.max(peak, ctx);
    }
    if (!prev || (u.output_tokens ?? 0) >= prev.out) {
      byId.set(key, {
        in: u.input_tokens ?? 0,
        out: u.output_tokens ?? 0,
        cr: u.cache_read_input_tokens ?? 0,
        cc: u.cache_creation_input_tokens ?? 0,
        model: o.message.model,
      });
    }
  }
  const t = { turns: byId.size, in: 0, out: 0, cr: 0, cc: 0 };
  for (const m of byId.values()) {
    t.in += m.in;
    t.out += m.out;
    t.cr += m.cr;
    t.cc += m.cc;
    if (m.model) models.set(m.model, (models.get(m.model) ?? 0) + 1);
  }
  const model = [...models.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { ...t, model, first, last, cwd, ctx0, peak };
}

// Insert or replace the record with the same id in its day's file. The day is
// the run's first message, so a run that crosses midnight stays in one file.
export function record(dir, rec) {
  const file = path.join(dir, `${rec.day}.jsonl`);
  fs.mkdirSync(dir, { recursive: true });
  let lines = [];
  try {
    lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  } catch {}
  const mine = JSON.stringify(rec);
  let replaced = false;
  lines = lines.map((l) => {
    try {
      if (JSON.parse(l).id === rec.id) {
        replaced = true;
        return mine;
      }
    } catch {}
    return l;
  });
  if (!replaced) lines.push(mine);
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}

// The record with this id in its day's file, or null.
function existing(dir, day, id) {
  return readFile(path.join(dir, `${day}.jsonl`)).find((r) => r.id === id) ?? null;
}

// Roll day files older than `days` days (today counts as day one) into the
// rollup, delete them, then drop rollup rows older than `rollupDays`.
export function prune(dir, days, now = new Date(), rollupDays = DEFAULT_ROLLUP_DAYS) {
  const cutoff = cutoffDay(days, now);
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  const old = names.filter((n) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n) && n.slice(0, 10) < cutoff);
  const rollup = readFile(path.join(dir, ROLLUP));
  const oldDays = new Set(old.map((n) => n.slice(0, 10)));
  const rows = new Map();
  for (const r of rollup.filter((r) => !oldDays.has(r.day))) rows.set(rowKey(r), r);
  for (const n of old) {
    for (const r of readFile(path.join(dir, n))) {
      const k = rowKey(r);
      const g = rows.get(k) ?? { day: r.day, agent: r.agent, model: r.model, project: r.project, runs: 0, turns: 0, in: 0, out: 0, cr: 0, cc: 0 };
      for (const f of COUNTS) g[f] += f === 'runs' ? (r.runs ?? 1) : (r[f] ?? 0);
      rows.set(k, g);
    }
  }
  const keepFrom = cutoffDay(rollupDays, now);
  const kept = [...rows.values()].filter((r) => r.day >= keepFrom).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  if (old.length || kept.length !== rollup.length) {
    try {
      if (kept.length) fs.writeFileSync(path.join(dir, ROLLUP), `${kept.map((r) => JSON.stringify(r)).join('\n')}\n`);
      else fs.rmSync(path.join(dir, ROLLUP), { force: true });
    } catch {
      return; // keep the raw files when the rollup was not written
    }
  }
  for (const n of old) {
    try {
      fs.unlinkSync(path.join(dir, n));
    } catch {}
  }
}

const rowKey = (r) => [r.day, r.agent, r.model, r.project].join('|');

function readFile(file) {
  const out = [];
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  for (const l of text.split('\n')) {
    try {
      if (l) out.push(JSON.parse(l));
    } catch {}
  }
  return out;
}

// The transcript of a subagent: the hook's own path when given, else the
// layout Claude Code uses, <session>.jsonl beside <session>/subagents/.
export function subagentTranscript(input) {
  if (input.agent_transcript_path) return input.agent_transcript_path;
  if (!input.transcript_path || !input.agent_id) return null;
  const base = input.transcript_path.replace(/\.jsonl$/, '');
  return path.join(base, 'subagents', `agent-${input.agent_id}.jsonl`);
}

// Entry for the hook: kind is 'session' (Stop) or 'subagent' (SubagentStop).
// Returns the record written plus prevPeak (the peak this id had before this
// stop, null if none; not stored), or null when there was nothing to count.
export function trackUsage(kind, input, { dir = usageDir(), days = keepDays(), rollupDays = rollupKeepDays(), now = new Date() } = {}) {
  const file = kind === 'subagent' ? subagentTranscript(input) : input.transcript_path;
  if (!file) return null;
  const total = sumTranscript(fs.readFileSync(file, 'utf8'));
  if (!total.turns) return null;
  const at = total.last ?? now.toISOString(); // when the run last spoke, not when it was recorded
  const rec = {
    id: kind === 'subagent' ? (input.agent_id ?? path.basename(file, '.jsonl')) : input.session_id,
    kind,
    agent: kind === 'subagent' ? String(input.agent_type ?? 'unknown').replace(/^[^:]+:/, '') : 'main',
    model: total.model,
    session: input.session_id ?? null,
    project: input.cwd || total.cwd ? path.basename(input.cwd || total.cwd) : null,
    day: dayOf(total.first ?? at),
    start: total.first ?? at,
    at,
    turns: total.turns,
    in: total.in,
    out: total.out,
    cr: total.cr,
    cc: total.cc,
    ctx0: total.ctx0,
    peak: total.peak,
  };
  if (!rec.id || rec.day < cutoffDay(days, now)) return null; // already rolled up, or about to be
  const prevPeak = existing(dir, rec.day, rec.id)?.peak ?? null;
  record(dir, rec);
  prune(dir, days, now, rollupDays);
  return { ...rec, prevPeak };
}

// Every raw record plus every rollup row; a rollup row carries `runs`, a raw
// record counts as one.
export function readAll(dir) {
  let names = [];
  try {
    names = fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
  return names.filter((n) => n.endsWith('.jsonl')).flatMap((n) => readFile(path.join(dir, n)));
}

// Backfill from the transcripts Claude Code already keeps: every session and
// subagent file under `root` (~/.claude/projects) touched within `days`.
// Re-running is safe; records are keyed by id. Returns how many were written.
export function importTranscripts(root, { dir = usageDir(), days = keepDays(), rollupDays = rollupKeepDays(), now = new Date() } = {}) {
  const since = now.getTime() - days * 86400000;
  let n = 0;
  const fresh = (f) => fs.statSync(f).mtimeMs >= since;
  for (const proj of safeDir(root)) {
    const pdir = path.join(root, proj);
    for (const name of safeDir(pdir)) {
      if (!name.endsWith('.jsonl')) continue;
      const sid = name.slice(0, -'.jsonl'.length);
      const main = path.join(pdir, name);
      try {
        if (fresh(main) && trackUsage('session', { session_id: sid, transcript_path: main }, { dir, days, rollupDays, now })) n++;
      } catch {}
      const subs = path.join(pdir, sid, 'subagents');
      for (const f of safeDir(subs)) {
        if (!/^agent-.+\.jsonl$/.test(f)) continue;
        const file = path.join(subs, f);
        try {
          if (!fresh(file)) continue;
          let agentType;
          try {
            agentType = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8')).agentType;
          } catch {}
          const input = { session_id: sid, agent_id: f.slice(6, -6), agent_type: agentType, agent_transcript_path: file };
          if (trackUsage('subagent', input, { dir, days, rollupDays, now })) n++;
        } catch {}
      }
    }
  }
  return n;
}

function safeDir(d) {
  try {
    return fs.readdirSync(d);
  } catch {
    return [];
  }
}
