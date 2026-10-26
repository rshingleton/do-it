import './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { allowedEvents, emptyBlock, needsUser, normalize, transition } from '../skills/do-it/scripts/state.mjs';
import { parseBlock, readItem, writeItem, writeBlock } from '../skills/do-it/scripts/block.mjs';
import { roadmapSlices } from '../skills/do-it/scripts/roadmap.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'skills/do-it/scripts/work.mjs');

// The style STATE.md and older plans use: flow maps, one spanning two lines,
// a scalar todo, trailing comments, a title with a comma in parentheses.
const FLOW = `id: ABC-123
title: Rate-limit the login endpoint
lane: m
status: building        # draft | planned | building
tracker: { kind: jira, ref: ABC-123, phases: { 1: ABC-124, 2: ABC-125 } }
sources: [docs/issues/login-rate-limit.md]
todo: T5                # promoted from the to-do list
base_ref: 1a2b3c4
approvals:
  plan: 2026-10-19
phases:
  - { n: 1, title: Limiter module, blocked_by: [], status: done,
      verified: "npm test, npm run lint: pass" }
  - { n: 2, title: Wire into login (rate, lockout), blocked_by: [1], status: ready }
assumptions:
  - "Limit is 5 attempts per minute per IP (reversible: config)"
audit: { verdict: null, round: 0, must: [], fingerprint: null }
ship: { prepared: null, fingerprint: null }
blocker: null
`;

const BLOCK = `id: ABC-123
title: Rate-limit the login endpoint
lane: m
status: building
tracker:
  kind: jira
  ref: ABC-123
  phases:
    1: ABC-124
    2: ABC-125
sources: [docs/issues/login-rate-limit.md]
todo: [T5]
base_ref: 1a2b3c4
approvals:
  plan: 2026-10-19
phases:
  - n: 1
    title: Limiter module
    blocked_by: []
    status: done
    verified: "npm test, npm run lint: pass"
  - n: 2
    title: "Wire into login (rate, lockout)"
    blocked_by: [1]
    status: ready
    verified: null
assumptions:
  - "Limit is 5 attempts per minute per IP (reversible: config)"
`;

test('state block: block style round-trips byte for byte', () => {
  const state = normalize(parseBlock(BLOCK));
  const once = writeBlock(state);
  assert.equal(writeBlock(normalize(parseBlock(once))), once);
});

test('state block: the old flow style reads the same as its block rewrite', () => {
  assert.deepEqual(normalize(parseBlock(FLOW)), normalize(parseBlock(BLOCK)));
  const stateDoc = fs.readFileSync(path.join(ROOT, 'skills/do-it/STATE.md'), 'utf8');
  const example = stateDoc.match(/```yaml\n---\n([\s\S]*?)---\n```/)[1];
  const s = normalize(parseBlock(example));
  assert.equal(s.phases[0].verified, 'npm test, npm run lint: pass');
  assert.deepEqual(s.todo, ['T5']);
});

