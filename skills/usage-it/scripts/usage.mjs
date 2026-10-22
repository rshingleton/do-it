#!/usr/bin/env node
// Summarise recorded token usage (default last 30 days): node skills/usage-it/scripts/usage.mjs [--days N | --hours N] [--by agent|model|day|month|project] [--json]
//   node skills/usage-it/scripts/usage.mjs --import   first backfill the last N days from ~/.claude/projects
// Reads the files ledger.mjs keeps (DO_IT_USAGE_DIR, default ~/.claude/do-it/usage).

import os from 'node:os';
import path from 'node:path';
import { importTranscripts, readAll, usageDir } from './ledger.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const hours = Number(opt('hours', 0));
const days = hours > 0 ? Math.ceil(hours / 24) + 1 : Number(opt('days', 30));
const by = opt('by', 'agent');
const KEYS = ['agent', 'model', 'day', 'month', 'project'];
if (!KEYS.includes(by) || !(days > 0)) {
  console.error('usage: usage.mjs [--days N | --hours N] [--by agent|model|day|month|project] [--json]');
  process.exit(2);
}

if (args.includes('--import')) {
  const n = importTranscripts(path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects'), { days });
  console.error(`imported ${n} run(s) from the last ${days} day(s)`);
}

const cutoff = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
// --hours filters on when a run ended; rolled-up rows carry no time and drop out.
const since = hours > 0 ? new Date(Date.now() - hours * 3600000).toISOString() : null;
const recs = readAll(usageDir()).filter((r) => (since ? r.at >= since : r.day >= cutoff));

const groups = new Map();
for (const r of recs) {
  const key = (by === 'month' ? r.day.slice(0, 7) : r[by]) ?? 'unknown';
  const g = groups.get(key) ?? { [by]: key, runs: 0, turns: 0, in: 0, out: 0, cr: 0, cc: 0 };
  g.runs += r.runs ?? 1;
  for (const f of ['turns', 'in', 'out', 'cr', 'cc']) g[f] += r[f] ?? 0;
  groups.set(key, g);
}
const rows = [...groups.values()].sort((a, b) => b.out + b.in + b.cc - (a.out + a.in + a.cc));

if (args.includes('--json')) {
  console.log(JSON.stringify(rows));
} else if (!rows.length) {
  console.log(`no usage recorded in the last ${hours > 0 ? `${hours} hour(s)` : `${days} day(s)`} in ${usageDir()}`);
} else {
  const n = (v) => v.toLocaleString('en-US');
  const cols = [by, 'runs', 'turns', 'in', 'out', 'cache_read', 'cache_write'];
  const body = rows.map((g) => [g[by], g.runs, g.turns, g.in, g.out, g.cr, g.cc].map((v, i) => (i ? n(v) : String(v))));
  const w = cols.map((c, i) => Math.max(c.length, ...body.map((r) => r[i].length)));
  const line = (r) => r.map((v, i) => (i ? v.padStart(w[i]) : v.padEnd(w[i]))).join('  ');
  console.log(line(cols));
  for (const r of body) console.log(line(r));
}
