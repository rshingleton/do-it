// A roadmap's slices and the state each one is in, derived from the roadmap
// file and the plans that name a slice.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { listItems } from './items.mjs';

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
