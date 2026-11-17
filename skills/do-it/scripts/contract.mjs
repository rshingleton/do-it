// The contract a run pairs its slices by: the `## Files` and `## Interfaces` sections a plan states.
// A plan is the only source, nothing here writes one. `run contract` prints it (runs.mjs); the
// pre-flight, `pairSlices`, refuses a pair whose slices overlap; run as a script it is the scope-it
// analyse pass, and exits 1 naming each section a plan is missing.

import fs from 'node:fs';
import path from 'node:path';
import { isMain } from '../../it-core/scripts/is-main.mjs';
import { splitFrontmatter } from '../../track-it/scripts/frontmatter.mjs';
import { sectionLines } from './roadmap.mjs';
import { cleanLine, parseFileList, sharedPaths } from './fileset.mjs';

// One interface per line: `<signature> -> <what it produces>`. The left of `->` is what a caller
// passes, the right the shape this slice produces; `pinned` says the plan states that shape. The
// name is compared lowercased, so two spellings of one interface still meet.
function interfaceOf(line) {
  const text = cleanLine(line);
  if (!text || text.startsWith('#')) return null;
  const arrow = text.indexOf('->');
  const name = (arrow < 0 ? text : text.slice(0, arrow)).trim().toLowerCase();
  return { text, name, pinned: arrow >= 0 };
}

// A step and the text that follows it: a long step wraps, so its `→ verify:` can sit on the next
// line. The step lines are the only place a verify is read from; a lane M README states none.
function stepsOf(text) {
  const steps = [];
  let cur = null;
  for (const line of sectionLines(text, 'Steps')) {
    const start = /^\s*(\d+)\.\s+(.*)$/.exec(line);
    if (start) {
      cur = { n: Number(start[1]), text: start[2] };
      steps.push(cur);
    } else if (cur && line.trim()) cur.text += ` ${line.trim()}`;
  }
  return steps;
}

// The runnable command a step's `→ verify:` states, or null for a prose check ("the table names the
// probe"). The last marker is the real one: a step about this rule can name `→ verify:` in prose.
// Runnable means it starts with a backticked token or with `npm`, `node` or `git`; the command is
// the first backticked span, or the words after the arrow.
function verifyCommand(step) {
  const marks = [...step.text.matchAll(/→\s*verify:\s*/g)];
  const last = marks.at(-1);
  if (!last) return null;
  const text = step.text.slice(last.index + last[0].length).trim();
  if (text.startsWith('`')) {
    const end = text.indexOf('`', 1);
    return end > 0 ? text.slice(1, end).trim() || null : null;
  }
  return /^(?:npm|node|git)\b/.test(text) ? text.replace(/\.$/, '').trim() : null;
}

// A command that cannot fail proves nothing about the plan's work: its literal first word is one
// that always exits 0, or a `|| true` tail swallows whatever the real command returned.
const CANNOT_FAIL = [
  [/^(?:true|:)(?:\s|$)/, 'starts with `true` or `:`, which always exits 0'],
  [/^echo(?:\s|$)/, 'starts with `echo`, which always exits 0'],
  [/^exit\s+0(?:\s|$)/, '`exit 0` always exits 0'],
  [/\|\|\s*true\s*$/, 'ends with `|| true`, which swallows a failure'],
];

function cannotFail(command) {
  return CANNOT_FAIL.find(([re]) => re.test(command.trim()))?.[1] ?? null;
}

// The `npm` scripts a command names, in the order it names them. `npm test` is the alias for
// `scripts.test`, so it names one too; `-s`/`--prefix` and the rest do not change which script runs.
function npmScripts(command) {
  const found = [...command.matchAll(/\bnpm\s+run(?:-script)?\s+([^\s&|;]+)/g)].map((m) => ({ at: m.index, name: m[1] }));
  for (const m of command.matchAll(/\bnpm\s+(?:test|t)\b/g)) found.push({ at: m.index, name: 'test' });
  return found.sort((a, b) => a.at - b.at).map((x) => x.name);
}

