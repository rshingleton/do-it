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
