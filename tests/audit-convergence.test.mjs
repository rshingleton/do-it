// Pins the audit convergence rules: written in prove-it/ROUNDS.md, linked
// from prove-it, named in review-it, build-it and ship-it. Text only: it
// catches a removed rule, not an agent ignoring one.

import { read } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('ROUNDS.md holds the convergence rules', () => {
  const s = read('skills/prove-it/ROUNDS.md');
  for (const need of ['### Settled', '### Touched', '#### Round N', 'do not re-raise', 'once', 'clean_passes', 'reaudit --again', 'log-it', '/ship-it', 'Should and Nice']) {
    assert.ok(s.includes(need), `ROUNDS.md names ${need}`);
  }
});

test('prove-it links ROUNDS.md', () => {
  const s = read('skills/prove-it/SKILL.md');
  assert.ok(s.includes('ROUNDS.md'));
});

test('review-it takes the settled list and tells reviewers not to re-raise it', () => {
  const s = read('skills/review-it/SKILL.md');
  assert.match(s, /settled/i);
  assert.ok(s.includes('re-raise'));
});

test('build-it fix mode records Settled and Touched before build-done, within its line count', () => {
  const s = read('skills/build-it/SKILL.md');
  const fix = s.slice(s.indexOf('**Fix mode**'), s.indexOf('- Lane S:'));
  assert.ok(fix.includes('Settled') && fix.includes('Touched') && fix.includes('prove-it/ROUNDS.md'));
  assert.ok(s.split('\n').length <= 102, 'build-it did not grow past its existing 101 lines');
});

test('ship-it records the review-diff files in Touched before the reaudit event', () => {
  const s = read('skills/ship-it/RESUME.md');
  const i = s.indexOf('Touched');
  assert.ok(i > 0 && i < s.indexOf('`event reaudit`'), 'Touched is named before the reaudit call');
  assert.ok(s.includes('review-diff'));
});

const flat = (p) => read(p).replace(/\s+/g, ' ');

test('ROUNDS.md states the Should policy: fix with Musts, one bounded pass, log the rest', () => {
  const s = flat('skills/prove-it/ROUNDS.md');
  for (const need of ['fixed with the Musts', 'small and local', 'one scoped `reaudit`', 'logged, never fixed', 'Should pass', 'spends no audit cap', 'reverted and logged', 'once per work item', 'as a review edit is', 'uses one of the three clean passes', 'in any earlier round']) {
    assert.ok(s.includes(need), `ROUNDS.md names ${need}`);
  }
  assert.ok(!s.includes('fixes Musts only'), 'the Should pass is not contradicted by a Musts-only line');
});

test('prove-it §4 says Should and Nice never block and points to ROUNDS.md, within 100 lines', () => {
  const raw = read('skills/prove-it/SKILL.md');
  const s = raw.replace(/\s+/g, ' ');
  assert.ok(s.includes('Should and Nice never block'));
  assert.ok(!s.includes('never block or start a re-audit'));
  assert.ok(raw.split('\n').length <= 100 + (raw.endsWith('\n') ? 1 : 0), 'prove-it stays within 100 lines');
});

test('REPORT.md and VALIDATE.md carry the same Should policy', () => {
  assert.ok(flat('skills/prove-it/REPORT.md').includes('fixed Should'));
  assert.ok(flat('skills/prove-it/VALIDATE.md').includes("fixed on the reviewer's word"));
});

test('ship-it restatements say open Should and Nice findings', () => {
  for (const f of ['SKILL.md', 'DOCS.md', 'RUNMODE.md']) {
    const s = read(`skills/ship-it/${f}`).replace(/\s+/g, ' ');
    assert.ok(s.includes('open Should and Nice'), `ship-it/${f} says open Should and Nice`);
  }
});

test('every restatement carries the same small-and-local definition', () => {
  const def = 'one file, no interface, no behaviour change';
  for (const f of ['skills/prove-it/ROUNDS.md', 'skills/finish-it/DIGEST.md', 'skills/finish-it/TRACKS.md', 'skills/build-it/SKILL.md']) {
    assert.ok(flat(f).includes(def), `${f} defines small and local as: ${def}`);
  }
});

test('run mode still files surfaced defects, and no longer reads as a ban on fixing Shoulds', () => {
  const s = flat('skills/ship-it/RUNMODE.md');
  assert.ok(!s.includes('Never fix them in the run'), 'the ban is scoped');
  assert.ok(s.includes('Never fix a surfaced'), 'it bans fixing a surfaced defect in the run');
});
