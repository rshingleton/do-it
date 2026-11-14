// Pins the grill acceptance rule: written once in grill-it, linked from
// scope-it and do-it, never restated. See docs/issues for the decision.

import './env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, 'skills', f), 'utf8');

const HEADING = /^## What counts as acceptance$/m;
const PHRASE = 'explicit accept';
const LINK = '../grill-it/SKILL.md';

test('grill-it defines the acceptance rule once', () => {
  const s = read('grill-it/SKILL.md');
  assert.match(s, HEADING);
  assert.ok(s.includes(PHRASE), 'rule names the explicit accept signal');
  assert.match(s, /plan files/i, 'rule covers plan files');
});

test('scope-it and do-it link to the rule instead of restating it', () => {
  for (const f of ['scope-it/SKILL.md', 'scope-it/GRILL.md', 'do-it/SKILL.md']) {
    const s = read(f);
    assert.ok(s.includes(LINK), `${f} links to grill-it`);
    assert.doesNotMatch(s, HEADING, `${f} does not redefine the rule`);
    assert.ok(!s.includes('reopens branches'), `${f} does not restate the rule`);
  }
});

test('links point at an anchor the heading produces', () => {
  const heading = read('grill-it/SKILL.md').match(HEADING)[0].slice(3);
  const slug = heading.toLowerCase().replace(/\s+/g, '-');
  for (const f of ['scope-it/SKILL.md', 'scope-it/GRILL.md', 'do-it/SKILL.md']) {
    assert.ok(read(f).includes(`${LINK}#${slug}`), `${f} anchor matches the heading`);
  }
});

test('scope-it approval needs an explicit accept, not any reply', () => {
  const s = read('scope-it/SKILL.md');
  assert.ok(!s.includes('approval of the edited plan counts'));
  const five = s.slice(s.indexOf('## 5. Approve'), s.indexOf('## 6.'));
  assert.ok(five.includes('explicit accept') && five.includes(LINK));
});