// The paths a command names: a token with a slash or a file extension. Flags, assignments, globs,
// substitutions and URLs name no path in the repo.
function commandPaths(command) {
  return command
    .split(/\s+/)
    .map((t) => t.replace(/^[`'"(]+/, '').replace(/[`'"(),;]+$/, ''))
    .filter((t) => t && !t.startsWith('-') && !t.includes('=') && !/[*?{}<>$]/.test(t) && !/^[a-z]+:\/\//i.test(t))
    .filter((t) => /[\\/]/.test(t) || /\.(?:mjs|cjs|js|json|md|sh|py|ya?ml|toml|txt)$/.test(t));
}

// The repo a plan lives in, found by walking up from the plan file: a plan's verify names paths
// from the root of the tree it ships in, whatever the plan's own directory depth.
function repoRoot(file) {
  const own = path.dirname(path.resolve(file));
  for (let dir = own; ;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return own;
    dir = up;
  }
}

function scriptsOf(root) {
  try {
    return new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts ?? {}));
  } catch {
    return new Set();
  }
}

// What one command is checked against, each note saying what was looked for and what was found.
function probeCommand(command, root) {
  const notes = [];
  const vacuous = cannotFail(command);
  if (vacuous) notes.push({ ok: false, text: vacuous });
  const scripts = npmScripts(command);
  if (scripts.length) {
    const known = scriptsOf(root);
    for (const name of scripts) notes.push(known.has(name) ? { ok: true, text: `npm script "${name}" exists` } : { ok: false, text: `package.json has no "${name}" script` });
  }
  for (const token of commandPaths(command)) {
    notes.push(fs.existsSync(path.resolve(root, token)) ? { ok: true, text: `${token} exists` } : { ok: false, text: `${token} does not exist` });
  }
  return notes;
}

// One probe per runnable verify a lane S plan states, so a plan whose check would throw at build
// time, aim at a file nobody wrote, or prove nothing is refused before approval. Additive: the
// contract's own keys are untouched.
function probeVerifies(file, text) {
  const root = repoRoot(file);
  const probes = [];
  for (const step of stepsOf(text)) {
    const command = verifyCommand(step);
    if (!command) continue;
    const notes = probeCommand(command, root);
    const failed = notes.filter((x) => !x.ok);
    probes.push({ plan: file, step: step.n, command, ok: !failed.length, reason: (failed.length ? failed : notes).map((x) => x.text).join('; ') || 'no npm script or path in it to check' });
  }
  return probes;
}

export function parseContract(text) {
  const files = parseFileList(sectionLines(text, 'Files').join('\n'));
  const interfaces = sectionLines(text, 'Interfaces').map(interfaceOf).filter(Boolean);
  const gaps = [];
  // Every slice changes at least one file, so an empty `## Files` is a plan that forgot it.
  if (!files.length) gaps.push('Files');
  if (!/^##\s+Interfaces\s*$/im.test(text)) gaps.push('Interfaces');
  return { files, interfaces, gaps };
}

// A plan file's contract: the body, never its state block. The probe runs here rather than in
// `parseContract`, so the coordinator's text-only call stays unchanged.
export function readPlan(file) {
  const text = fs.readFileSync(file, 'utf8');
  const body = splitFrontmatter(text)?.body ?? text;
  return { plan: file, ...parseContract(body), probes: probeVerifies(file, body) };
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
  // `b`'s order names the path, as this pre-flight always has.
  const [shared] = sharedPaths(b.files, a.files);
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

// The scope-it analyse pass: one or more plan files in, each one's contract, its gaps and its
// verify probes out. A probe that failed is an error too, so the plan is refused before approval.
function lint(files) {
  const plans = files.map(readPlan);
  const errors = plans.flatMap((p) => [
    ...p.gaps.map((g) => `${p.plan}: no ## ${g} section: a slice that runs in a track states the files and interfaces it changes`),
    ...p.probes.filter((x) => !x.ok).map((x) => `${p.plan}: verify \`${x.command}\`: ${x.reason}`),
  ]);
  return { plans, probes: plans.flatMap((p) => p.probes), errors };
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
