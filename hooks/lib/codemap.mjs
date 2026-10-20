// A compact code map for session start, so "reuse before writing" starts
// from knowing what exists. Prefers the repo's context map (its areas), then
// its module map (map-it output); otherwise summarises `git ls-files` by
// directory. Bounded in size and time,
// and fails open: any problem yields an empty map, never an error.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveDocs } from '../../skills/track-it/scripts/config.mjs';

export const MAP_BUDGET = 1500;
const SKIP = /^(node_modules|vendor|dist|build|out|target|coverage|third_party|temp|tmp|\.git|\.next|\.venv|venv|__pycache__)$/;
const TESTS = /^(tests?|__tests__|specs?|e2e|integration-tests?)$/i;
const SHARED = /^(shared|common|utils?|lib|libs|core|helpers|internal|pkg)$/i;
const MAX_CHILDREN = 6;
// Monorepo containers: each package under them is listed as its own entry.
const CONTAINERS = /^(packages|apps|services)$/;
const MAX_PACKAGES = 12;
// A top-level directory with one of these is a package too (amp's amp-queue/).
const MANIFESTS = /^(package\.json|cpanfile|go\.mod|pyproject\.toml|Cargo\.toml)$/;

function clip(text, budget) {
  if (text.length <= budget) return text;
  if (budget < 2) return '';
  const cut = text.slice(0, budget - 2);
  return `${cut.slice(0, Math.max(cut.lastIndexOf('\n'), 0) || cut.length)}\n…`;
}

// The context map's headings and table rows: the repo's areas and where each
// one's CONTEXT.md lives. Over budget, only the first two columns (Context,
// Location) are kept, then rows are clipped.
export function mapFromContextMap(root, cfg, budget = MAP_BUDGET) {
  const doc = resolveDocs(root, cfg).contextMap;
  if (!doc?.exists) return '';
  const file = path.resolve(root, doc.path);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
  const lines = text.split(/\r?\n/).filter((l) => /^\s*(\||##)/.test(l));
  if (!lines.some((l) => /^\s*\|/.test(l))) return '';
  const head = `From \`${path.relative(root, file)}\` (read it, then the area's CONTEXT.md, for the rest):\n\n`;
  const body = (rows) => rows.map((l) => (l.startsWith('#') ? `\n${l}` : l)).join('\n').trim();
  const full = head + body(lines);
  if (full.length <= budget) return full;
  const twoColumns = lines.map((l) => (l.startsWith('#') ? l : `|${l.split('|').slice(1, 3).join('|')}|`));
  return clip(head + body(twoColumns), budget);
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

  const files = res.stdout.split('\0');
  const manifestDirs = new Set(
    files.map((f) => f.split('/')).filter((p) => p.length === 2 && MANIFESTS.test(p[1]) && !CONTAINERS.test(p[0])).map((p) => p[0]),
  );
  const tops = new Map();
  const tests = new Map();
  for (const file of files) {
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
    // A file directly in a container (packages/README.md) is not a package.
    if (CONTAINERS.test(top) && parts.length === 2) continue;
    const pkg = CONTAINERS.test(top);
    const key = pkg ? `${top}/${second}` : top;
    const child = pkg ? parts[2] : second;
    const entry = tops.get(key) || { count: 0, children: new Map() };
    entry.count++;
    if (parts.length > (pkg ? 3 : 2)) entry.children.set(child, (entry.children.get(child) || 0) + 1);
    tops.set(key, entry);
  }
  if (!tops.size && !tests.size) return '';

  const leaf = (key) => key.slice(key.lastIndexOf('/') + 1);
  // Packages (in a container, or with their own manifest) rank above plain directories.
  const isPkg = (key) => key.includes('/') || manifestDirs.has(key);
  const sorted = [...tops.entries()].sort(
    ([a, x], [b, y]) =>
      Number(SHARED.test(leaf(b))) - Number(SHARED.test(leaf(a))) ||
      Number(isPkg(b)) - Number(isPkg(a)) ||
      y.count - x.count ||
      a.localeCompare(b),
  );
  // Keep each container's largest packages; the rest become one line.
  const shownPerContainer = new Map();
  const hidden = new Map();
  const order = sorted.filter(([key]) => {
    const container = key.includes('/') ? key.slice(0, key.indexOf('/')) : null;
    if (!container) return true;
    const n = (shownPerContainer.get(container) || 0) + 1;
    shownPerContainer.set(container, n);
    if (n <= MAX_PACKAGES) return true;
    hidden.set(container, (hidden.get(container) || 0) + 1);
    return false;
  });
  const lines = ['From `git ls-files` (files per directory, uncommitted ones included; shared code first):', ''];
  for (const [top, { count, children }] of order) {
    const kids = [...children.entries()].sort(
      ([a, x], [b, y]) => Number(SHARED.test(b)) - Number(SHARED.test(a)) || y - x || a.localeCompare(b),
    );
    const shown = kids.slice(0, MAX_CHILDREN).map(([name, n]) => `\`${name}/\` ${n}`);
    if (kids.length > MAX_CHILDREN) shown.push(`+${kids.length - MAX_CHILDREN} more`);
    lines.push(`- \`${top}/\` (${count})${shown.length ? `: ${shown.join(', ')}` : ''}`);
  }
  // Summary lines go last but are clipped first, to half the budget at most,
  // so directory lines give way before the Tests line does.
  const tail = [];
  if (hidden.size) tail.push(`More packages: ${[...hidden].map(([c, n]) => `\`${c}/\` +${n}`).join(', ')}`);
  if (tests.size) {
    const all = [...tests.entries()].sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
    const t = all.slice(0, MAX_CHILDREN).map(([d, n]) => `\`${d}\` ${n}`);
    if (all.length > MAX_CHILDREN) t.push(`+${all.length - MAX_CHILDREN} more`);
    tail.push('', `Tests: ${t.join(', ')}`);
  }
  if (!tail.length) return clip(lines.join('\n'), budget);
  // The tail takes at most half the budget; directory lines get the rest.
  const end = clip(tail.join('\n'), Math.floor(budget / 2));
  const head = clip(lines.join('\n'), budget - end.length - 1);
  return head ? `${head}\n${end}` : end;
}

export function codeMap(root, cfg, opts = {}) {
  try {
    return mapFromContextMap(root, cfg, opts.budget) || mapFromReference(root, cfg, opts.budget) || mapFromGit(root, opts);
  } catch {
    return '';
  }
}
