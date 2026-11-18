// The `work.mjs run <sub>` handlers that act on a run: each reads the run record and the
// work item, and calls the rule or the record writer. The rules and counters live in
// gate.mjs, the record in run.mjs, the commit in commit.mjs. work.mjs is the only caller.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { snapshot, treeDiff } from './changeset.mjs';
import { dirtyHashes, relative } from './commit.mjs';
import { parseContract, pairTracks } from './contract.mjs';
import { auditRoom, checkWithRerun, gate, recordMerged, recordSeen, recordVerified, recordVerifyFailure, recordWaited, VERIFY_CAP_ROUNDS } from './gate.mjs';
import { git } from './git.mjs';
import { checkShell } from './check-shell.mjs';
import { lockChecks } from './check-slot.mjs';
import { readyOrder } from './roadmap.mjs';
import { rejectAssumption, requireTrackBranch, showRun, sliceRun, nextSlice, trackWidth } from './run.mjs';
import { splitKey } from './ids.mjs';

// A path a track reads uses / on every platform, as the record's paths do.
const posix = (p) => p.split(path.sep).join('/');

// The real path of a directory, or its resolved name when it cannot be read.
const real = (p) => {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
};

// The tree a verify ran in, from the coordinator: `.` when the two names are one directory.
// macOS gives `/var` and `/private/var` for the same tree, and Windows gives `RUNNER~1` and
// `runneradmin`, so a string compare would call the coordinator's own checkout a track.
const verifiedRoot = (root, top) => {
  const [a, b] = [real(root), real(top)];
  return a === b ? '.' : posix(path.relative(a, b)) || '.';
};

// `run gate`: the slice's gate result against the fingerprint of its work item in the tree the
// verify recorded, and against the merged tree once a merged check is a fact of the record. A
// verify taken in a track's worktree is compared there, not in the coordinator's checkout. The
// fingerprint leaves out the files its plan says another slice owns, so a concurrent slice's work
// in the same tree never reads as this slice's change.
export function runGate({ planningDir, root, slug, id, items, fingerprintOf }) {
  const record = showRun(planningDir, slug);
  const g = (record.gates ?? []).find((x) => x.id === id);
  const item = g?.work ? items.get(g.work) : null;
  const elsewhere = g?.verified_root !== undefined && g.verified_root !== '.';
  const at = elsewhere ? path.resolve(root, g.verified_root) : undefined;
  let current = null;
  if (item) {
    try {
      current = fingerprintOf(item, at, foreignPaths(record, id, items));
    } catch (e) {
      throw new Error(`run gate: ${id}'s verified root ${g.verified_root} cannot be read (${e.message}); run verify again`);
    }
  }
  // A second fingerprint only when a merged check is recorded: a run that never merged pays nothing.
  const merged = item && g?.merged_fingerprint ? fingerprintOf(item) : undefined;
  return gate(record, id, { current, merged });
}

// A plan, or null only when the work id has none. `items.get` says "no plan for <id>" for that gap;
// every other read failure is a real error the caller must see, never a quiet fallback.
export function planOf(items, work) {
  if (!work) return null;
  try {
    return items.get(work);
  } catch (e) {
    if (!/^no plan for /.test(e.message)) throw e;
    return null;
  }
}

// The plan files the run's other slices own, never a file this slice's own plan names: moving one is
// their work, so the gate does not read it as this slice's change. A file no plan names is nobody's
// and still counts. `items.get` throws for a work item that is gone, which leaves it out.
function foreignPaths(record, id, items) {
  const filesOf = (work) => {
    if (!work) return [];
    try {
      return parseContract(items.get(work)?.body ?? '').files;
    } catch {
      return [];
    }
  };
  const mine = new Set(filesOf((record.gates ?? []).find((x) => x.id === id)?.work));
  const foreign = new Set();
  for (const g of record.gates ?? []) {
    if (g.id === id) continue;
    for (const file of filesOf(g.work)) if (!mine.has(file)) foreign.add(file);
  }
  return [...foreign];
}

