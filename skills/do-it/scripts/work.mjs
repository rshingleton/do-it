#!/usr/bin/env node
// Work-item CLI: the only writer of a plan's state block. Prints JSON.
//
//   work.mjs new <id> --lane s|m --title "<title>"
//   work.mjs show <id> [--brief]   (--brief also on new, list, event, set, verify-phase)
//   work.mjs list
//   work.mjs event <id> <event> [args] [--phase n] [--fingerprint f] [--date d]
//   work.mjs set <id> <key> <json>
//   work.mjs fingerprint <id>
//   work.mjs review-diff <id>
//   work.mjs verify-phase <id> [n] [--in dir] -- <command...>
//   work.mjs roadmap <file>
//   work.mjs run new <slug> [--level --commit --max-slices --slice-cap-min --audit-cap]
//   work.mjs run show <slug> | set <slug> <key> <json> | slice <slug> <id> <status> [--reason --needs]
//   work.mjs run next <slug> <roadmap file>   (slice ready|parked|blocked|shipped; ready un-parks)
//   work.mjs run commit <slug> <id> [--phase n] --paths a,b [--limits <json>]
//   work.mjs close <id>
//
// The rules live in items.mjs and state.mjs (../STATE.md documents them);
// this script parses arguments, gathers the git facts an event needs, and
// prints JSON.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig } from '../../track-it/scripts/config.mjs';
import { isMain } from '../../it-core/scripts/is-main.mjs';
import { EMPTY_TREE, fingerprint, hasObject, snapshot, treeDiff } from './changeset.mjs';
import { needsUser } from './state.mjs';
import { allowedMoves, firableEvents, workItems } from './items.mjs';
import { roadmapSlices } from './roadmap.mjs';
import { commitSlice } from './commit.mjs';
import { createRun, nextSlice, setRun, showRun, sliceRun } from './run.mjs';

// Flags that take no value.
const FLAGS = new Set(['brief']);

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
      opts[k] = FLAGS.has(k) ? true : (v ?? argv[++i]);
    } else pos.push(a);
  }
  return { pos, opts };
}

function context(cwd) {
  const { root, values } = loadConfig({ cwd });
  const planningDir = path.resolve(root, values.DO_IT_PLANNING_DIR);
  return { root, planningDir, config: values, items: workItems({ planningDir }) };
}

function view(ctx, item) {
  return {
    path: path.relative(ctx.root, item.path),
    ...item.state,
    allowed: allowedMoves(item.state.status),
    needs_user: needsUser(item.state),
  };
}

