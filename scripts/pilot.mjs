#!/usr/bin/env node
// Phase 0 timing log for the two-track pilot (docs/research/parallel-pilot.md).
// Throwaway tooling: mark a step, then report the shares and the 2-track bounds.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_LOG = path.join(ROOT, 'docs/research/phase0.log');
const EVENTS = ['start', 'end'];
const REPORT_STEPS = ['scope', 'build', 'prove', 'ship'];
const STEPS = [...REPORT_STEPS, 'merge', 'verify', 'wait'];
const ARMS = ['serial', 'tracks'];

const seconds = (ms) => ms / 1000;
const minutes = (s) => `${(s / 60).toFixed(1)}m`;
const fix = (n, d = 2) => Number(n.toFixed(d));

export function formatLine({ arm, slice, step, event, note }, now = new Date()) {
  return [now.toISOString(), arm, slice, step, event, note || '-'].join(' | ');
}

// Append one event. The log is plain text so the pilot survives a lost session.
export function mark(log, entry, { now = new Date() } = {}) {
  if (!ARMS.includes(entry.arm)) throw new Error(`arm must be one of: ${ARMS.join(', ')}`);
  for (const key of ['slice', 'step']) if (!String(entry[key] ?? '').trim()) throw new Error(`${key} is required`);
  if (!EVENTS.includes(entry.event)) throw new Error(`event must be one of: ${EVENTS.join(', ')}`);
  const line = formatLine(entry, now);
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.appendFileSync(log, `${line}\n`);
  return line;
}

// Lines that cannot be read are named, not dropped in silence.
export function parseLog(text) {
  const entries = [];
  const skipped = [];
  for (const [i, raw] of String(text).split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('|').map((s) => s.trim());
    const [at, arm, slice, step, event] = parts;
    const note = parts.slice(5).join(' | ') || null;
    const t = Date.parse(at);
    const why =
      parts.length < 5 ? 'fewer than five fields'
      : !Number.isFinite(t) ? `not a timestamp: ${at}`
      : !arm || !slice || !step ? 'a required field is empty'
      : !EVENTS.includes(event) ? `event must be start or end: ${event}`
      : null;
    if (why) skipped.push({ line: i + 1, why });
    else entries.push({ at, t, arm, slice, step, event, note });
  }
  return { entries, skipped };
}

function duration(entries, step) {
  let open = null;
  let ms = 0;
  const problems = [];
  for (const e of entries.filter((x) => x.step === step)) {
    if (e.event === 'start') {
      if (open) problems.push(`${step}: start before the previous end`);
      open = e;
    } else if (!open) {
      problems.push(`${step}: end without a start`);
    } else {
      ms += e.t - open.t;
      open = null;
    }
  }
  if (open) problems.push(`${step}: start without an end`);
  return { ms, problems };
}

export function summarize(entries) {
  const groups = new Map();
  for (const e of entries) {
    const key = `${e.arm}|${e.slice}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const out = [];
  for (const [key, list] of groups) {
    const [arm, slice] = key.split('|');
    const first = Math.min(...list.map((e) => e.t));
    const last = Math.max(...list.map((e) => e.t));
    const total = seconds(last - first);
    const steps = {};
    const problems = [];
    for (const step of STEPS) {
      const d = duration(list, step);
      steps[step] = fix(seconds(d.ms), 1);
      problems.push(...d.problems);
    }
    const build = seconds(duration(list, 'build').ms);
    const prove = seconds(duration(list, 'prove').ms);
    const b = total > 0 ? build / total : 0;
    const p = total > 0 ? (build + prove) / total : 0;
    out.push({
      arm,
      slice,
      total: fix(total, 1),
      steps,
      build_share: fix(b, 3),
      parallel_share: fix(p, 3),
      // 2 tracks: build only and build plus prove.
      bound_build: b > 0 ? fix(1 / (1 - b / 2), 2) : 1,
      bound_both: p > 0 ? fix(1 / (1 - p / 2), 2) : 1,
      problems,
    });
  }
  return out.sort((a, b) => a.arm.localeCompare(b.arm) || a.slice.localeCompare(b.slice, undefined, { numeric: true }));
}

export function report(summaries) {
  if (!summaries.length) return 'no events: mark a start and an end first';
  const head = ['arm', 'slice', 'total', 'scope', 'build', 'prove', 'ship', 'b', 'p', 'build-only', 'both'];
  const rows = summaries.map((s) => [
    s.arm,
    s.slice,
    minutes(s.total),
    minutes(s.steps.scope),
    minutes(s.steps.build),
    minutes(s.steps.prove),
    minutes(s.steps.ship),
    s.build_share.toFixed(2),
    s.parallel_share.toFixed(2),
    `${s.bound_build.toFixed(2)}x`,
    `${s.bound_both.toFixed(2)}x`,
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  const text = [line(head), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)];
  for (const arm of [...new Set(summaries.map((s) => s.arm))]) {
    const mine = summaries.filter((s) => s.arm === arm);
    const mean = (pick) => fix(mine.reduce((n, s) => n + pick(s), 0) / mine.length, 3);
    const worst = mine.reduce((m, s) => Math.min(m, s.bound_build), Infinity);
    text.push('', `${arm}: mean b ${mean((s) => s.build_share).toFixed(2)}, mean p ${mean((s) => s.parallel_share).toFixed(2)}, weakest build-only bound ${worst.toFixed(2)}x`);
  }
  const problems = summaries.flatMap((s) => s.problems.map((p) => `${s.arm} ${s.slice}: ${p}`));
  if (problems.length) text.push('', ...problems.map((p) => `problem: ${p}`));
  return text.join('\n');
}

function main(argv) {
  const args = [...argv];
  const at = args.indexOf('--log');
  const log = at >= 0 ? path.resolve(args.splice(at, 2)[1]) : DEFAULT_LOG;
  const json = args.includes('--json');
  const [cmd, ...rest] = args;
  if (cmd === 'mark') {
    const [arm, slice, step, event, ...note] = rest;
    try {
      const line = mark(log, { arm, slice, step, event, note: note.join(' ') });
      console.log(line);
      return 0;
    } catch (e) {
      console.error(`pilot: ${e.message}`);
      return 2;
    }
  }
  if (cmd === 'report') {
    let text;
    try {
      text = fs.readFileSync(log, 'utf8');
    } catch {
      console.error(`pilot: no log at ${log}; mark a start first`);
      return 2;
    }
    const { entries, skipped } = parseLog(text);
    const summaries = summarize(entries);
    console.log(json ? JSON.stringify({ summaries, skipped }, null, 2) : report(summaries));
    if (skipped.length) {
      for (const s of skipped) console.error(`pilot: skipped line ${s.line}: ${s.why}`);
      return 1;
    }
    return 0;
  }
  console.error('usage: pilot.mjs mark <serial|tracks> <slice> <step> <start|end> [note] [--log file]');
  console.error('       pilot.mjs report [--log file] [--json]');
  return 2;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exit(main(process.argv.slice(2)));
