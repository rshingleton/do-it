// Work items: every move a plan may make, on the plan files under one
// planning directory. The status rules are transition() in state.mjs; this
// module adds the rest of ../STATE.md: where each lane's plan lives, what
// `set` may change, raising a lane, recording a phase only after its checks
// pass, and close. work.mjs is the CLI over it.
//
// Each write re-reads the plan first and goes through a temp file and a
// rename, so a session's change is not overwritten by a copy another session
// read earlier, and a failed write leaves the old plan whole.
// shortcut: no lock, so two sessions writing in the same moment can still race; add a lock file if parallel builds lose events.

import fs from 'node:fs';
import path from 'node:path';
import { allowedEvents, emptyBlock, normalize, transition } from './state.mjs';
import { readItem, writeItem } from './block.mjs';

const SETTABLE = ['title', 'lane', 'tracker', 'sources', 'roadmap', 'todo', 'blocked_by', 'phases', 'assumptions', 'defects'];
const LANE_RANK = { s: 1, m: 2 };

// Lane S is one file; lane M is a directory, phases beside the README.
function layout(planningDir, id, lane) {
  return lane === 'm' ? path.join(planningDir, id, 'README.md') : path.join(planningDir, `${id}.md`);
}

// The directory first: after an interrupted lane move it holds the newer plan.
export function planPath(planningDir, id) {
  return [layout(planningDir, id, 'm'), layout(planningDir, id, 's')].find((f) => fs.existsSync(f)) ?? null;
}

export function listItems(planningDir) {
  let entries;
  try {
    entries = fs.readdirSync(planningDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const file = e.isDirectory()
      ? path.join(planningDir, e.name, 'README.md')
      : e.name.endsWith('.md') ? path.join(planningDir, e.name) : null;
    if (!file || !fs.existsSync(file)) continue;
    try {
      const { state } = readItem(file);
      out.push({ id: state.id, title: state.title, lane: state.lane, status: state.status, roadmap: state.roadmap, path: file });
    } catch (err) {
      out.push({ id: e.name.replace(/\.md$/, ''), status: 'unreadable', error: err.message, path: file });
    }
  }
  return out;
}

// The events fire() takes from a status: every legal one but phase-done,
// which only verifyPhase records.
export function firableEvents(status) {
  return allowedEvents(status).filter((e) => e !== 'phase-done');
}

// What may happen next from a status: those events, plus close.
export function allowedMoves(status) {
  const events = firableEvents(status);
  return status === 'shipping' ? [...events, 'close'] : events;
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

// `write` replaces writeItem in tests.
export function workItems({ planningDir, write = writeItem }) {
  function get(id) {
    if (!id) throw new Error('missing work id');
    const file = planPath(planningDir, id);
    if (!file) throw new Error(`no plan for ${id} under ${path.relative(process.cwd(), planningDir) || '.'}`);
    return readItem(file);
  }

  function update(id, change) {
    const item = get(id);
    item.state = change(item.state);
    write(item);
    return item;
  }

  return {
    get,
    list: () => listItems(planningDir),

    create(id, { lane, title } = {}) {
      lane = String(lane ?? '').toLowerCase();
      if (!LANE_RANK[lane]) throw new Error('new needs --lane s or --lane m');
      if (!id || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(id)) throw new Error('new needs an id (kebab-case slug or tracker ref)');
      if (planPath(planningDir, id)) throw new Error(`${id} already has a plan`);
      title ??= id;
      const item = { path: layout(planningDir, id, lane), state: emptyBlock({ id, title, lane }), body: `\n# ${title}\n` };
      fs.mkdirSync(path.dirname(item.path), { recursive: true });
      write(item);
      return item;
    },

    fire(id, event, args) {
      if (event === 'phase-done') {
        throw new Error('phase-done is recorded by verify-phase, which runs the checks: work.mjs verify-phase <id> [n] -- <checks>');
      }
      return update(id, (state) => {
        // Refused here rather than by transition(), whose message would offer phase-done.
        const events = firableEvents(state.status);
        if (!events.includes(event)) throw new Error(`${event} is not allowed from ${state.status}; allowed: ${events.join(', ') || 'none'}`);
        return transition(state, event, args);
      });
    },

    set(id, key, value) {
      if (!SETTABLE.includes(key)) throw new Error(`set takes one of: ${SETTABLE.join(', ')} (status changes go through event)`);
      if (value === undefined) throw new Error(`set ${key} needs a value`);
      // An empty string or null would normalize to [] and wipe the field; clearing is an explicit [].
      if (key !== 'title' && key !== 'lane' && (value === null || (typeof value === 'string' && !value.trim()))) {
        throw new Error(`set ${key} got an empty value; pass [] to clear it`);
      }
      if (key !== 'lane') {
        return update(id, (state) => normalize({ ...state, [key]: key === 'phases' ? mergePhases(state.phases || [], value) : value }));
      }
      const item = get(id);
      const lane = String(value).toLowerCase();
      if (!LANE_RANK[lane]) throw new Error('lane is s or m (lane L is a roadmap, XS has no plan)');
      if (LANE_RANK[lane] < LANE_RANK[item.state.lane]) throw new Error('a lane is raised, never lowered');
      const raw = { ...item.state, lane };
      const from = item.path;
      if (lane === 'm' && item.state.lane === 's') {
        // The new plan is written before the old one goes, so a failed move
        // leaves the lane S plan as it was.
        delete raw.verified;
        item.path = layout(planningDir, id, 'm');
        fs.mkdirSync(path.dirname(item.path), { recursive: true });
      }
      item.state = normalize(raw);
      write(item);
      if (item.path !== from) fs.rmSync(from);
      return item;
    },

    // Records a phase (lane S: the item) as verified only when run() reports
    // its checks passed: { ok, text } with text the command as run, or
    // { ok: false, why }. The plan is read again after the run, so events
    // fired while the checks ran are kept.
    // A dry run of the record comes first, so no check runs for a move that
    // could not be recorded (wrong status, unknown or blocked phase).
    verifyPhase(id, n, run, { date } = {}) {
      const state = get(id).state;
      if (state.lane === 'm' && !Number.isInteger(n)) throw new Error('lane M: verify-phase needs a phase number');
      transition(state, 'phase-done', { n, verified: 'dry run', date });
      const r = run();
      if (!r.ok) throw new Error(`verify-phase: ${r.why}; nothing recorded`);
      return update(id, (now) => transition(now, 'phase-done', { n, verified: `${r.text}: pass`, date }));
    },

    close(id) {
      const item = get(id);
      if (item.state.status !== 'shipping') throw new Error(`close needs status shipping; ${id} is ${item.state.status}`);
      if (item.path === layout(planningDir, id, 'm')) fs.rmSync(path.dirname(item.path), { recursive: true });
      else fs.rmSync(item.path);
      return item;
    },
  };
}