test('docs: the plan and state examples are what the script writes (bug 4)', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'skills/scope-it/PLAN-FORMAT.md'), 'utf8');
  const example = doc.match(/```markdown\n---\n([\s\S]*?)---\n/)[1];
  const expected = writeBlock({
    ...emptyBlock({ id: 'login-rate-limit', title: 'Rate-limit the login endpoint', lane: 's' }),
    sources: ['docs/issues/login-rate-limit.md'],
    assumptions: ['5 attempts per minute per IP (reversible: config)'],
  });
  assert.equal(example, expected);

  const state = fs.readFileSync(path.join(ROOT, 'skills/do-it/STATE.md'), 'utf8');
  const block = state.match(/```yaml\n---\n([\s\S]*?)---\n```/)[1];
  assert.equal(writeBlock(normalize(parseBlock(block))), block);
});

test('state block: strings that look like other types are quoted on write', () => {
  const s = { ...emptyBlock({ id: 'x', title: 'null', lane: 's' }), base_ref: '1234567', assumptions: ['a: b', 'true'] };
  const back = normalize(parseBlock(writeBlock(s)));
  assert.equal(back.title, 'null');
  assert.equal(back.base_ref, '1234567');
  assert.deepEqual(back.assumptions, ['a: b', 'true']);
});

test('state block: an unreadable line is an error, not silent loss', () => {
  assert.throws(() => parseBlock('id: x\n  stray continuation\nlane: s\n'), /cannot read line/);
});

function walk(state, steps) {
  return steps.reduce((s, [event, args]) => transition(s, event, { date: '2026-10-19', ...args }), state);
}

test('transitions: lane S walks draft to shipping through a failed audit', () => {
  let s = emptyBlock({ id: 'x', title: 'X', lane: 's' });
  s = walk(s, [['approve'], ['start', { head: 'abc' }]]);
  assert.equal(s.status, 'building');
  assert.equal(s.approvals.plan, '2026-10-19');
  assert.throws(() => transition(s, 'build-done'), /verify-phase first/);
  s = walk(s, [['phase-done', { verified: 'npm test: pass' }], ['build-done'], ['audit-fail', { must: ['M1 missing test'] }]]);
  assert.equal(s.status, 'building');
  assert.equal(s.audit.round, 1);
  s = walk(s, [['start', { head: 'def' }]]);
  assert.equal(s.base_ref, 'abc', 'a resumed start keeps the base');
  assert.throws(() => transition(s, 'build-done'), /since the fix began/, 'fix mode needs its own verify');
  s = walk(s, [['phase-done', { verified: 'npm test: pass' }], ['build-done'], ['audit-pass', { fingerprint: 'f1' }], ['ship-prepared', { fingerprint: 'f2' }]]);
  assert.equal(s.status, 'shipping');
  assert.deepEqual(s.audit.must, []);
  assert.equal(s.audit.round, 0, 'a pass resets the failed-round count');
  assert.equal(s.audit.at, '2026-10-19');
  assert.equal(s.ship.fingerprint, 'f2');
});

test('transitions: lane M needs every phase done, in dependency order', () => {
  let s = normalize({ ...emptyBlock({ id: 'm', title: 'M', lane: 'm' }), phases: [{ n: 1 }, { n: 2, blocked_by: [1] }] });
  s = walk(s, [['approve'], ['start', { head: 'abc' }]]);
  assert.throws(() => transition(s, 'phase-done', { n: 2, verified: 'ok' }), /blocked by phase\(s\) 1/);
  s = walk(s, [['phase-done', { n: 1, verified: 'ok' }]]);
  assert.throws(() => transition(s, 'build-done'), /phase\(s\) 2 not done/);
  s = walk(s, [['block', { n: 2, why: 'needs an API key' }]]);
  assert.equal(s.status, 'building', 'a blocked phase leaves the item building');
  assert.equal(s.phases[1].status, 'blocked');
  s = walk(s, [['unblock', { n: 2 }], ['phase-done', { n: 2, verified: 'ok' }], ['build-done']]);
  assert.equal(s.status, 'auditing');
});

test('transitions: the third failed audit asks the user; fix mode skips phases', () => {
  let s = normalize({ ...emptyBlock({ id: 'm', title: 'M', lane: 'm' }), phases: [{ n: 1 }] });
  s = walk(s, [['approve'], ['start', { head: 'a' }], ['phase-done', { n: 1, verified: 'ok' }], ['build-done']]);
  for (let r = 1; r <= 3; r++) s = walk(s, [['audit-fail', { must: [`M${r}`] }], ...(r < 3 ? [['phase-done', { n: 1, verified: 'ok' }], ['build-done']] : [])]);
  assert.equal(s.status, 'blocked');
  assert.equal(s.audit.round, 3);
  assert.match(s.blocker, /fix, accept with a recorded decision, or re-plan/);
  assert.equal(needsUser(s), true);
  s = walk(s, [['unblock']]);
  assert.equal(needsUser(s), false, 'the answer is recorded once; resume does not ask again');
  assert.throws(() => transition(s, 'build-done'), /since the fix began/);
  s = walk(s, [['phase-done', { n: 1, verified: 'ok' }], ['build-done']]);
  assert.equal(s.status, 'auditing', 'accepting with a recorded decision re-audits');
});

test('transitions: re-plan goes back to draft and keeps the base', () => {
  let s = emptyBlock({ id: 'x', title: 'X', lane: 's' });
  s = walk(s, [['approve'], ['start', { head: 'a' }], ['replan']]);
  assert.equal(s.status, 'draft');
  assert.equal(s.approvals.plan, null);
  assert.equal(s.base_ref, 'a');
});

test('transitions: a rejected assumption gives build-it work (bug 1)', () => {
  let s = { ...emptyBlock({ id: 'x', title: 'X', lane: 's' }), assumptions: ['Limit is 5 a minute', 'Per IP'] };
  s = walk(s, [['approve'], ['start', { head: 'a' }], ['phase-done', { verified: 'ok' }], ['build-done'], ['audit-pass', { fingerprint: 'f' }], ['ship-prepared', { fingerprint: 'g' }]]);
  assert.throws(() => transition(s, 'reject-assumption', { n: 3, text: 'x' }), /assumption number \(1-2\)/);
  s = walk(s, [['reject-assumption', { n: 1, text: 'limit is 10' }]]);
  assert.equal(s.status, 'building');
  assert.deepEqual(s.fix, ['Rejected assumption: Limit is 5 a minute. Instead: limit is 10']);
  assert.deepEqual(s.assumptions, ['Per IP'], 'a rejected assumption is not asked about again');
  assert.equal(s.ship.prepared, null);
  assert.throws(() => transition(s, 'build-done'), /since the fix began/);
  s = walk(s, [['phase-done', { verified: 'ok' }], ['build-done']]);
  assert.equal(s.status, 'auditing');
  assert.deepEqual(s.fix, []);
  assert.equal('fix_verified' in s, false, 'the record is spent with the fix');
});

test('transitions: an illegal event names the allowed ones', () => {
  const s = emptyBlock({ id: 'x', title: 'X', lane: 's' });
  assert.throws(() => transition(s, 'audit-pass', { fingerprint: 'f' }), /not allowed from draft; allowed: approve/);
  assert.throws(() => transition(s, 'finish'), /unknown event/);
  assert.deepEqual(allowedEvents('shipping'), ['block', 'replan', 'ship-prepared', 'reaudit', 'reject-assumption']);
});

const ROADMAP = `---
title: Billing
---

# Billing

## Milestones

### M1: Plan changes

| Slice | Kind | Delivers | Covers | Blocked by | Verify | Risk | Status |
|-------|------|----------|--------|------------|--------|------|--------|
| R1 | spike | Proration? | G1 | none | ADR | high | shipped 2026-10-22 r1-spike |
| R2 | build | Picker | G1 | R1 (proration answer) | Upgrade | med | |
| R3 | build | Downgrade | G1 | R2 (plan picker) | Date shown | low | |
| R4 | build | Payment module | G2 | none | Card saved | low | refine |
| R5 | build | Change card | G2 | R4 (payment module), D1 | Charged | med | |
| R6 | build | Contact | G2 | none | Saved | low | |
| R7 | build | Receipts | G2 | none | Sent | low | dropped 2026-10-20: provider does it |

## Open decisions
- D1: Who may change billing? Blocks R5.
`;

test('roadmap: every slice state is derived, a hand-committed plan is stale (bugs 6, 7)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-rm-'));
  const planningDir = path.join(dir, 'docs/planning');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'docs/roadmap'));
  const file = path.join(dir, 'docs/roadmap/billing.md');
  fs.writeFileSync(file, ROADMAP);
  const plan = (id, slice) =>
    fs.writeFileSync(path.join(planningDir, `${id}.md`), `---\n${writeBlock({ ...emptyBlock({ id, title: id, lane: 's' }), roadmap: `docs/roadmap/billing.md#${slice}` })}---\n`);
  plan('picker', 'R2');
  plan('contact', 'R6');
  const out = roadmapSlices(file, { root: dir, planningDir, tracked: (f) => f.endsWith('contact.md') });
  const by = Object.fromEntries(out.slices.map((s) => [s.id, s.state]));
  assert.deepEqual(by, { R1: 'shipped', R2: 'in flight', R3: 'blocked', R4: 'refine', R5: 'blocked', R6: 'stale', R7: 'dropped' });
  assert.match(out.slices.find((s) => s.id === 'R5').note, /R4, D1/);
  assert.equal(out.next, 'R4');
});

function tempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-work-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

function work(dir, ...args) {
  const r = spawnSync('node', [WORK, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: dir } });
  return { status: r.status, out: JSON.parse(r.stdout) };
}

// CLI smoke tests: arguments, JSON output and exit codes. The rules behind
// each command are tested through workItems in items.test.mjs.
test('work.mjs: new, set, event, show, list and close on a repo', () => {
  const dir = tempRepo();
  let r = work(dir, 'new', 'feat-x', '--lane', 'm', '--title', 'Feature X');
  assert.equal(r.status, 0, JSON.stringify(r.out));
  assert.equal(r.out.path, 'docs/planning/feat-x/README.md');
  fs.writeFileSync(path.join(dir, 'docs/planning/feat-x/phase-1.md'), '# Phase 1\n');

  r = work(dir, 'set', 'feat-x', 'phases', '[{"n":1,"title":"One"}]');
  assert.deepEqual(r.out.phases, [{ n: 1, title: 'One', blocked_by: [], status: 'ready', verified: null }]);
  r = work(dir, 'set', 'feat-x', 'todo', 'T7');
  assert.deepEqual(r.out.todo, ['T7']);
  r = work(dir, 'set', 'feat-x', 'status', '"shipping"');
  assert.equal(r.status, 1);
  assert.match(r.out.error, /go through event/);

  r = work(dir, 'event', 'feat-x', 'start');
  assert.equal(r.status, 1);
  assert.match(r.out.error, /allowed: approve/);
  work(dir, 'event', 'feat-x', 'approve');
  r = work(dir, 'event', 'feat-x', 'start');
  assert.equal(r.out.base_ref, '4b825dc642cb6eb9a060e54bf8d69288fbee4904', 'no commits yet: the empty tree');
  r = work(dir, 'event', 'feat-x', 'phase-done', '1', 'npm', 'test:', 'pass');
  assert.equal(r.status, 1, 'a phase is not recorded on say-so');
  assert.match(r.out.error, /recorded by verify-phase/);
  assert.equal(r.out.phases, undefined);
  assert.equal(work(dir, 'show', 'feat-x').out.allowed.includes('phase-done'), false, 'nothing offers what is refused');
  r = work(dir, 'verify-phase', 'feat-x', '1', '--', 'node -e "process.exit(0)"');
  assert.equal(r.out.phases[0].verified, 'node -e "process.exit(0)": pass');
  for (const e of [['build-done'], ['audit-pass', 'fp1']]) work(dir, 'event', 'feat-x', ...e);

  r = work(dir, 'list');
  assert.deepEqual(r.out.map((i) => [i.id, i.status]), [['feat-x', 'shipping']]);
  const item = readItem(path.join(dir, 'docs/planning/feat-x/README.md'));
  assert.match(item.body, /# Feature X/);
  assert.equal(item.state.audit.fingerprint, 'fp1');
  assert.ok(work(dir, 'show', 'feat-x').out.allowed.includes('close'), 'shipping offers close');

  r = work(dir, 'close', 'feat-x');
  assert.deepEqual(r.out.todo, ['T7']);
  assert.equal(fs.existsSync(path.join(dir, 'docs/planning/feat-x')), false);
  assert.match(work(dir, 'show', 'feat-x').out.error, /no plan for feat-x/);
});

test('work.mjs: verify-phase records only a passing check; audit-pass hashes the change (T21, T8)', () => {
  const dir = tempRepo();
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base');
  work(dir, 'new', 'fix-y', '--lane', 's', '--title', 'Fix Y');
  work(dir, 'event', 'fix-y', 'approve');
  work(dir, 'event', 'fix-y', 'start');

  let r = work(dir, 'verify-phase', 'fix-y', '--', 'node -e "process.exit(0)" && node -e "process.exit(3)"');
  assert.equal(r.status, 1);
  assert.match(r.out.error, /exited 3; nothing recorded/);
  assert.equal(work(dir, 'show', 'fix-y').out.verified, null);
  assert.equal(work(dir, 'verify-phase', 'fix-y').status, 1, 'no command: refused');

  r = work(dir, 'verify-phase', 'fix-y', '--', 'node -e "process.exit(0)"');
  assert.equal(r.status, 0, JSON.stringify(r.out));
  assert.equal(r.out.verified, 'node -e "process.exit(0)": pass');

  fs.writeFileSync(path.join(dir, 'code.js'), 'x');
  const before = work(dir, 'fingerprint', 'fix-y').out.fingerprint;
  fs.writeFileSync(path.join(dir, 'docs/planning/notes.md'), 'planning files do not count');
  assert.equal(work(dir, 'fingerprint', 'fix-y').out.fingerprint, before);
  work(dir, 'event', 'fix-y', 'build-done');
  r = work(dir, 'event', 'fix-y', 'audit-pass');
  assert.equal(r.out.audit.fingerprint, before);
});

test('work.mjs: build-done in fix mode needs a passing verify-phase since the fix began', () => {
  const dir = tempRepo();
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base');
  work(dir, 'new', 'fix-z', '--lane', 's', '--title', 'Fix Z');
  for (const e of ['approve', 'start']) work(dir, 'event', 'fix-z', e);
  work(dir, 'verify-phase', 'fix-z', '--', 'node -e "process.exit(0)"');
  work(dir, 'event', 'fix-z', 'build-done');
  work(dir, 'event', 'fix-z', 'audit-fail', 'M1 missing test');

  let r = work(dir, 'event', 'fix-z', 'build-done');
  assert.equal(r.status, 1);
  assert.match(r.out.error, /since the fix began/, 'the pre-fix verify does not count');
  r = work(dir, 'verify-phase', 'fix-z', '--', 'node -e "process.exit(3)"');
  assert.equal(r.status, 1);
  assert.equal(work(dir, 'event', 'fix-z', 'build-done').status, 1, 'a failing verify records nothing');
  work(dir, 'verify-phase', 'fix-z', '--', 'node -e "process.exit(0)"');
  assert.equal(work(dir, 'event', 'fix-z', 'build-done').out.status, 'auditing');
});

test('work.mjs: review-diff shows edits made after ship prepared, without touching the index', () => {
  const dir = tempRepo();
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  fs.writeFileSync(path.join(dir, 'a.js'), 'one\n');
  git('add', 'a.js');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'base');
  work(dir, 'new', 'rev', '--lane', 's', '--title', 'Rev');
  for (const e of ['approve', 'start']) work(dir, 'event', 'rev', e);
  fs.writeFileSync(path.join(dir, 'a.js'), 'two\n');
  work(dir, 'verify-phase', 'rev', '--', 'node -e "process.exit(0)"');
  for (const e of ['build-done', 'audit-pass', 'ship-prepared']) work(dir, 'event', 'rev', e);
  assert.deepEqual(work(dir, 'review-diff', 'rev').out.files, []);

  fs.writeFileSync(path.join(dir, 'a.js'), 'three\n');
  git('add', 'a.js');
  fs.writeFileSync(path.join(dir, 'a.js'), 'four\n');
  fs.writeFileSync(path.join(dir, 'b.js'), 'new\n');
  fs.writeFileSync(path.join(dir, 'docs/planning/note.md'), 'planning edits do not count');
  const indexBefore = fs.readFileSync(path.join(dir, '.git/index'));
  const r = work(dir, 'review-diff', 'rev');
  assert.deepEqual(r.out.files, [{ status: 'M', path: 'a.js' }, { status: 'A', path: 'b.js' }]);
  assert.ok(fs.readFileSync(path.join(dir, '.git/index')).equals(indexBefore), 'the user index is untouched, partial staging kept');

  assert.equal(work(dir, 'event', 'rev', 'reaudit').out.status, 'auditing');
});

test('audit round 1 regressions: replan, parens, empty lane M, comments, CRLF', () => {
  // Must 1: after a re-plan the new phases are built, not skipped by fix mode.
  let s = normalize({ ...emptyBlock({ id: 'm', title: 'M', lane: 'm' }), phases: [{ n: 1 }] });
  s = walk(s, [['approve'], ['start', { head: 'a' }], ['phase-done', { n: 1, verified: 'ok' }], ['build-done']]);
  s = walk(s, [['audit-fail', { must: [1] }], ['phase-done', { n: 1, verified: 'ok' }], ['build-done'], ['audit-fail', { must: [1] }], ['phase-done', { n: 1, verified: 'ok' }], ['build-done'], ['audit-fail', { must: [1] }], ['replan']]);
  assert.deepEqual([s.audit.verdict, s.audit.round, s.fix], [null, 0, []]);
  s = normalize({ ...s, phases: [...s.phases, { n: 2, blocked_by: [1] }] });
  s = walk(s, [['approve'], ['start']]);
  assert.throws(() => transition(s, 'build-done'), /phase\(s\) 2 not done/);

  // Should 2: an unbalanced parenthesis round-trips.
  const p = { ...emptyBlock({ id: 'x', title: 'X', lane: 's' }), assumptions: ['x (y', '(a', 'b)'] };
  assert.deepEqual(normalize(parseBlock(writeBlock(p))).assumptions, ['x (y', '(a', 'b)']);

  // Should 4: lane M with no phases cannot go to audit.
  const empty = walk(emptyBlock({ id: 'e', title: 'E', lane: 'm' }), [['approve'], ['start', { head: 'a' }]]);
  assert.throws(() => transition(empty, 'build-done'), /no phases/);

  // Nice 8: a comment inside a multi-line flow map is dropped.
  assert.deepEqual(parseBlock('audit: { verdict: null, # c\n  round: 0 }\n').audit, { verdict: null, round: 0 });

  // Nice 9: a CRLF plan stays CRLF.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-crlf-'));
  const file = path.join(dir, 'c.md');
  fs.writeFileSync(file, '---\r\nid: c\r\ntitle: C\r\nlane: s\r\nstatus: draft\r\n---\r\n\r\n# C\r\n');
  const item = readItem(file);
  writeItem(item);
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /[^\r]\n/);
});

test('a failed plan write leaves the old plan whole and no temp file (T53)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-atomic-'));
  const file = path.join(dir, 'a.md');
  const before = `---\n${writeBlock(emptyBlock({ id: 'a', title: 'A', lane: 's' }))}---\n\n# A\n`;
  fs.writeFileSync(file, before);
  const item = readItem(file);
  item.state.title = 'Changed';
  assert.throws(
    () => writeItem(item, { renameSync: () => { throw new Error('ENOSPC'); } }),
    /ENOSPC/,
  );
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.deepEqual(fs.readdirSync(dir), ['a.md']);
  writeItem(item);
  assert.equal(readItem(file).state.title, 'Changed');
  assert.deepEqual(fs.readdirSync(dir), ['a.md']);

  // A full disk fails the temp write itself, part-way: no partial file left.
  const partial = (f, data) => {
    fs.writeFileSync(f, data.slice(0, 5));
    throw new Error('ENOSPC');
  };
  assert.throws(() => writeItem(item, { writeFileSync: partial }), /ENOSPC/);
  assert.deepEqual(fs.readdirSync(dir), ['a.md']);
});

