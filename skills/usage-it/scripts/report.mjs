#!/usr/bin/env node
// Write a self-contained HTML usage report from the ledger:
//   node report.mjs [--days N | --hours N] [--out file] [--open]
// Default: the last 30 days, written to <usage dir>/../reports/usage-<date>.html.
// No network, no dependencies; every string from the ledger is escaped.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readAll, usageDir } from './ledger.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const hours = Number(opt('hours', 0));
const days = hours > 0 ? Math.ceil(hours / 24) + 1 : Number(opt('days', 30));
if (!(days > 0)) {
  console.error('usage: report.mjs [--days N | --hours N] [--out file] [--open]');
  process.exit(2);
}

const now = new Date();
const today = now.toISOString().slice(0, 10);
const cutoff = new Date(now.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);
// --hours filters on when a run ended; rolled-up rows carry no time and drop out.
const since = hours > 0 ? new Date(now.getTime() - hours * 3600000).toISOString() : null;
const recs = readAll(usageDir())
  .filter((r) => (since ? r.at >= since : r.day >= cutoff))
  .map((r) => ({ ...r, runs: r.runs ?? 1, work: (r.in ?? 0) + (r.out ?? 0) + (r.cc ?? 0), family: familyOf(r.model) }));

// Fixed order, one color per family: the series never repaint.
const FAMILIES = ['Sonnet', 'Opus', 'Haiku', 'Other'];
function familyOf(model) {
  const m = String(model ?? '').toLowerCase();
  return m.includes('sonnet') ? 'Sonnet' : m.includes('opus') ? 'Opus' : m.includes('haiku') ? 'Haiku' : 'Other';
}
// Agent types that carry no model of their own, so they follow the session.
const UNPINNED = new Set(['general-purpose', 'fork', 'Explore', 'Plan']);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '0%');
const sum = (rs, f) => rs.reduce((t, r) => t + (r[f] ?? 0), 0);

function group(rs, keyOf) {
  const m = new Map();
  for (const r of rs) {
    const k = keyOf(r) ?? 'unknown';
    const g = m.get(k) ?? { key: k, runs: 0, turns: 0, work: 0, out: 0, cr: 0, fam: {} };
    g.runs += r.runs;
    g.turns += r.turns ?? 0;
    g.work += r.work;
    g.out += r.out ?? 0;
    g.cr += r.cr ?? 0;
    g.fam[r.family] = (g.fam[r.family] ?? 0) + r.work + (r.cr ?? 0);
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.work - a.work);
}
const topFamily = (g) => Object.entries(g.fam).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

// Round an axis top up to 1, 2, 4 or 8 times a power of ten, so the four ticks are round.
function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 4, 8, 10].map((m) => m * p).find((m) => m >= v);
}

// ---- stacked columns: one chart per measure, never two scales on one axis ----
const byMonth = days > 60;
const bucket = (r) => (byMonth ? r.day.slice(0, 7) : r.day);
function chart(id, measure, title) {
  const keys = [...new Set(recs.map(bucket))].sort();
  const val = (r) => (measure === 'work' ? r.work : (r.cr ?? 0));
  const cols = keys.map((k) => {
    const rs = recs.filter((r) => bucket(r) === k);
    return { k, parts: FAMILIES.map((f) => sum(rs.filter((r) => r.family === f).map((r) => ({ v: val(r) })), 'v')) };
  });
  const W = 720, H = 220, L = 56, B = 26, T = 8, plotH = H - B - T;
  const max = niceMax(Math.max(1, ...cols.map((c) => c.parts.reduce((a, b) => a + b, 0))));
  const step = plotH / 4;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">`;
  for (let i = 0; i <= 4; i++) {
    const y = T + plotH - i * step;
    svg += `<line class="grid" x1="${L}" x2="${W}" y1="${y}" y2="${y}"/><text class="axis" x="${L - 6}" y="${y + 4}" text-anchor="end">${fmt((max * i) / 4)}</text>`;
  }
  const slot = (W - L) / Math.max(1, cols.length);
  const bw = Math.min(28, slot * 0.7);
  cols.forEach((c, i) => {
    const x = L + i * slot + (slot - bw) / 2;
    let y = T + plotH;
    const tip = `${c.k}: ${FAMILIES.map((f, j) => (c.parts[j] ? `${f} ${fmt(c.parts[j])}` : '')).filter(Boolean).join(', ')}`;
    svg += `<g class="col" data-tip="${esc(tip)}"><rect class="hit" x="${L + i * slot}" y="${T}" width="${slot}" height="${plotH}"/>`;
    c.parts.forEach((v, j) => {
      if (!v) return;
      const h = Math.max(1, (v / max) * plotH);
      y -= h;
      svg += `<rect class="s${j + 1}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2"/>`;
    });
    svg += '</g>';
    if (cols.length <= 16 || i % Math.ceil(cols.length / 12) === 0) svg += `<text class="axis" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(byMonth ? c.k : c.k.slice(5))}</text>`;
  });
  svg += '</svg>';
  const legend = FAMILIES.map((f, j) => `<span><i class="sw s${j + 1}"></i>${f}</span>`).join('');
  return `<section><h2>${esc(title)}</h2><div class="legend">${legend}</div>${svg}</section>`;
}

