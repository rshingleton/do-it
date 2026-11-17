// Token usage from OpenCode events, written into the same per-run ledger the
// Claude Code hooks keep (ledger.mjs). Host-neutral in the same way: callers
// hand over event payloads; nothing here reads the environment except usageDir().
//
// One run per OpenCode session (a subagent has its own session id), summed over
// its completed assistant messages, each counted once. Tokens only: the events'
// `cost` is ignored. Reasoning tokens fold into `out`.
//   v1: event({type: 'session.created' | 'message.updated', properties: {info}})
//   v2: context({sessionID, agent, model}) from the context hook, then
//       event({type: 'session.step.started' | 'session.step.ended', ...})
// A step start seeds the run's agent and model (a row still needs its tokens). A message that carries no
// time keeps the run out of the buckets and marks it partial: a window counts it whole, once.
// Every entry point fails open: a missing or malformed field records nothing.

import path from 'node:path';
import { addToBucket, keepDays, prune, record, rollupKeepDays, usageDir } from './ledger.mjs';

const num = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
const iso = (ms) => new Date(Number.isFinite(ms) ? ms : Date.now()).toISOString();
const modelName = (m) => (typeof m === 'string' ? m : (m?.modelID ?? m?.id ?? null));

// shortcut: at most MAX_RUNS runs stay in memory, least recently touched out first, so a long-lived server stays bounded; an evicted session that speaks again restarts its totals. Upgrade to seeding from the existing row if that matters.
const MAX_RUNS = 256;

// `prune` and `now` are test seams.
export function createOpenCodeUsage({ dir = usageDir(), cwd = process.cwd(), prune: pruneFn = prune, now = () => new Date() } = {}) {
  const project = path.basename(cwd);
  const runs = new Map(); // session id -> { parent, agent, hasAgent, model, messages, first, last, day }
  let prunedDay = null;

  const run = (id) => {
    const r = runs.get(id) ?? { parent: null, agent: null, hasAgent: false, model: null, messages: new Map(), first: null, last: null, day: null };
    runs.delete(id);
    runs.set(id, r); // most recently touched last
    if (runs.size > MAX_RUNS) runs.delete(runs.keys().next().value);
    return r;
  };

  function write(id, r) {
    let in_ = 0;
    let out = 0;
    let cr = 0;
    let cc = 0;
    let ctx0 = null;
    let peak = 0;
    const buckets = {};
    let timed = true;
    for (const m of r.messages.values()) {
      in_ += m.in;
      out += m.out;
      cr += m.cr;
      cc += m.cc;
      addToBucket(buckets, m.t, [m.in, m.out, m.cr, m.cc]);
      if (!Number.isFinite(m.t)) timed = false;
      const ctx = m.in + m.cr + m.cc;
      ctx0 ??= ctx;
      peak = Math.max(peak, ctx);
    }
    const subagent = Boolean(r.parent);
    const start = iso(r.first); // with no message time this is the clock, so the row still has a day to sit under
    r.day ??= start.slice(0, 10); // fixed at the first write: a late earlier stamp must not move the row's day
    // shortcut: totals live in plugin memory, so a restart mid-session restarts that run's totals; upgrade to seeding from the existing row if it matters
    // shortcut: v2 events carry no parent link, so every v2 run is kind session under its context-hook agent name; upgrade when the events expose parentID
    const rec = {
      id,
      kind: subagent ? 'subagent' : 'session',
      agent: subagent ? (r.agent ?? 'unknown') : r.hasAgent ? (r.agent ?? 'main') : 'main',
      model: r.model,
      session: id,
      project,
      day: r.day,
      start,
      at: iso(r.last),
      turns: r.messages.size,
      in: in_,
      out,
      cr,
      cc,
      ctx0,
      peak,
    };
    // One message with no time withholds every bucket: a window counting only the bucket turns would drop the
    // rest. The row counts whole by its last message instead, and `partial` says why (as a transcript row does).
    if (timed) rec.buckets = buckets;
    else rec.partial = true;
    record(dir, rec);
    const today = now().toISOString().slice(0, 10);
    if (today !== prunedDay) {
      pruneFn(dir, keepDays(), now(), rollupKeepDays());
      prunedDay = today; // only after prune succeeds, so a throw is retried on the next step
    }
  }

  // One completed assistant message (or step) with its tokens; the same id again replaces it.
  function add(sessionID, messageID, tokens, at, { agent, model } = {}) {
    if (!sessionID || !messageID || !tokens || typeof tokens !== 'object') return null;
    const r = run(sessionID);
    r.agent ??= agent ?? null;
    r.model = modelName(model) ?? r.model;
    const t = Number.isFinite(at) ? at : null; // no time writes none: the row turns partial, it is not stamped with now
    if (t !== null) {
      r.first = Math.min(r.first ?? t, t);
      r.last = Math.max(r.last ?? t, t);
    }
    r.messages.set(messageID, {
      in: num(tokens.input),
      out: num(tokens.output) + num(tokens.reasoning),
      cr: num(tokens.cache?.read),
      cc: num(tokens.cache?.write),
      t,
    });
    write(sessionID, r);
    return r;
  }

  const handlers = {
    'session.created': (p) => {
      const info = p.info ?? p;
      if (info?.id) run(info.id).parent = info.parentID ?? null;
    },
    // v2: the step start names the agent and model the context hook repeats per request; either one seeds the run.
    'session.step.started': (p) => {
      if (!p.sessionID) return;
      const r = run(p.sessionID);
      r.hasAgent = true;
      r.agent ??= p.agent ?? null;
      r.model ??= modelName(p.model);
    },
    'message.updated': (p) => {
      const info = p.info ?? p;
      if (info?.role !== 'assistant' || !info.time?.completed) return;
      add(info.sessionID, info.id, info.tokens, info.time.completed, { agent: info.agent, model: info.modelID });
    },
    'session.step.ended': (p, ev) => {
      const known = runs.get(p.sessionID);
      add(p.sessionID, p.assistantMessageID, p.tokens, p.time ?? p.at ?? ev?.created, { agent: known?.agent, model: known?.model });
    },
  };

  return {
    // The v2 context hook's {sessionID, agent, model}: a step start carries them too, this repeats them.
    context(event) {
      try {
        if (!event?.sessionID) return;
        const r = run(event.sessionID);
        r.hasAgent = true;
        r.agent = event.agent ?? r.agent;
        r.model = modelName(event.model) ?? r.model;
      } catch {}
    },
    event(ev) {
      try {
        // v1 nests the payload in `properties`, v2 in `data` beside the envelope's `created`.
        const p = ev?.properties ?? ev?.data ?? ev ?? {};
        handlers[ev?.type]?.(p, ev);
      } catch {}
    },
  };
}