test('fingerprint accepts the empty-tree base once commits exist (Should 5)', () => {
  const dir = tempRepo();
  work(dir, 'new', 'fresh', '--lane', 's', '--title', 'Fresh');
  work(dir, 'event', 'fresh', 'approve');
  assert.equal(work(dir, 'event', 'fresh', 'start').out.base_ref, '4b825dc642cb6eb9a060e54bf8d69288fbee4904');
  fs.writeFileSync(path.join(dir, 'a.js'), 'x');
  execFileSync('git', ['add', 'a.js'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'first'], { cwd: dir });
  const r = work(dir, 'fingerprint', 'fresh');
  assert.equal(r.status, 0, JSON.stringify(r.out));
});

test('audit round 2: newlines and tabs in values round-trip', () => {
  const s = { ...emptyBlock({ id: 'x', title: 'multi\nline', lane: 's' }), blocker: 'a\tb', assumptions: ['one\r\ntwo'] };
  const back = normalize(parseBlock(writeBlock(s)));
  assert.deepEqual([back.title, back.blocker, back.assumptions], ['multi\nline', 'a\tb', ['one\r\ntwo']]);
});

test('work.mjs: verify-phase keeps separate arguments intact (audit round 2)', () => {
  const dir = tempRepo();
  work(dir, 'new', 'args', '--lane', 's', '--title', 'Args');
  work(dir, 'event', 'args', 'approve');
  work(dir, 'event', 'args', 'start');
  assert.equal(work(dir, 'verify-phase', 'args', '--', 'node', '-e', 'process.exit(3)').status, 1, 'no false pass');
  const r = work(dir, 'verify-phase', 'args', '--', 'node', '-e', 'process.exit(0)');
  assert.equal(r.status, 0, JSON.stringify(r.out));
});

