// The one file-set module: what a text's list of paths is, and when two lists share a path.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseFileList, sharedPaths } from '../skills/do-it/scripts/fileset.mjs';

test('a file list drops bullets, backticks, ./ and blank or comment lines', () => {
  const text = ['## Files', '', '- `src/a.js`', '  `./src/b.js`  ', '# a comment', '   ', ''].join('\n');
  assert.deepEqual(parseFileList(text), ['src/a.js', 'src/b.js']);
});

test('a file list splits on commas and newlines, keeping input order and duplicates', () => {
  assert.deepEqual(parseFileList('src/b.js, src/a.js\nsrc/c.js,src/b.js'), ['src/b.js', 'src/a.js', 'src/c.js', 'src/b.js']);
});

test('a comment line is dropped whole, so a comma in it is not a path', () => {
  assert.deepEqual(parseFileList('# src/a.js, src/b.js\nsrc/c.js'), ['src/c.js']);
});

test('./x and x are the same path, and a repeated path is kept', () => {
  assert.deepEqual(parseFileList('./src/a.js\nsrc/a.js'), ['src/a.js', 'src/a.js']);
});

test('empty or blank text lists no files', () => {
  assert.deepEqual(parseFileList(''), []);
  assert.deepEqual(parseFileList('\n  \n'), []);
});

test('shared paths come once each, in the first list\'s order', () => {
  assert.deepEqual(sharedPaths(['src/b.js', 'src/a.js', 'src/b.js', 'src/c.js'], ['src/a.js', 'src/b.js']), ['src/b.js', 'src/a.js']);
});

test('disjoint or empty lists share nothing', () => {
  assert.deepEqual(sharedPaths(['src/a.js'], ['src/b.js']), []);
  assert.deepEqual(sharedPaths([], []), []);
  assert.deepEqual(sharedPaths(['src/a.js'], []), []);
  assert.deepEqual(sharedPaths([], ['src/a.js']), []);
});

test('paths compare exactly, so a directory and a file under it never overlap', () => {
  assert.deepEqual(sharedPaths(['src/a'], ['src/a/b.js']), []);
});
