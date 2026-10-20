#!/usr/bin/env node
// Work-item CLI: the only writer of a plan's state block. Prints JSON.
//
//   work.mjs new <id> --lane s|m --title "<title>"
//   work.mjs show <id>
//   work.mjs list
//   work.mjs event <id> <event> [args] [--phase n] [--fingerprint f] [--date d]
//   work.mjs set <id> <key> <json>
//   work.mjs fingerprint <id>
//   work.mjs review-diff <id>
//   work.mjs verify-phase <id> [n] -- <command...>
//   work.mjs roadmap <file>
//   work.mjs close <id>
//
// Events and the statuses they fire from are in state.mjs; ../STATE.md
// documents them.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../track-it/scripts/config.mjs';
import { EMPTY_TREE, fingerprint, hasObject, snapshot, treeDiff } from './changeset.mjs';
import {
  allowedEvents,
  emptyBlock,
  listItems,
  needsUser,
  normalize,
  planPath,
  readItem,
  roadmapSlices,
  transition,
  writeItem,
} from './state.mjs';

const SETTABLE = ['title', 'lane', 'tracker', 'sources', 'roadmap', 'todo', 'blocked_by', 'phases', 'assumptions'];

function parseArgs(argv) {
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      opts['--'] = argv.slice(i + 1);
      break;
    }
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split(/=(.*)/s);
      opts[k] = v ?? argv[++i];
    } else pos.push(a);
  }
  return { pos, opts };
}

function context(cwd) {
  const { root, values } = loadConfig({ cwd });
  return { root, planningDir: path.resolve(root, values.DO_IT_PLANNING_DIR) };
}

function load(ctx, id) {
  if (!id) throw new Error('missing work id');
  const file = planPath(ctx.planningDir, id);
  if (!file) throw new Error(`no plan for ${id} under ${path.relative(ctx.root, ctx.planningDir) || '.'}`);
  return readItem(file);
}

function view(ctx, item) {
  return {
    path: path.relative(ctx.root, item.path),
    ...item.state,
    allowed: allowedEvents(item.state.status),
    needs_user: needsUser(item.state),
  };
}

function head(root) {
  const r = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : EMPTY_TREE;
}

// Hash of the change since the item's base, planning files excluded.
function planningExclude(ctx) {
  const rel = path.relative(ctx.root, ctx.planningDir).split(path.sep).join('/');
  return rel ? [rel] : [];
}

function itemFingerprint(ctx, item) {
  if (!item.state.base_ref) throw new Error(`${item.state.id} has no base_ref yet: run event start first`);
  return fingerprint(ctx.root, item.state.base_ref, { exclude: planningExclude(ctx) });
}

// The plan owns a phase's title and blocks; progress is only ever recorded
// by events, so a re-plan keeps it and input cannot claim it.
function mergePhases(current, next) {
  if (!Array.isArray(next)) throw new Error('phases is a JSON list: [{"n":1,"title":"...","blocked_by":[]}]');
  const byN = new Map(current.map((p) => [p.n, p]));
  return next.map((p) => {
    const owned = ['status', 'verified', 'blocker'].filter((k) => k in p);
    if (owned.length) throw new Error(`phases: ${owned.join(', ')} are recorded by events, not set`);
    const old = byN.get(Number(p.n));
    return { ...p, status: old?.status ?? 'ready', verified: old?.verified ?? null, ...(old?.blocker ? { blocker: old.blocker } : {}) };
  });
}