// ---- tables ----
function table(rows, label, extra = false) {
  const max = Math.max(1, ...rows.map((r) => r.work));
  const body = rows
    .map(
      (r) =>
        `<tr><td>${esc(r.key)}</td>${extra ? `<td>${esc(topFamily(r))}</td>` : ''}<td class="n">${r.runs}</td><td class="n">${fmt(r.work)}<div class="bar"><b style="width:${((r.work / max) * 100).toFixed(1)}%"></b></div></td><td class="n">${fmt(r.out)}</td><td class="n">${fmt(r.cr)}</td></tr>`,
    )
    .join('');
  return `<table><thead><tr><th>${label}</th>${extra ? '<th>mostly</th>' : ''}<th class="n">runs</th><th class="n">work tokens</th><th class="n">output</th><th class="n">cache read</th></tr></thead><tbody>${body}</tbody></table>`;
}

// ---- what stands out: plain sentences from the numbers, nothing guessed ----
function notes() {
  const out = [];
  const total = sum(recs, 'work');
  const agents = group(recs, (r) => r.agent);
  if (agents[0] && total) out.push(`<b>${esc(agents[0].key)}</b> is the largest consumer: ${pct(agents[0].work, total)} of work tokens over ${agents[0].runs} run(s).`);
  const mainOpus = recs.filter((r) => r.agent === 'main' && r.family === 'Opus');
  const mainCr = sum(recs.filter((r) => r.agent === 'main'), 'cr');
  if (mainOpus.length && mainCr) out.push(`Main sessions on Opus account for ${pct(sum(mainOpus, 'cr'), mainCr)} of all main-session cache reads (${mainOpus.length} run(s)). The main model is the biggest lever.`);
  const loose = recs.filter((r) => UNPINNED.has(r.agent) && r.family === 'Opus');
  if (loose.length) out.push(`${loose.length} run(s) of unpinned agent types (${[...new Set(loose.map((r) => r.agent))].map(esc).join(', ')}) ran on Opus because they follow the session model.`);
  const all = sum(recs, 'work') + sum(recs, 'cr');
  if (all) out.push(`Re-reading context (cache reads) is ${pct(sum(recs, 'cr'), all)} of all tokens. Long sessions that carry old context cost the most; <code>/clear</code> between tasks.`);
  return out.length ? `<ul>${out.map((n) => `<li>${n}</li>`).join('')}</ul>` : '<p class="muted">Nothing stands out yet.</p>';
}