// `run contract <slug> [roadmap file]`: the contract the run pairs its tracks by. Each slice's plan
// states the files and interfaces it changes; with a roadmap the slices are its ready and in-flight
// ones in the order `road.ready` uses (milestone, risk, blocks, id), so a coordinator merges in that
// order, and without one they are the slices the run has started, in start order. A slice not scoped
// yet is listed with no plan and both sections missing, so it pairs with nothing. Each shared file is
// named once, with the slice that merges first as its owner.
export function runContract({ planningDir, root, slug, road, items }) {
  const record = showRun(planningDir, slug);
  const rel = (p) => posix(path.relative(root, p));
  const gates = record.gates ?? [];
  const candidates = road
    ? road.slices.filter((s) => ['ready', 'refine', 'in flight'].includes(s.state) && (s.plan || s.state === 'ready')).sort(readyOrder)
    : gates.map((g) => ({ id: g.id, plan: g.work, milestone: null }));
  const byRoad = new Map((road?.slices ?? []).map((s) => [s.id, s]));
  const byGate = new Map(gates.map((g) => [g.id, g]));
  const slices = candidates.map((c) => {
    const work = byRoad.get(c.id)?.plan ?? byGate.get(c.id)?.work ?? null;
    // A slice scoped in the run has a plan; one not scoped yet is a gap, never a silent omission.
    const item = planOf(items, work);
    const contract = item ? parseContract(item.body) : { files: [], interfaces: [], gaps: ['Files', 'Interfaces'] };
    return {
      id: c.id,
      milestone: c.milestone ?? null,
      plan: item ? rel(item.path) : null,
      ...contract,
    };
  });
  const paths = new Map();
  for (const s of slices) for (const file of s.files) paths.set(file, [...(paths.get(file) ?? []), s.id]);
  const shared = [...paths].filter(([, ids]) => ids.length > 1).map(([file, ids]) => ({ path: file, owner: ids[0], slices: ids }));
  return { run: slug, merge_order: slices.map((s) => s.id), slices, shared };
}

// The brief one track starts with: where it works, what it reads, what it reports. A lane M plan
// keeps its phase files beside it; a lane S plan is one file and says nothing about phases.
// The track builds and reports only: the coordinator audits its tree (TRACKS.md), because a
// subagent here cannot start the fresh reviewers an audit needs.
function trackBrief({ slug, id, plan, lane, worktree, branch, base }) {
  const about = String(lane).toLowerCase() === 'm' ? 'a lane M plan: its phase files beside it' : `a lane ${String(lane).toUpperCase()} plan`;
  return (
    `Track ${slug} ${id}: worktree ${worktree}, branch ${branch}, base ${base}. ` +
    `Read the plan ${plan} (${about}) and follow build-it in the worktree. ` +
    `Commit on ${branch}. ` +
    'Report done | failed | blocked, the commit id, the checks that passed and any defect, under 150 words. ' +
    'Run no audit: the coordinator audits this slice on your tree and sends back any Must. ' +
    'Never call run start or run audit and never write the planning dir or the run record: the coordinator records both.'
  );
}

// How many free slices the dispatch asks `nextSlice` for. Well above the hard ceiling of 5 tracks, so
// every free slice is seen: the ones the width leaves out are named in `waiting` instead of vanishing.
const FREE_BATCH = 100;