test('work.mjs: verify-phase --in runs the checks in another directory and records here (T55)', () => {
  const dir = tempRepo();
  const int = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-int-'));
  fs.writeFileSync(path.join(int, 'marker'), '');
  work(dir, 'new', 'par', '--lane', 'm', '--title', 'Par');
  work(dir, 'set', 'par', 'phases', '[{"n":1,"title":"One"}]');
  for (const e of ['approve', 'start']) work(dir, 'event', 'par', e);
  const check = 'node -e "require(\'fs\').accessSync(\'marker\')"';
  assert.equal(work(dir, 'verify-phase', 'par', '1', '--', check).status, 1, 'no marker in the checkout');
  assert.equal(work(dir, 'show', 'par').out.phases[0].status, 'ready');
  let r = work(dir, 'verify-phase', 'par', '1', '--in', path.join(int, 'missing'), '--', check);
  assert.match(r.out.error, /--in .*does not exist/);
  r = work(dir, 'verify-phase', 'par', '1', '--in', int, '--', check);
  assert.equal(r.status, 0, JSON.stringify(r.out));
  assert.equal(r.out.phases[0].status, 'done');
  assert.equal(r.out.path, 'docs/planning/par/README.md', 'recorded in the checkout, not in --in');
});

test('work.mjs: review-diff without a snapshot degrades instead of failing', () => {
  const dir = tempRepo();
  work(dir, 'new', 'old', '--lane', 's', '--title', 'Old');
  const r = work(dir, 'review-diff', 'old');
  assert.equal(r.status, 0);
  assert.equal(r.out.files, null);
});