// Status, lane, the next moves and the blocker: what a step reads to resume.
function brief(item) {
  const { id, lane, status, blocker } = item.state;
  return { id, lane, status, allowed: allowedMoves(status), blocker, needs_user: needsUser(item.state) };
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
  const { items } = ctx;
  const shown = (item) => (opts.brief ? brief(item) : view(ctx, item));

  switch (cmd) {
    case 'new':
      return shown(items.create(id, { lane: opts.lane, title: opts.title }));
    case 'show':
      return shown(items.get(id));
    case 'list':
      return items.list().map((i) => (opts.brief ? { id: i.id, lane: i.lane, status: i.status } : { ...i, path: path.relative(ctx.root, i.path) }));
    case 'event': {
      const item = items.get(id);
      const [event, ...args] = rest;
      if (!event) throw new Error(`missing event; allowed from ${item.state.status}: ${firableEvents(item.state.status).join(', ')}`);
      return shown(items.fire(id, event, eventArgs(ctx, item, event, args, opts)));
    }
    case 'set': {
      const [key, value] = rest;
      return shown(items.set(id, key, value === undefined ? undefined : json(value)));
    }
    case 'fingerprint': {
      const item = items.get(id);
      return { id: item.state.id, base_ref: item.state.base_ref, fingerprint: itemFingerprint(ctx, item) };
    }
    case 'review-diff': {
      // What changed since ship-it prepared the commit: the user's review edits.
      // A missing snapshot (an older prepare, or pruned by git gc) is not an
      // error: ship-it asks its one line without the diff.
      const item = items.get(id);
      const { tree, prepared } = item.state.ship ?? {};
      if (!tree || !hasObject(ctx.root, tree)) {
        return { id: item.state.id, prepared, files: null, note: 'no snapshot from the prepare; compare with git status instead' };
      }
      const now = snapshot(ctx.root, { exclude: planningExclude(ctx) });
      return { id: item.state.id, prepared, ...treeDiff(ctx.root, tree, now) };
    }
    case 'verify-phase': {
      // The checks' output goes to stderr so stdout stays JSON. --in runs
      // them elsewhere (build-it's integration worktree); the plan is still
      // this checkout's.
      const command = opts['--'] ?? [];
      if (!command.length) throw new Error('verify-phase needs the checks after --: verify-phase <id> [n] -- npm test');
      const where = opts.in === undefined ? ctx.root : path.resolve(cwd, opts.in);
      if (!fs.existsSync(where)) throw new Error(`verify-phase: --in ${where} does not exist; nothing recorded`);
      const phase = rest[0] ?? opts.phase;
      // Always through the shell: a quoted chain runs whole under the gate,
      // and npm resolves to npm.cmd on Windows. Separate arguments are
      // quoted back, so `-- sh -c "exit 3"` still fails.
      const text = command.length === 1 ? command[0] : command.map(shellQuote).join(' ');
      const check = () => {
        const r = spawnSync(text, { cwd: where, shell: true, stdio: ['ignore', 2, 2] });
        if (r.error) return { ok: false, why: `${text}: ${r.error.message}` };
        if (r.status !== 0) return { ok: false, why: `${text} exited ${r.status ?? r.signal}` };
        return { ok: true, text };
      };
      return shown(items.verifyPhase(id, phase === undefined ? undefined : Number(phase), check, { date: opts.date }));
    }
    case 'roadmap': {
      if (!id) throw new Error('roadmap needs a roadmap file');
      const file = path.resolve(cwd, id);
      return { file: path.relative(ctx.root, file), ...roadmapSlices(file, ctx) };
    }
    case 'run': {
      // A complete run's record: id is the subcommand here, rest[0] the roadmap slug.
      const [slug, ...args] = rest;
      switch (id) {
        case 'new':
          return createRun(ctx.planningDir, slug, opts, ctx.config);
        case 'show':
          return showRun(ctx.planningDir, slug);
        case 'set':
          return setRun(ctx.planningDir, slug, args[0], args[1] === undefined ? undefined : json(args[1]));
        case 'slice':
          return sliceRun(ctx.planningDir, slug, args[0], args[1], { reason: opts.reason, needs: opts.needs });
        case 'next': {
          if (!args[0]) throw new Error('run next needs a roadmap file');
          const file = path.resolve(cwd, args[0]);
          return nextSlice(roadmapSlices(file, ctx), showRun(ctx.planningDir, slug));
        }
        case 'commit': {
          if (!args[0]) throw new Error('run commit needs a work id');
          const limits = opts.limits === undefined ? [] : json(opts.limits);
          return commitSlice({
            ...ctx, slug, id: args[0], phase: opts.phase === undefined ? undefined : Number(opts.phase),
            paths: String(opts.paths ?? '').split(',').filter(Boolean), limits,
          });
        }
        default:
          throw new Error('usage: work.mjs run new|show|set|slice|next|commit <slug> ...');
      }
    }
    case 'close': {
      const item = items.close(id);
      const s = item.state;
      return { closed: s.id, removed: path.relative(ctx.root, item.path), todo: s.todo, roadmap: s.roadmap, tracker: s.tracker, sources: s.sources };
    }
    default:
      throw new Error('usage: work.mjs new|show|list|event|set|fingerprint|review-diff|verify-phase|roadmap|run|close ...');
  }
}

if (isMain(import.meta.url)) {
  run(process.argv.slice(2))
    .then((out) => process.stdout.write(`${JSON.stringify(out, null, 2)}\n`))
    .catch((e) => {
      process.stdout.write(`${JSON.stringify({ error: e.message })}\n`);
      process.exit(1);
    });
}
