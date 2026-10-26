// The one frontmatter module: split, join, CRLF, flat read and write.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { splitFrontmatter, joinFrontmatter, parseFlat, writeFlat } from '../skills/track-it/scripts/frontmatter.mjs';

test('split reads the block and body, and reports the file line ending', () => {
  assert.deepEqual(splitFrontmatter('---\na: 1\nb: 2\n---\n\nBody\n'), { yaml: 'a: 1\nb: 2', body: '\nBody\n', eol: '\n' });
  assert.deepEqual(splitFrontmatter('---\r\na: 1\r\nb: 2\r\n---\r\n\r\nBody\r\n'), { yaml: 'a: 1\nb: 2', body: '\r\nBody\r\n', eol: '\r\n' });
  assert.equal(splitFrontmatter('---\na: 1\n---').body, '');
  assert.equal(splitFrontmatter('---\na: 1\n---  \nrest').body, 'rest');
});

test('split gives null without a closed block', () => {
  assert.equal(splitFrontmatter('no block\n'), null);
  assert.equal(splitFrontmatter('---\na: 1\nnever closed\n'), null);
  assert.equal(splitFrontmatter('x\n---\na: 1\n---\n'), null);
});

test('join writes the block with the given line ending and keeps the body as given', () => {
  assert.equal(joinFrontmatter('a: 1\nb: 2', '\nBody\n'), '---\na: 1\nb: 2\n---\n\nBody\n');
  assert.equal(joinFrontmatter('a: 1\nb: 2\n', 'Body\n'), '---\na: 1\nb: 2\n---\nBody\n');
  assert.equal(joinFrontmatter('a: 1\nb: 2', 'Body\r\n', '\r\n'), '---\r\na: 1\r\nb: 2\r\n---\r\nBody\r\n');
});

test('split then join is the identity for LF and CRLF files', () => {
  for (const text of ['---\na: 1\n---\n\nBody\n', '---\r\na: 1\r\n---\r\n\r\nBody\r\n']) {
    const { yaml, body, eol } = splitFrontmatter(text);
    assert.equal(joinFrontmatter(yaml, body, eol), text);
  }
});

test('parseFlat reads plain, quoted, folded and literal scalars', () => {
  const yaml = [
    'plain: a value',
    'folded_plain: one',
    '  two',
    `single: 'it''s'`,
    'double: "a \\"q\\" \\x41 \\u00e9"',
    'fold: >-',
    '  a',
    '  b',
    'lit: |',
    '  l1',
    '  l2',
    'empty:',
  ].join('\n');
  const { meta } = parseFlat(yaml);
  assert.deepEqual(meta, {
    plain: 'a value',
    folded_plain: 'one two',
    single: "it's",
    double: 'a "q" A é',
    fold: 'a b',
    lit: 'l1\nl2',
    empty: '',
  });
});

test('parseFlat reports lines that are not key: value and lines folded into a value', () => {
  assert.deepEqual(parseFlat('title: T\nlabels:\n  - a\n  - b\n').continued, ['  - a', '  - b']);
  assert.deepEqual(parseFlat('# note\ntitle: T\n\n').skipped, ['# note']);
  assert.deepEqual(parseFlat('title: T\nstatus: open'), { meta: { title: 'T', status: 'open' }, skipped: [], continued: [] });
});

test('parseFlat keeps a comment line out of the value above it', () => {
  const r = parseFlat('title: T\n# note\nstatus: open\nd: one\n  # aside\n  two');
  assert.deepEqual(r.meta, { title: 'T', status: 'open', d: 'one two' });
  assert.deepEqual(r.skipped, ['# note', '  # aside']);
  assert.deepEqual(r.continued, ['  two']);
});

test('writeFlat leaves safe values bare, quotes the rest and drops empty ones', () => {
  assert.equal(writeFlat({ title: 'Plain title', a: undefined, b: '', n: 3 }), 'title: Plain title\nn: 3');
  assert.equal(writeFlat({ t: 'Fix "login": broken' }), 't: "Fix \\"login\\": broken"');
  assert.equal(writeFlat({ t: 'Has # hash' }), 't: "Has # hash"');
  assert.equal(writeFlat({ t: 'trailing ' }), 't: "trailing "');
  assert.equal(writeFlat({ t: '-lead' }), 't: "-lead"');
});

test('writeFlat output reads back unchanged', () => {
  const meta = { a: 'Fix "login": broken', b: "Fix the users'", c: 'Has # hash', d: 'trailing ', e: 'line\nbreak', f: 'Plain', g: '\\back', h: 'bell\b form\f feed', i: 'ctl\u0001x' };
  assert.deepEqual(parseFlat(writeFlat(meta)).meta, meta);
});
