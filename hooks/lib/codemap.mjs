// A compact code map for session start, so "reuse before writing" starts
// from knowing what exists. Prefers the repo's own module map (map-it output);
// otherwise summarises `git ls-files` by directory. Bounded in size and time,
// and fails open: any problem yields an empty map, never an error.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveDocs } from '../../skills/track-it/scripts/config.mjs';

export const MAP_BUDGET = 1500;
const SKIP = /^(node_modules|vendor|dist|build|out|target|coverage|third_party|\.git|\.next|\.venv|venv|__pycache__)$/;
const TESTS = /^(tests?|__tests__|specs?|e2e|integration-tests?)$/i;
const SHARED = /^(shared|common|utils?|lib|libs|core|helpers|internal|pkg)$/i;
const MAX_CHILDREN = 6;

function clip(text, budget) {
  if (text.length <= budget) return text;
  const cut = text.slice(0, budget - 2);
  return `${cut.slice(0, Math.max(cut.lastIndexOf('\n'), 0) || cut.length)}\n…`;
}

// First rows of the reference module map, as written by map-it.
export function mapFromReference(root, cfg, budget = MAP_BUDGET) {
  const dir = resolveDocs(root, cfg).referenceDir;
  if (!dir?.path) return '';
  const file = path.resolve(root, dir.path, 'module-map.md');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
  const rows = text.split(/\r?\n/).filter((l) => /^\s*\|/.test(l));
  if (rows.length < 3) return '';
  const rel = path.relative(root, file);
  const body = rows.map((r) => (r.length > 200 ? `${r.slice(0, 197)}...|` : r)).join('\n');
  return clip(`From \`${rel}\` (read it for the full map):\n\n${body}`, budget);
}

// Directory summary from tracked files: top-level and second-level source
// directories with file counts, shared code first, tests listed separately.
export function mapFromGit(root, { budget = MAP_BUDGET, run = spawnSync, timeout = 1500 } = {}) {
  let res;
  try {
    // Untracked (not ignored) files too: do-it leaves new work uncommitted until ship.
    res = run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      timeout,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return '';
  }
  if (!res || res.status !== 0 || !res.stdout) return '';

  const tops = new Map();
  const tests = new Map();
  for (const file of res.stdout.split('\0')) {
    const parts = file.split('/');
    if (parts.length < 2 || parts.slice(0, -1).some((p) => SKIP.test(p))) continue;
    const [top, second] = parts;
    if (top.startsWith('.')) continue;
    const testDir = parts.slice(0, -1).find((p) => TESTS.test(p));
    if (testDir) {
      const key = TESTS.test(top) ? `${top}/` : `${parts.slice(0, parts.indexOf(testDir) + 1).join('/')}/`;
      tests.set(key, (tests.get(key) || 0) + 1);
      continue;
    }
    const entry = tops.get(top) || { count: 0, children: new Map() };
    entry.count++;
    if (parts.length > 2) entry.children.set(second, (entry.children.get(second) || 0) + 1);
    tops.set(top, entry);
  }
  if (!tops.size && !tests.size) return '';

  const order = [...tops.entries()].sort(
    ([a, x], [b, y]) => Number(SHARED.test(b)) - Number(SHARED.test(a)) || y.count - x.count || a.localeCompare(b),
  );
  const lines = ['From `git ls-files` (files per directory, uncommitted ones included; shared code first):', ''];
  for (const [top, { count, children }] of order) {
    const kids = [...children.entries()].sort(
      ([a, x], [b, y]) => Number(SHARED.test(b)) - Number(SHARED.test(a)) || y - x || a.localeCompare(b),
    );
    const shown = kids.slice(0, MAX_CHILDREN).map(([name, n]) => `\`${name}/\` ${n}`);
    if (kids.length > MAX_CHILDREN) shown.push(`+${kids.length - MAX_CHILDREN} more`);
    lines.push(`- \`${top}/\` (${count})${shown.length ? `: ${shown.join(', ')}` : ''}`);
  }
  if (tests.size) {
    const t = [...tests.entries()].sort(([, x], [, y]) => y - x).map(([d, n]) => `\`${d}\` ${n}`);
    lines.push('', `Tests: ${t.join(', ')}`);
  }
  return clip(lines.join('\n'), budget);
}

export function codeMap(root, cfg, opts = {}) {
  try {
    return mapFromReference(root, cfg, opts.budget) || mapFromGit(root, opts);
  } catch {
    return '';
  }
}
