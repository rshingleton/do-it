// A work item's state block: its shape and the moves it may make.
//
// Every status change goes through transition(), so the rules in
// ../STATE.md live in one place. Reading and writing the block is block.mjs.

// ---------------------------------------------------------------------------
// Shape

const STATUSES = ['draft', 'planned', 'building', 'blocked', 'auditing', 'shipping'];
const PHASE_STATUSES = ['ready', 'done', 'blocked'];

export function emptyBlock({ id, title, lane }) {
  const block = {
    id,
    title,
    lane,
    status: 'draft',
    tracker: null,
    sources: [],
    roadmap: null,
    todo: [],
    base_ref: null,
    approvals: { plan: null },
  };
  if (lane === 'm') block.phases = [];
  else block.verified = null;
  Object.assign(block, {
    assumptions: [],
    fix: [],
    defects: [],
    audit: { verdict: null, round: 0, must: [], fingerprint: null, at: null },
    ship: { prepared: null, fingerprint: null },
    blocker: null,
  });
  return block;
}

function phaseShape(p) {
  return {
    n: Number(p.n),
    title: p.title ?? '',
    blocked_by: (p.blocked_by ?? []).map(Number),
    status: p.status ?? 'ready',
    verified: p.verified ?? null,
    ...(p.blocker ? { blocker: p.blocker } : {}),
  };
}

function asList(v) {
  if (v === null || v === undefined || v === '') return [];
  return Array.isArray(v) ? v : [v];
}

// Fill missing fields and coerce the ones older plans wrote differently
// (todo as a scalar, a numeric-looking base_ref), keeping unknown keys.
export function normalize(raw) {
  const lane = String(raw.lane ?? 's').toLowerCase();
  const base = emptyBlock({ id: raw.id, title: raw.title, lane });
  const out = { ...base, ...raw, lane };
  out.todo = asList(raw.todo).map(String);
  out.sources = asList(raw.sources);
  out.assumptions = asList(raw.assumptions);
  out.fix = asList(raw.fix);
  out.defects = asList(raw.defects);
  if (out.base_ref !== null && out.base_ref !== undefined) out.base_ref = String(out.base_ref);
  out.approvals = { ...base.approvals, ...(raw.approvals || {}) };
  if (out.approvals.plan !== null) out.approvals.plan = String(out.approvals.plan);
  out.audit = { ...base.audit, ...(raw.audit || {}) };
  out.audit.must = asList(out.audit.must);
  out.ship = { ...base.ship, ...(raw.ship || {}) };
  if (lane === 'm') out.phases = asList(raw.phases).map(phaseShape);
  return out;
}

// ---------------------------------------------------------------------------
// Transitions

function phase(state, n) {
  const p = (state.phases || []).find((x) => x.n === Number(n));
  if (!p) throw new Error(`no phase ${n} in ${state.id}`);
  return p;
}

const fixMode = (s) => s.audit.verdict === 'FAIL' || s.fix.length > 0;

