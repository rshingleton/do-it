// The contract a run pairs its slices by: the `## Files` and `## Interfaces` sections a plan states.
// A plan is the only source, nothing here writes one. `run contract` prints it (runs.mjs); the
// pre-flight, `pairSlices`, refuses a pair whose slices overlap; run as a script it is the scope-it
// analyse pass, and exits 1 naming each section a plan is missing.

import fs from 'node:fs';
import { isMain } from '../../it-core/scripts/is-main.mjs';
import { splitFrontmatter } from '../../track-it/scripts/frontmatter.mjs';
import { sectionLines } from './roadmap.mjs';

const clean = (line) => line.replace(/^[-\s]+/, '').replace(/`/g, '').replace(/\s+/g, ' ').trim();

// One repo-relative file per line. `./x` and `x` are the same path; a comment is not a file.
function fileOf(line) {
  const text = clean(line);
  return text && !text.startsWith('#') ? text.replace(/^\.\//, '') : null;
}

// One interface per line: `<signature> -> <what it produces>`. The left of `->` is what a caller
// passes, the right the shape this slice produces; `pinned` says the plan states that shape. The
// name is compared lowercased, so two spellings of one interface still meet.
function interfaceOf(line) {
  const text = clean(line);
  if (!text || text.startsWith('#')) return null;
  const arrow = text.indexOf('->');
  const name = (arrow < 0 ? text : text.slice(0, arrow)).trim().toLowerCase();
  return { text, name, pinned: arrow >= 0 };
}

export function parseContract(text) {
  const files = sectionLines(text, 'Files').map(fileOf).filter(Boolean);
  const interfaces = sectionLines(text, 'Interfaces').map(interfaceOf).filter(Boolean);
  const gaps = [];
  // Every slice changes at least one file, so an empty `## Files` is a plan that forgot it.
  if (!files.length) gaps.push('Files');
  if (!/^##\s+Interfaces\s*$/im.test(text)) gaps.push('Interfaces');
  return { files, interfaces, gaps };
}

// A plan file's contract: the body, never its state block.
export function readPlan(file) {
  const text = fs.readFileSync(file, 'utf8');
  return { plan: file, ...parseContract(splitFrontmatter(text)?.body ?? text) };
}

// Can two slices run as two tracks? Their plans are the contract: a shared file, or an interface
// neither plan pins, refuses the pair and the refusal names what collided. `a` merges first, so its
// plan owns a shared path. A slice with a gap has no contract to check, so it pairs with nothing.
// shortcut: two pins of one interface pair whatever their shapes, compare the shapes when a real pair disagrees.
export function pairSlices(a, b) {
  const gaps = [a, b].filter((s) => s.gaps?.length);
  if (gaps.length) {
    return { allow: false, reason: 'NO_CONTRACT', detail: `${gaps.map((s) => `${s.id} has no ${s.gaps.map((g) => `## ${g}`).join(' or ')}`).join('; ')}: nothing to check the pair against` };
  }
  const mine = new Set(a.files);
  const shared = b.files.find((f) => mine.has(f));
  if (shared) return { allow: false, reason: 'SHARED_FILE', detail: `${a.id} and ${b.id} both change ${shared}` };
  const open = a.interfaces.find((x) => !x.pinned && b.interfaces.some((y) => !y.pinned && y.name === x.name));
  if (open) return { allow: false, reason: 'UNPINNED_INTERFACE', detail: `${a.id} and ${b.id} both use ${open.text}, and neither plan pins what it produces` };
  return { allow: true, reason: null, detail: null };
}

// Which of the free slices run as tracks now, in the order `run next --batch` returned them: the
// first, then each later one the pre-flight allows against every slice already chosen. `width` caps
// the count. A slice that collides (`SHARED_FILE`, `UNPINNED_INTERFACE`), has no contract to check
// (`NO_CONTRACT`), or loses its place to the width waits for the next round in `waiting` and is never
// parked for it.
export function pairTracks(slices, width) {
  const chosen = [];
  const waiting = [];
  for (const s of slices) {
    const clash = chosen.map((c) => pairSlices(c, s)).find((v) => !v.allow);
    if (clash) waiting.push({ id: s.id, reason: clash.reason, detail: clash.detail });
    else if (chosen.length >= width) waiting.push({ id: s.id, reason: 'WIDTH', detail: `${width} tracks run now: ${s.id} waits for the next round` });
    else chosen.push(s);
  }
  return { tracks: chosen, waiting };
}

// The scope-it analyse pass: one or more plan files in, each one's contract and its gaps out.
function lint(files) {
  const plans = files.map(readPlan);
  const errors = plans.flatMap((p) => p.gaps.map((g) => `${p.plan}: no ## ${g} section: a slice that runs in a track states the files and interfaces it changes`));
  return { plans, errors };
}

if (isMain(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) {
    process.stderr.write('usage: contract.mjs <plan file...>  (the plan, or a lane M plan\'s README)\n');
    process.exit(1);
  }
  const out = lint(files);
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  if (out.errors.length) process.exit(1);
}