// `run tracks <slug> <roadmap file>`: the tracks this run starts now. The width is `trackWidth` over
// the record's `tracks` and the free slices; the free slices come from `run next --batch` in dispatch
// order, their plans from `run contract`, and the pre-flight decides which of them can run beside each
// other. Each track carries the worktree, branch, base ref and brief the coordinator starts it with. A
// slice the pre-flight refuses, or one the width leaves out, is in `waiting`: it goes again in the next
// round, and is never parked for it. A slice with no audit round left is in `refused`: the coordinator
// records every round, so a spent cap stops the work before it is dispatched, and no next round frees
// it (a raised cap, a resume or a ship does). `stop` is `nextSlice`'s: a spent `max_slices` reads as
// that stop, never as an empty frontier.
export function runTracks({ planningDir, root, slug, road, items }) {
  const record = showRun(planningDir, slug);
  const asked = record.tracks ?? 1;
  // A record set to none after it was created gets the same refusal, before a worktree starts.
  requireTrackBranch(record.commit, asked);
  // At 1 the loop builds in place: no batch, no worktree, nothing to dispatch.
  if (asked === 1) return { run: slug, width: 0, tracks: [], waiting: [], refused: [], note: 'tracks 1: the loop builds one slice at a time in place' };
  // Every free slice, so the run sees each one its width leaves out and can say why.
  const next = nextSlice(road, record, { batch: FREE_BATCH });
  const free = next.next ?? [];
  const gates = record.gates ?? [];
  // The coordinator decides every round (`run audit`), so the dispatch asks the same cap first.
  const open = [];
  const refused = [];
  for (const id of free) {
    const room = auditRoom(record, id);
    if (room.allow) open.push(id);
    else refused.push({ id, reason: room.reason, limit: room.limit, detail: room.detail });
  }
  const width = trackWidth({ ready: open.length, tracks: asked });
  const contract = runContract({ planningDir, root, slug, road, items });
  const byId = new Map(contract.slices.map((s) => [s.id, s]));
  const paired = pairTracks(open.map((id) => byId.get(id) ?? { id, files: [], interfaces: [], gaps: ['Files', 'Interfaces'] }), width);
  const top = treeTop(root) ?? root;
  const trackRoot = posix(path.join(path.dirname(top), `${path.basename(top)}.do-it`, slug));
  const tracks = paired.tracks.map((s) => {
    const work = gates.find((g) => g.id === s.id)?.work;
    const item = planOf(items, work);
    // The item's lane is the answer; a plan file with no readable item falls back to its path, where
    // only a lane M plan is a README with its phase files beside it.
    const lane = item?.state.lane ?? (s.plan && /(^|\/)README\.md$/.test(s.plan) ? 'm' : 's');
    const worktree = posix(path.join(trackRoot, s.id));
    const branch = `do-it/${slug}--${s.id}`;
    const base = item?.state.base_ref ?? record.base ?? 'HEAD';
    return {
      id: s.id,
      plan: s.plan,
      worktree,
      branch,
      base,
      files: s.files,
      brief: trackBrief({ slug, id: s.id, plan: posix(path.resolve(root, s.plan)), lane, worktree, branch, base }),
    };
  });
  return { run: slug, width, ready: free.length, tracks, waiting: paired.waiting, refused, ...(next.stop ? { stop: next.stop } : {}) };
}