// Each event: the statuses it may fire from, and what it does. `apply`
// mutates a copy and returns the new status (or undefined to keep it).
const EVENTS = {
  approve: {
    from: ['draft'],
    apply: (s, a) => {
      s.approvals.plan = a.date;
      return 'planned';
    },
  },
  start: {
    from: ['planned', 'building'],
    apply: (s, a) => {
      if (!s.base_ref) {
        if (!a.head) throw new Error('start needs the current HEAD');
        s.base_ref = a.head;
      }
      return 'building';
    },
  },
  'phase-done': {
    from: ['building'],
    apply: (s, a) => {
      if (!a.verified) throw new Error('phase-done needs the commands that passed (verified)');
      // Fix mode rebuilds no phase; the record that the fix passed its checks
      // is kept apart, since the old phase records predate the fix. It says a
      // verify ran since the fix began, not that the code is unchanged since.
      if (fixMode(s)) s.fix_verified = a.verified;
      if (s.lane !== 'm') {
        s.verified = a.verified;
        return undefined;
      }
      if (a.n === undefined) throw new Error('lane M: phase-done needs a phase number');
      const p = phase(s, a.n);
      const open = p.blocked_by.filter((b) => phase(s, b).status !== 'done');
      if (open.length) throw new Error(`phase ${p.n} is blocked by phase(s) ${open.join(', ')}, not done`);
      p.status = 'done';
      p.verified = a.verified;
      delete p.blocker;
      return undefined;
    },
  },
  block: {
    from: ['planned', 'building', 'auditing', 'shipping'],
    apply: (s, a) => {
      if (!a.why) throw new Error('block needs a one-line reason');
      if (a.n !== undefined) {
        const p = phase(s, a.n);
        p.status = 'blocked';
        p.blocker = a.why;
        return undefined;
      }
      s.blocker = a.why;
      return 'blocked';
    },
  },
  unblock: {
    from: ['blocked', 'building'],
    apply: (s, a) => {
      if (a.n !== undefined) {
        const p = phase(s, a.n);
        if (p.status !== 'blocked') throw new Error(`phase ${p.n} is not blocked`);
        p.status = 'ready';
        delete p.blocker;
        return undefined;
      }
      if (s.status !== 'blocked') throw new Error(`${s.id} is not blocked`);
      s.blocker = null;
      return 'building';
    },
  },
  'build-done': {
    from: ['building'],
    apply: (s) => {
      if (fixMode(s)) {
        if (!s.fix_verified) throw new Error('no verified record since the fix began: run verify-phase first');
        delete s.fix_verified;
        s.fix = [];
        return 'auditing';
      }
      if (s.lane === 'm') {
        if (!s.phases.length) throw new Error('lane M has no phases: set phases first');
        const left = s.phases.filter((p) => p.status !== 'done').map((p) => p.n);
        if (left.length) throw new Error(`phase(s) ${left.join(', ')} not done`);
      } else if (!s.verified) throw new Error('no verified record: run verify-phase first');
      return 'auditing';
    },
  },
  'audit-pass': {
    from: ['auditing'],
    apply: (s, a) => {
      if (!a.fingerprint) throw new Error('audit-pass needs the fingerprint');
      // round counts consecutive failed audits.
      Object.assign(s.audit, { verdict: 'PASS', round: 0, must: [], fingerprint: a.fingerprint, at: a.date });
      return 'shipping';
    },
  },
  'audit-fail': {
    from: ['auditing'],
    apply: (s, a) => {
      if (!a.must?.length) throw new Error('audit-fail needs at least one Must finding');
      Object.assign(s.audit, {
        verdict: 'FAIL',
        round: (s.audit.round || 0) + 1,
        must: a.must,
        fingerprint: a.fingerprint ?? null,
        at: a.date,
      });
      delete s.fix_verified;
      // The third failed round in a row waits for the user; unblock is their answer.
      if (s.audit.round >= 3) {
        s.blocker = `audit failed ${s.audit.round} times in a row: fix, accept with a recorded decision, or re-plan`;
        return 'blocked';
      }
      return 'building';
    },
  },
  replan: {
    from: ['planned', 'building', 'blocked', 'auditing', 'shipping'],
    apply: (s) => {
      // Back to scope-it: the plan needs approving again; work done so far
      // stays, but the new plan is built and audited afresh, not in fix mode.
      s.approvals.plan = null;
      s.blocker = null;
      s.fix = [];
      delete s.fix_verified;
      s.audit = { verdict: null, round: 0, must: [], fingerprint: null, at: null };
      s.ship = { prepared: null, fingerprint: null };
      return 'draft';
    },
  },
  'ship-prepared': {
    from: ['shipping'],
    apply: (s, a) => {
      if (!a.fingerprint) throw new Error('ship-prepared needs the fingerprint');
      s.ship = { prepared: a.date, fingerprint: a.fingerprint, tree: a.tree ?? null };
      return undefined;
    },
  },
  reaudit: {
    from: ['shipping'],
    apply: (s) => {
      // The review changed code the user wants checked again.
      s.ship = { prepared: null, fingerprint: null };
      return 'auditing';
    },
  },
  'reject-assumption': {
    from: ['auditing', 'shipping'],
    apply: (s, a) => {
      const i = Number(a.n) - 1;
      if (!Number.isInteger(i) || !s.assumptions[i]) {
        throw new Error(`reject-assumption needs an assumption number (1-${s.assumptions.length}) and what replaces it`);
      }
      if (!a.text) throw new Error('reject-assumption needs what replaces the assumption');
      const [old] = s.assumptions.splice(i, 1);
      delete s.fix_verified;
      s.fix.push(`Rejected assumption: ${old}. Instead: ${a.text}`);
      s.ship = { prepared: null, fingerprint: null };
      return 'building';
    },
  },
};

const EVENT_NAMES = Object.keys(EVENTS);

export function allowedEvents(status) {
  return EVENT_NAMES.filter((e) => EVENTS[e].from.includes(status));
}

// Returns a new state; never mutates the input. Throws on an illegal move,
// naming the events the current status allows.
export function transition(state, event, args = {}) {
  const def = EVENTS[event];
  if (!def) throw new Error(`unknown event ${event}; events: ${EVENT_NAMES.join(', ')}`);
  if (!STATUSES.includes(state.status)) throw new Error(`${state.id}: unknown status ${state.status}`);
  if (!def.from.includes(state.status)) {
    throw new Error(`${event} is not allowed from ${state.status}; allowed: ${allowedEvents(state.status).join(', ') || 'none'}`);
  }
  const next = structuredClone(state);
  const to = def.apply(next, { ...args, date: args.date || today() });
  if (to) next.status = to;
  for (const p of next.phases || []) {
    if (!PHASE_STATUSES.includes(p.status)) throw new Error(`phase ${p.n}: unknown status ${p.status}`);
  }
  return next;
}

// Blocked items wait for the user, including after a third failed audit.
export function needsUser(state) {
  return state.status === 'blocked';
}

export function today(now = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${z(now.getMonth() + 1)}-${z(now.getDate())}`;
}