function shellQuote(arg) {
  if (/^[\w@%+=:,./-]+$/.test(arg)) return arg;
  if (process.platform === 'win32') return `"${arg.replace(/"/g, '""')}"`;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

function json(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function eventArgs(ctx, item, event, rest, opts) {
  const a = { date: opts.date, fingerprint: opts.fingerprint };
  if (opts.phase !== undefined) a.n = Number(opts.phase);
  switch (event) {
    case 'start':
      a.head = head(ctx.root);
      break;
    case 'phase-done':
      if (item.lane === 'm' && a.n === undefined) a.n = Number(rest.shift());
      a.verified = rest.join(' ');
      break;
    case 'block':
      a.why = rest.join(' ');
      break;
    case 'audit-pass':
      a.fingerprint ??= rest[0] ?? itemFingerprint(ctx, item);
      break;
    case 'ship-prepared':
      a.fingerprint ??= rest[0] ?? itemFingerprint(ctx, item);
      a.tree = snapshot(ctx.root, { exclude: planningExclude(ctx) });
      break;
    case 'audit-fail':
      a.must = rest.map((m) => (/^\d+$/.test(m) ? Number(m) : m));
      break;
    case 'reject-assumption':
      a.n = Number(rest.shift());
      a.text = rest.join(' ');
      break;
    default:
  }
  return a;
}

export async function run(argv, { cwd = process.cwd() } = {}) {
  const { pos, opts } = parseArgs(argv);
  const [cmd, id, ...rest] = pos;
  const ctx = context(cwd);

  switch (cmd) {
    case 'new': {
      const lane = String(opts.lane ?? '').toLowerCase();
      if (!['s', 'm'].includes(lane)) throw new Error('new needs --lane s or --lane m');
      if (!id || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(id)) throw new Error('new needs an id (kebab-case slug or tracker ref)');
      if (planPath(ctx.planningDir, id)) throw new Error(`${id} already has a plan`);
      const title = opts.title ?? id;
      const file = lane === 'm' ? path.join(ctx.planningDir, id, 'README.md') : path.join(ctx.planningDir, `${id}.md`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const item = { path: file, lane, state: emptyBlock({ id, title, lane }), body: `\n# ${title}\n` };
      writeItem(item);
      return view(ctx, item);
    }
    case 'show':
      return view(ctx, load(ctx, id));
    case 'list':
      return listItems(ctx.planningDir).map((i) => ({ ...i, path: path.relative(ctx.root, i.path) }));
    case 'event': {
      const item = load(ctx, id);
      const [event, ...args] = rest;
      if (!event) throw new Error(`missing event; allowed from ${item.state.status}: ${allowedEvents(item.state.status).join(', ')}`);
      item.state = transition(item.state, event, eventArgs(ctx, item, event, args, opts));
      writeItem(item);
      return view(ctx, item);
    }
    case 'set': {
      const item = load(ctx, id);
      const [key, value] = rest;
      if (!SETTABLE.includes(key)) throw new Error(`set takes one of: ${SETTABLE.join(', ')} (status changes go through event)`);
      if (value === undefined) throw new Error(`set ${key} needs a value`);
      const raw = { ...item.state, [key]: json(value) };
      if (key === 'phases') raw.phases = mergePhases(item.state.phases || [], raw.phases);
      if (key === 'lane') {
        raw.lane = String(raw.lane).toLowerCase();
        const rank = { s: 1, m: 2 };
        if (!rank[raw.lane]) throw new Error('lane is s or m (lane L is a roadmap, XS has no plan)');
        if (rank[raw.lane] < rank[item.lane]) throw new Error('a lane is raised, never lowered');
        if (raw.lane === 'm' && item.lane === 's') {
          // Lane M lives in a directory, phases beside the README.
          const file = path.join(ctx.planningDir, item.state.id, 'README.md');
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.renameSync(item.path, file);
          item.path = file;
          delete raw.verified;
        }
      }
      item.state = normalize(raw);
      writeItem(item);
      return view(ctx, item);
    }
    case 'fingerprint': {
      const item = load(ctx, id);
      return { id: item.state.id, base_ref: item.state.base_ref, fingerprint: itemFingerprint(ctx, item) };
    }
    case 'review-diff': {
      // What changed since ship-it prepared the commit: the user's review edits.
      // A missing snapshot (an older prepare, or pruned by git gc) is not an
      // error: ship-it asks its one line without the diff.
      const item = load(ctx, id);
      const { tree, prepared } = item.state.ship ?? {};
      if (!tree || !hasObject(ctx.root, tree)) {
        return { id: item.state.id, prepared, files: null, note: 'no snapshot from the prepare; compare with git status instead' };
      }
      const now = snapshot(ctx.root, { exclude: planningExclude(ctx) });
      return { id: item.state.id, prepared, ...treeDiff(ctx.root, tree, now) };
    }
    case 'verify-phase': {
      // Records a phase as verified only when its checks exit 0; the
      // command's output goes to stderr so stdout stays JSON.
      const item = load(ctx, id);
      const command = opts['--'] ?? [];
      if (!command.length) throw new Error('verify-phase needs the checks after --: verify-phase <id> [n] -- npm test');
      const n = item.lane === 'm' ? Number(rest[0] ?? opts.phase) : undefined;
      if (item.lane === 'm' && !Number.isInteger(n)) throw new Error('lane M: verify-phase needs a phase number');
      // Always through the shell: a quoted chain runs whole under the gate,
      // and npm resolves to npm.cmd on Windows. Separate arguments are
      // quoted back, so `-- sh -c "exit 3"` still fails.
      const text = command.length === 1 ? command[0] : command.map(shellQuote).join(' ');
      const r = spawnSync(text, { cwd: ctx.root, shell: true, stdio: ['ignore', 2, 2] });
      if (r.error) throw new Error(`verify-phase: ${text}: ${r.error.message}; nothing recorded`);
      if (r.status !== 0) throw new Error(`verify-phase: ${text} exited ${r.status ?? r.signal}; nothing recorded`);
      item.state = transition(item.state, 'phase-done', { n, verified: `${text}: pass`, date: opts.date });
      writeItem(item);
      return view(ctx, item);
    }
    case 'roadmap': {
      if (!id) throw new Error('roadmap needs a roadmap file');
      const file = path.resolve(cwd, id);
      return { file: path.relative(ctx.root, file), ...roadmapSlices(file, ctx) };
    }
    case 'close': {
      const item = load(ctx, id);
      if (item.state.status !== 'shipping') throw new Error(`close needs status shipping; ${id} is ${item.state.status}`);
      const s = item.state;
      if (item.lane === 'm' && path.basename(item.path) === 'README.md') fs.rmSync(path.dirname(item.path), { recursive: true });
      else fs.rmSync(item.path);
      return { closed: s.id, removed: path.relative(ctx.root, item.path), todo: s.todo, roadmap: s.roadmap, tracker: s.tracker, sources: s.sources };
    }
    default:
      throw new Error('usage: work.mjs new|show|list|event|set|fingerprint|review-diff|verify-phase|roadmap|close ...');
  }
}

function isMain() {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  run(process.argv.slice(2))
    .then((out) => process.stdout.write(`${JSON.stringify(out, null, 2)}\n`))
    .catch((e) => {
      process.stdout.write(`${JSON.stringify({ error: e.message })}\n`);
      process.exit(1);
    });
}