// The git top level of a tree the checks run in, or null outside a repository.
function treeTop(dir) {
  const r = git(dir, ['rev-parse', '--show-toplevel']);
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

// One check, run through the shell at `where`.
function checkAt(where, text) {
  return () => {
    const r = spawnSync(text, { cwd: where, shell: checkShell(), stdio: ['ignore', 2, 2] });
    if (r.error) return { ok: false, why: `${text}: ${r.error.message}` };
    return r.status === 0 ? { ok: true, text } : { ok: false, why: `${text} exited ${r.status ?? r.signal}` };
  };
}

// A run's checks take one slot, so a second check on the same run waits for the first to finish.
// `work` runs with the slot held and is handed the time it queued; a lock left by a dead holder is
// taken over, and the caller says so on stderr (stdout is the record).
function withCheckSlot(planningDir, slug, work) {
  const slot = lockChecks(planningDir, slug);
  if (slot.note) process.stderr.write(`${slot.note}\n`);
  try {
    return work(slot.waited_ms);
  } finally {
    slot.release();
  }
}

// `run verify`: run the checks (a failure once more), record the phase on the work
// item, and on a pass the fingerprint and file hashes the gate and the code commit
// compare against. The plan and the record stay in the coordinator's planning dir; the tree the
// checks ran in is what the fingerprint, the file hashes and `verified_root` describe. A flaky
// check parks the slice, and so does a third failed round in a row (VERIFY_CAP); the two
// failures before it throw as they always have. `quote` shell-quotes one word.
export function runVerify({ planningDir, root, cwd, slug, id, opts, items, fingerprintOf, quote }) {
  const record = showRun(planningDir, slug);
  const g = (record.gates ?? []).find((x) => x.id === id);
  if (!g?.work) throw new Error(`run verify: ${id} has no work id; run start first`);
  const command = opts['--'] ?? [];
  if (!command.length) throw new Error('run verify needs the checks after --');
  const where = opts.in === undefined ? root : path.resolve(cwd, opts.in);
  const top = treeTop(where);
  if (!top) throw new Error(`run verify: ${where} is not a git checkout; nothing recorded`);
  const text = command.length === 1 ? command[0] : command.map(quote).join(' ');
  // The check's own result, or null when there is none: only a check that ran and failed is a
  // failed round, so a guard that refuses the verify and a pass whose record failed to write are not.
  let failed = null;
  const attempt = checkAt(where, text);
  const check = () => {
    const r = checkWithRerun(attempt);
    failed = r.ok ? null : r;
    return r;
  };
  const phase = opts.phase === undefined ? undefined : Number(opts.phase);
  return withCheckSlot(planningDir, slug, (waited) => {
    // Queue time is not work time: recorded so the gate takes it off the in-flight spans.
    recordWaited(planningDir, slug, id, waited);
    try {
      items.verifyPhase(g.work, phase, check, { date: opts.date });
    } catch (e) {
      // A failing check is still a command that showed the slice alive: without the stamp the next
      // start closes the span at the previous one and the minutes before the failure are lost.
      recordSeen(planningDir, slug, id, opts.at ?? new Date().toISOString());
      if (!failed) throw e;
      // The round counts against the slice before the flaky check, so a flaky park cannot hide it.
      const failures = recordVerifyFailure(planningDir, slug, id);
      // A flaky round keeps its own reason: the check's rerun, not the count, is what parks it.
      if (failed.flaky) {
        sliceRun(planningDir, slug, id, 'parked', { reason: e.message.replace(/^verify-phase: /, ''), needs: 'user' });
        throw e;
      }
      // Three in a row: whatever passes now cannot ship, so the slice parks instead of looping.
      if (failures >= VERIFY_CAP_ROUNDS) {
        const why = e.message.replace(/^verify-phase: /, '');
        sliceRun(planningDir, slug, id, 'parked', { reason: `VERIFY_CAP: ${why}`, needs: 'user' });
        throw new Error(`VERIFY_CAP: ${why}`);
      }
      throw e;
    }
    // Only the slice's own files are recorded (`--paths a,b`): never the user's or another slice's.
    const mapped = opts.paths === undefined ? null : String(opts.paths).split(',').filter(Boolean).map((p) => relative(top, p));
    let files = null;
    try {
      files = mapped && dirtyHashes(top, mapped);
    } catch (e) {
      // The phase is already recorded as verified; say which record is missing so the retry is not a guess.
      throw new Error(`${e.message}; the checks passed and the phase is recorded, but ${id}'s verified_files is not: run verify again`);
    }
    // The fingerprint leaves out the files another slice's plan owns, so the gate compares this
    // slice's change alone; a file no plan names is still in it.
    recordVerified(planningDir, slug, id, fingerprintOf(items.get(g.work), top, foreignPaths(record, id, items)), files, verifiedRoot(root, top));
    // Taken after the check returns from the slot, so its queue wait is inside the span (and taken
    // off by `waited_ms`), not left outside it and subtracted a second time.
    recordSeen(planningDir, slug, id, opts.at ?? new Date().toISOString());
    return showRun(planningDir, slug);
  });
}

// `run verify --merged <dir>`: the suite on the merged tree, recorded as the slice's gate fact
// (`merged_fingerprint`). It is no second phase record: the work item's status and phases are
// untouched, and `run gate` refuses a ship from another tree without it.
export function runVerifyMerged({ planningDir, root, cwd, slug, id, opts, items, fingerprintOf, quote }) {
  const g = (showRun(planningDir, slug).gates ?? []).find((x) => x.id === id);
  if (!g?.work) throw new Error(`run verify: ${id} has no work id; run start first`);
  const command = opts['--'] ?? [];
  if (!command.length) throw new Error('run verify --merged needs the checks after --');
  if (!opts.merged) throw new Error('run verify --merged needs the merged directory');
  const where = path.resolve(cwd, String(opts.merged));
  const text = command.length === 1 ? command[0] : command.map(quote).join(' ');
  // The merged suite is a check like any other: it takes the same slot, and its queue wait is not work.
  const r = withCheckSlot(planningDir, slug, (waited) => {
    recordWaited(planningDir, slug, id, waited);
    return checkWithRerun(checkAt(where, text));
  });
  if (!r.ok) {
    // The failed check still ran: stamp the evidence before the throw, as `run verify` does.
    recordSeen(planningDir, slug, id, opts.at ?? new Date().toISOString());
    throw new Error(`verify --merged: ${r.why}; nothing recorded`);
  }
  recordMerged(planningDir, slug, id, fingerprintOf(items.get(g.work), where));
  // Taken after the check returns from the slot, as `run verify` does.
  recordSeen(planningDir, slug, id, opts.at ?? new Date().toISOString());
  return showRun(planningDir, slug);
}

// `run review-change`: the change the run's final review reads. Committed work is the files the
// run's own commits touch, between the recorded base and HEAD: the commits the branch's upstream
// already has are left out, so a merge or a rebase does not put the upstream's content in the
// change, and a pre-run local commit is below the base, so it stays out too. With commit mode none,
// no base, or anything still uncommitted outside the planning dir (the closing docs), the working
// tree against base, untracked files included. Planning files are never in it.
export function runReviewChange({ planningDir, root, slug, exclude }) {
  const { base, commit } = showRun(planningDir, slug);
  if (!base) return { base: null, mode: 'worktree', files: null, note: 'no base recorded: review the working tree' };
  const inRoot = (args) => git(root, args);
  // A git that failed says nothing about the tree: it is an error, never "clean" or "no merge base".
  const must = (r, what) => {
    if (r.error || r.status !== 0) throw new Error(`${what} failed: ${(r.error?.message || r.stderr).trim()}`);
    return r.stdout.trim();
  };
  const dirty = must(inRoot(['status', '--porcelain', '-uall', '--', '.', ...exclude.map((p) => `:(exclude,literal)${p}`)]), 'git status');
  if (commit === 'none' || dirty) return { base, mode: 'worktree', ...treeDiff(root, base, snapshot(root, { exclude }), { exclude }) };
  const mb = inRoot(['merge-base', base, 'HEAD']);
  // A base git cannot resolve is an error; exit 1 is no common ancestor, which the tree diff reads.
  if (mb.status !== 1) must(mb, 'git merge-base');
  // The run's own commits: `<base>..HEAD` without the commits the branch's upstream already has and
  // without merge commits, whose content is the commits they join. No merge base and no anchor pick
  // the start for both cases: the files those commits touch do.
  const up = inRoot(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  const range = [`${base}..HEAD`, ...(up.status === 0 ? ['--not', up.stdout.trim()] : [])];
  const touched = must(inRoot(['log', '--no-merges', '--no-renames', '--format=', '--name-only', ...range]), 'git log');
  const own = [...new Set(touched.split('\n').map((s) => s.trim()).filter(Boolean))]
    .filter((p) => !exclude.some((e) => p === e || p.startsWith(`${e}/`)));
  return { base, mode: 'range', ...treeDiff(root, base, 'HEAD', { exclude, paths: own }) };
}

// Where the plan lists record entry `want` (a `<id>#<n>` key), 1-based, or 0 when it is not found.
// By id first: a plan that still lists as many entries as the record holds for this item has its
// entry at the key's place. A plan that lost entries (ship-it rejected some plan-side, so its list
// closed up) is searched by text, and only a unique text is trusted. Equal texts cannot be told apart
// once the lists differ, so nothing is guessed: the plan is left alone and `ambiguous` names every id
// that shares the text, for the followup to hand to the user.
export function planIndex(assumptions, want, planList) {
  const own = assumptions.map(splitKey).filter((k) => k && k.id === want.id && k.text !== undefined).sort((a, b) => a.n - b.n);
  const pos = own.findIndex((k) => k.n === want.n);
  if (pos < 0) return { at: 0, ambiguous: null };
  const text = own[pos].text;
  if (planList.length === own.length && planList[pos] === text) return { at: pos + 1, ambiguous: null };
  const same = own.filter((k) => k.text === text);
  if (same.length > 1) return { at: 0, ambiguous: same.map((k) => `${want.id}#${k.n}`) };
  return { at: planList.indexOf(text) + 1, ambiguous: null };
}

// `run reject-assumption`: the plan's event fires first, so a plan that refuses leaves the record
// untouched. The plan's entry is found by planIndex (the id's place while the plan's list matches the
// record, else the recorded text among the plan's remaining entries). A plan that is
// auditing or shipping reopens. A plan that no longer lists the text (ship-it rejected it plan-side, or
// it was edited) gets only the record updated; a plan in another state, or no plan at all, is named
// in `followup`, never called closed unless it is.
export function runRejectAssumption({ planningDir, slug, key, instead, items, date }) {
  const want = splitKey(key);
  if (!want || want.text !== undefined) throw new Error('run reject-assumption needs <work id>#<n>');
  const text = String(instead ?? '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('run reject-assumption needs what replaces the assumption');
  const entry = showRun(planningDir, slug).assumptions.find((a) => a.startsWith(`${key}: `));
  if (!entry) throw new Error(`no recorded assumption ${key}`);
  let plan = null;
  try {
    plan = items.get(want.id);
  } catch (e) {
    // items.get says "no plan for <id>" when the item is gone; any other failure is not "closed".
    if (!/^no plan for /.test(e.message)) throw e;
  }
  const status = plan?.state.status;
  const { at, ambiguous } = plan ? planIndex(showRun(planningDir, slug).assumptions, want, plan.state.assumptions) : { at: 0, ambiguous: null };
  const live = ['auditing', 'shipping'].includes(status) && at > 0;
  if (live) items.fire(want.id, 'reject-assumption', { n: at, text, date });
  const { record: next } = rejectAssumption(planningDir, slug, key, text);
  let followup = null;
  if (!plan) followup = `no plan for ${want.id} (the item is closed, or this is a sweep default): the user files a fix: or log-it entry`;
  else if (!live && ['auditing', 'shipping'].includes(status)) followup = `plan ${want.id} no longer lists it (rejected plan-side or edited): only the record changed`;
  else if (['done', 'closed'].includes(status)) followup = `plan ${want.id} is ${status}: the user files a new fix item (log-it); its plan is not edited`;
  else if (!live) followup = `plan ${want.id} is ${status}, not reopened: add the change to its fix: list`;
  if (ambiguous) followup = `equal texts (${ambiguous.join(', ')}): the plan was not changed, check its list by hand; ${followup ?? ''}`.trim();
  return { rejected: key, reopened: live, followup, record: next };
}
