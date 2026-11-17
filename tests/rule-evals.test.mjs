// Behaviour evals for the pressure rules: each pins one sentence in the skill
// text it belongs to, so removing the rule fails a named test instead of
// leaving the text quietly weaker. Deterministic and offline.
//
// The other kind of eval is routing: prompts in evals/routing.json, run by
// `npm run eval`, which checks a description still pulls its own prompts in.

import './env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Line wrapping is not the rule: compare on one line.
const read = (f) => fs.readFileSync(path.join(ROOT, 'skills', f), 'utf8').replace(/\s+/g, ' ');

function section(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `skill text lost its "${from}" heading`);
  const end = text.indexOf(to, start + from.length);
  return text.slice(start, end < 0 ? undefined : end);
}

test('test-it treats a test that breaks on a refactor with no behaviour change as a smell', () => {
  const s = read('test-it/SKILL.md');
  const smells = section(s, '## Smells that mean start the test again', '## ');
  assert.ok(
    smells.includes('It fails after a refactor that changed no behaviour.'),
    'the refactor smell is gone',
  );
});

test('prove-it gives no pass to an unverified review axis', () => {
  const s = read('prove-it/SKILL.md');
  const verdict = section(s, '## 4. Verdict', '## 5.');
  assert.ok(verdict.includes('is no pass.'), 'the unverified axis is no pass rule is gone');
});

test('ship-it refuses to commit, push, amend or squash without an explicit "do it"', () => {
  const s = read('ship-it/SKILL.md');
  const rules = section(s, '## Rules', '## ');
  assert.ok(
    rules.includes('Never commit, push, amend or squash without an explicit "do it"'),
    'the no-commit-without-do-it rule is gone',
  );
});