test('work.mjs: roadmap reads the file relative to the current directory', () => {
  const dir = tempRepo();
  fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs/roadmap/billing.md'), ROADMAP);
  const r = spawnSync('node', [WORK, 'roadmap', 'billing.md'], { cwd: path.join(dir, 'docs/roadmap'), encoding: 'utf8' });
  const out = JSON.parse(r.stdout);
  assert.equal(out.file, 'docs/roadmap/billing.md');
  assert.equal(out.next, 'R2', 'no plans: R2 is ready and riskier than R4');
});

test('work.mjs: show --brief prints only status, lane, next moves and the blocker, before or after the id', () => {
  const dir = tempRepo();
  work(dir, 'new', 'feat-b', '--lane', 'm', '--title', 'Feature B');
  const want = ['allowed', 'blocker', 'id', 'lane', 'needs_user', 'status'];
  for (const args of [['show', 'feat-b', '--brief'], ['show', '--brief', 'feat-b']]) {
    const r = work(dir, ...args);
    assert.equal(r.status, 0, JSON.stringify(r.out));
    assert.deepEqual(Object.keys(r.out).sort(), want);
    assert.equal(r.out.status, 'draft');
    assert.deepEqual(r.out.allowed, work(dir, 'show', 'feat-b').out.allowed);
  }
  work(dir, 'event', 'feat-b', 'approve');
  work(dir, 'event', 'feat-b', 'block', 'need a key');
  const blocked = work(dir, 'show', 'feat-b', '--brief').out;
  assert.equal(blocked.blocker, 'need a key');
  assert.equal(blocked.needs_user, true);
});

