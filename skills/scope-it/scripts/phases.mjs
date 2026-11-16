// Whether a lane M plan cuts along its files: every phase file states `## Files`, the README lists
// their union, and two phases that share a path are separated by a block edge. The scope-it analyze
// pass runs it; a lane S plan keeps one list in its plan, so there is nothing to compare. Paths are
// compared exactly, as fileset does, and nothing here writes a plan.

import fs from 'node:fs';
import path from 'node:path';
import { isMain } from '../../it-core/scripts/is-main.mjs';
import { readItem } from '../../do-it/scripts/block.mjs';
import { parseFileList, sharedPaths } from '../../do-it/scripts/fileset.mjs';
import { sectionLines } from '../../do-it/scripts/roadmap.mjs';

const PHASE_FILE = /^phase-(\d+)\.md$/;

// Every `phase-<n>.md` beside the README, by number. A file named otherwise is not a phase.
function phaseFiles(dir) {
  return fs
    .readdirSync(dir)
    .map((name) => name.match(PHASE_FILE))
    .filter(Boolean)
    .map((m) => ({ n: Number(m[1]), name: m[0], file: path.join(dir, m[0]) }))
    .sort((a, b) => a.n - b.n);
}

// The paths one phase file lists, or null when it states no `## Files`: a missing section and an
// empty list are different errors, so the heading is looked for before the lines are read.
function filesOf(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (!/^##\s+Files\s*$/im.test(text)) return null;
  return parseFileList(sectionLines(text, 'Files').join('\n'));
}

// The phases each phase waits on, followed to the end, so a chain separates a pair as a direct
// edge does.
function ancestors(phases) {
  const edges = new Map(phases.map((p) => [p.n, p.blocked_by ?? []]));
  const out = new Map();
  for (const p of phases) {
    const seen = new Set();
    const stack = [...(edges.get(p.n) ?? [])];
    while (stack.length) {
      const n = stack.pop();
      if (seen.has(n)) continue;
      seen.add(n);
      stack.push(...(edges.get(n) ?? []));
    }
    out.set(p.n, seen);
  }
  return out;
}

// A pair is serial when either one reaches the other over `blocked_by`, in either direction.
function separated(reach, a, b) {
  return Boolean(reach.get(a)?.has(b) || reach.get(b)?.has(a));
}

// The analyze pass's locality errors for one plan: the README's path, or its directory. A lane S
// plan, or a directory with no phase files, reports its one list and no errors.
export function lintPhases(target) {
  const stat = fs.statSync(target);
  const laneS = (plan) => ({
    plan,
    lane: 's',
    phases: [],
    errors: [],
    note: `${plan}: lane S has one ## Files list, so there is no phase to compare`,
  });
  // A lane S plan is one file; a `README.md` or a directory is the lane M entry point.
  if (!stat.isDirectory() && path.basename(target) !== 'README.md') return laneS(target);
  const dir = stat.isDirectory() ? target : path.dirname(target);
  const readme = path.join(dir, 'README.md');
  const found = phaseFiles(dir);
  if (!found.length) return laneS(readme);
  if (!fs.existsSync(readme)) {
    return { plan: readme, lane: 'm', phases: [], errors: [`${readme}: missing, so the phase files have no state block to pair with`], note: null };
  }
  let item;
  try {
    item = readItem(readme);
  } catch (e) {
    return { plan: readme, lane: 'm', phases: [], errors: [e.message.startsWith(readme) ? e.message : `${readme}: ${e.message}`], note: null };
  }

  const state = item.state;
  const declared = new Map((state.phases ?? []).map((p) => [p.n, p]));
  const errors = [];
  const phases = [];

  // Each file and its state phase, both ways: a phase file with no state phase has no
  // blocked_by to read, and a state phase with no file has no list to check.
  for (const p of found) {
    const files = filesOf(p.file);
    if (!declared.has(p.n)) errors.push(`${p.name}: no phase ${p.n} in the README state block`);
    if (files === null) errors.push(`${p.name}: no ## Files section: a phase states the files it changes`);
    else if (!files.length) errors.push(`${p.name}: states ## Files but lists no path: a phase changes at least one file`);
    phases.push({ n: p.n, file: p.file, files: files ?? [] });
  }
  for (const n of declared.keys()) {
    if (!found.some((p) => p.n === n)) errors.push(`${path.join(dir, `phase-${n}.md`)}: missing, though phase ${n} is in the README state block`);
  }

  // The README's list is the phases' union as a set: order and repeats do not matter, a path on
  // one side only does.
  const union = [];
  const named = new Set();
  for (const p of phases) {
    for (const f of p.files) {
      if (named.has(f)) continue;
      named.add(f);
      union.push(f);
    }
  }
  const readmeFiles = parseFileList(sectionLines(item.body, 'Files').join('\n'));
  const listed = new Set(readmeFiles);
  const onlyReadme = readmeFiles.filter((f, i) => !named.has(f) && readmeFiles.indexOf(f) === i);
  const onlyPhases = union.filter((f) => !listed.has(f));
  if (onlyReadme.length || onlyPhases.length) {
    const side = (label, files) => (files.length ? `${label}: ${files.join(', ')}` : null);
    const parts = [side('only in the README', onlyReadme), side('only in the phases', onlyPhases)].filter(Boolean);
    errors.push(`${readme}: ## Files is not the union of its phases' files (${parts.join('; ')})`);
  }

  // Two phases may run side by side only when neither waits on the other: a shared path between
  // them means the cut is wrong, or the block edge is missing.
  const reach = ancestors([...declared.values()]);
  const byNumber = new Map(phases.filter((p) => declared.has(p.n)).map((p) => [p.n, p]));
  const numbers = [...byNumber.keys()].sort((a, b) => a - b);
  for (let i = 0; i < numbers.length; i++) {
    for (let j = i + 1; j < numbers.length; j++) {
      const [a, b] = [numbers[i], numbers[j]];
      if (separated(reach, a, b)) continue;
      for (const file of sharedPaths(byNumber.get(a).files, byNumber.get(b).files)) {
        errors.push(`phase ${a} and phase ${b} both change ${file}, and no block edge separates them: cut along the file, or make one block the other`);
      }
    }
  }

  return { plan: readme, lane: 'm', phases, errors, note: null };
}

if (isMain(import.meta.url)) {
  const [target] = process.argv.slice(2);
  if (!target || !fs.existsSync(target)) {
    process.stderr.write('usage: phases.mjs <lane M plan dir or its README, or a lane S plan file>\n');
    process.exit(2);
  }
  const out = lintPhases(target);
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  if (out.errors.length) process.exit(1);
}