const tile = (label, value, sub = '') => `<div class="tile"><div class="k">${esc(label)}</div><div class="v">${esc(value)}</div><div class="sub">${esc(sub)}</div></div>`;
const mainRuns = recs.filter((r) => r.agent === 'main');
const subRuns = recs.filter((r) => r.agent !== 'main');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Usage report</title>
<style>
:root{color-scheme:light;--bg:#fcfcfb;--panel:#f4f3f0;--ink:#0b0b0b;--ink2:#52514e;--muted:#6b6a66;--line:#e2e1dc;--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#8a897f}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#1a1a19;--panel:#232321;--ink:#f0efec;--ink2:#c3c2b7;--muted:#9a9990;--line:#37362f;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#8a897f}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#1a1a19;--panel:#232321;--ink:#f0efec;--ink2:#c3c2b7;--muted:#9a9990;--line:#37362f;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#8a897f}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px 48px}h1{font-size:22px;margin:0 0 2px}h2{font-size:15px;margin:28px 0 8px}
.muted,.sub{color:var(--muted)}.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}
.tile{background:var(--panel);border-radius:8px;padding:12px 14px}.k{color:var(--ink2);font-size:12px}.v{font-size:24px;font-weight:600}.sub{font-size:12px}
svg{width:100%;height:auto;display:block}.grid{stroke:var(--line)}.axis{fill:var(--muted);font-size:11px}.hit{fill:transparent}
.s1{fill:var(--s1);stroke:var(--bg);stroke-width:2}.s2{fill:var(--s2);stroke:var(--bg);stroke-width:2}.s3{fill:var(--s3);stroke:var(--bg);stroke-width:2}.s4{fill:var(--s4);stroke:var(--bg);stroke-width:2}
.legend{display:flex;gap:14px;flex-wrap:wrap;color:var(--ink2);font-size:12px;margin-bottom:4px}.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px}
.sw.s1{background:var(--s1)}.sw.s2{background:var(--s2)}.sw.s3{background:var(--s3)}.sw.s4{background:var(--s4)}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}th{color:var(--ink2);font-weight:500;font-size:12px}.n{text-align:right;font-variant-numeric:tabular-nums}
.bar{height:3px;background:var(--line);border-radius:2px;margin-top:3px}.bar b{display:block;height:3px;background:var(--s1);border-radius:2px}
li{margin:4px 0}code{background:var(--panel);padding:1px 4px;border-radius:4px}
#tip{position:fixed;pointer-events:none;background:var(--ink);color:var(--bg);padding:4px 8px;border-radius:6px;font-size:12px;display:none;max-width:320px}
</style></head><body><main>
<h1>Usage report</h1>
<div class="muted">${esc(cutoff)} to ${esc(today)} (${hours > 0 ? `last ${hours} hours` : `${days} days`}, by ${byMonth ? 'month' : 'day'}). Work tokens are input, output and cache writes; cache reads are shown apart.</div>
<div class="tiles">
${tile('Runs', String(sum(recs, 'runs')), `${sum(mainRuns, 'runs')} main, ${sum(subRuns, 'runs')} subagent`)}
${tile('Work tokens', fmt(sum(recs, 'work')), `${fmt(sum(mainRuns, 'work'))} main, ${fmt(sum(subRuns, 'work'))} subagent`)}
${tile('Output tokens', fmt(sum(recs, 'out')))}
${tile('Cache reads', fmt(sum(recs, 'cr')), 'context re-read each turn')}
</div>
<h2>What stands out</h2>${notes()}
${chart('work', 'work', 'Work tokens over time, by model')}
${chart('cr', 'cr', 'Cache reads over time, by model')}
<h2>By agent</h2>${table(group(recs, (r) => r.agent), 'agent', true)}
<h2>By model</h2>${table(group(recs, (r) => r.model), 'model')}
<h2>By project</h2>${table(group(recs, (r) => r.project), 'project')}
</main><div id="tip"></div>
<script>
const tip=document.getElementById('tip');
document.addEventListener('mousemove',e=>{const g=e.target.closest&&e.target.closest('[data-tip]');
if(!g){tip.style.display='none';return}tip.textContent=g.dataset.tip;tip.style.display='block';
tip.style.left=Math.min(e.clientX+12,innerWidth-tip.offsetWidth-8)+'px';tip.style.top=(e.clientY+12)+'px'});
</script></body></html>
`;

const out = path.resolve(opt('out', path.join(path.dirname(usageDir()), 'reports', `usage-${today}.html`)));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(out);
if (args.includes('--open')) {
  const cmd = process.platform === 'darwin' ? ['open', out] : process.platform === 'win32' ? ['cmd', '/c', 'start', '', out] : ['xdg-open', out];
  spawnSync(cmd[0], cmd.slice(1), { stdio: 'ignore' });
}
void os;