test('work.mjs: --brief on new, list, event, set and verify-phase prints the short shape', () => {
  const dir = tempRepo();
  const want = ['allowed', 'blocker', 'id', 'lane', 'needs_user', 'status'];
  const shape = (r) => {
    assert.equal(r.status, 0, JSON.stringify(r.out));
    assert.deepEqual(Object.keys(r.out).sort(), want);
    return r.out;
  };
  assert.equal(shape(work(dir, 'new', 'feat-c', '--lane', 's', '--title', 'Feature C', '--brief')).status, 'draft');
  assert.equal(shape(work(dir, 'set', 'feat-c', 'assumptions', '["a"]', '--brief')).id, 'feat-c');
  assert.equal(shape(work(dir, 'event', 'feat-c', 'approve', '--brief')).status, 'planned');
  assert.equal(shape(work(dir, 'event', 'feat-c', 'start', '--brief')).status, 'building');
  assert.equal(shape(work(dir, 'verify-phase', 'feat-c', '--brief', '--', 'true')).status, 'building');
  const list = work(dir, 'list', '--brief').out;
  assert.deepEqual(list, [{ id: 'feat-c', lane: 's', status: 'building' }]);
  assert.ok(work(dir, 'show', 'feat-c').out.verified, 'the full form still records and shows the check');
});

test('transitions: a fix round forgets the last one\'s verify', () => {
  let s = emptyBlock({ id: 'x', title: 'X', lane: 's' });
  s = walk(s, [['approve'], ['start', { head: 'a' }], ['phase-done', { verified: 'ok' }], ['build-done'], ['audit-fail', { must: ['M1'] }], ['phase-done', { verified: 'fix1' }], ['build-done'], ['audit-fail', { must: ['M2'] }]]);
  assert.equal('fix_verified' in s, false);
  assert.throws(() => transition(s, 'build-done'), /since the fix began/, 'round 1 verify does not cover round 2');
});

test('ship-it: the retro-it offer sits at the question, before close deletes the candidates', () => {
  const ship = fs.readFileSync(path.join(ROOT, 'skills/ship-it/SKILL.md'), 'utf8');
  const question = ship.indexOf('## 2. The one question');
  const after = ship.indexOf('## 3. After the answer');
  const offer = ship.indexOf('/retro-it <id>');
  assert.ok(offer > question && offer < after, 'the offer is in section 2');
  assert.ok(offer < ship.indexOf('`work.mjs close <id>`'), 'the offer precedes the close step');
  assert.equal(ship.split('/retro-it <id>').length, 2, 'offered once, not again after close');
});

test('ship-it: the question offers the audit leftovers, DOCS.md and prove-it name where they go', () => {
  const ship = fs.readFileSync(path.join(ROOT, 'skills/ship-it/SKILL.md'), 'utf8');
  const docs = fs.readFileSync(path.join(ROOT, 'skills/ship-it/DOCS.md'), 'utf8');
  const prove = fs.readFileSync(path.join(ROOT, 'skills/prove-it/SKILL.md'), 'utf8');
  const question = ship.slice(ship.indexOf('## 2. The one question'), ship.indexOf('## 3. After the answer'));
  assert.match(question, /the audit's Should and Nice findings \(no changelog\)/, 'the question shows the findings');
  assert.match(question, /audit findings and\s+surfaced defects above \(default: findings and defects/, 'question 2 offers them, default log');
  assert.ok(docs.includes('## Audit findings'), 'DOCS.md has the section');
  const section = docs.slice(docs.indexOf('## Audit findings'));
  assert.match(section, /"log-it"[\s\S]*`source: <work id> audit`/, 'it logs through log-it with the audit source');
  assert.match(prove, /with no changelog offers to log them as\s+to-dos/, 'prove-it names the home');
});

test('defects: a surfaced-defects list round-trips and work.mjs set writes it', () => {
  const s = { ...emptyBlock({ id: 'x', title: 'X', lane: 's' }), defects: ['scan fails at Long.MAX_VALUE', 'range delete skips the end key'] };
  assert.deepEqual(emptyBlock({ id: 'x', title: 'X', lane: 's' }).defects, []);
  assert.deepEqual(normalize(parseBlock(writeBlock(s))).defects, s.defects);
  assert.deepEqual(normalize({ id: 'x', title: 'X', lane: 's' }).defects, [], 'an older plan gains an empty list');
  const dir = tempRepo();
  work(dir, 'new', 'feat-d', '--lane', 's', '--title', 'D', '--brief');
  const r = work(dir, 'set', 'feat-d', 'defects', '["a: one","b: two"]', '--brief');
  assert.equal(r.status, 0, JSON.stringify(r.out));
  assert.deepEqual(work(dir, 'show', 'feat-d').out.defects, ['a: one', 'b: two']);
});

test('skills: surfaced defects are planned, recorded and offered at ship', () => {
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const ship = read('skills/ship-it/SKILL.md');
  const docs = read('skills/ship-it/DOCS.md');
  const question = ship.slice(ship.indexOf('## 2. The one question'), ship.indexOf('## 3. After the answer'));
  assert.match(question, /surfaced `defects:`/, 'the question lists the defects');
  assert.match(question, /surfaced defects above[\s\S]*default/i, 'question 2 offers to log them');
  const section = docs.slice(docs.indexOf('## Surfaced defects'));
  assert.ok(docs.includes('## Surfaced defects'), 'DOCS.md has the section');
  assert.match(section, /"log-it"[\s\S]*`source: <work id>`/, 'filed through log-it with the work id');
  assert.match(section, /`shipped <date> <work id>, Verify unmet:\s+<clause>`[\s\S]*issue refs/, 'unmet-verify format'); assert.match(section, /unmet/i, 'a roadmap row is not shipped without the unmet-verify note');
  assert.match(read('skills/scope-it/PLAN-FORMAT.md'), /surfaced defect[\s\S]*`log-it`/, 'scope-it adds the file-defects step');
  assert.match(read('skills/scope-it/SKILL.md'), /PLAN-FORMAT\.md/);
  assert.match(read('skills/build-it/SKILL.md'), /defects/, 'build-it records defects');
  assert.match(read('skills/do-it/STATE.md'), /`defects`/, 'STATE.md documents the field');
});
