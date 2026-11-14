// gitOut returns a git's whole stdout, however large, and passes `input` through.
// On Windows it reads the output back from a temp file; the same assertions hold everywhere.

import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { gitOut } from '../skills/do-it/scripts/git.mjs';

const tempOutputs = () => fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith(`do-it-git-${process.pid}-`));

test('gitOut reads a multi-megabyte stdout whole', () => {
  const dir = tmpDir('do-it-gitout-');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  const big = 'x'.repeat(3 * 1024 * 1024);
  fs.writeFileSync(path.join(dir, 'big.txt'), big);
  const hash = gitOut(dir, ['hash-object', '-w', 'big.txt']).trim();
  assert.match(hash, /^[0-9a-f]{40}$/);
  assert.equal(gitOut(dir, ['cat-file', 'blob', hash]).length, big.length);
});

test('gitOut passes input to git, and a failure throws with git\'s stderr', () => {
  const dir = tmpDir('do-it-gitout-');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  const want = execFileSync('git', ['hash-object', '--stdin'], { cwd: dir, input: 'hi\n', encoding: 'utf8' });
  assert.equal(gitOut(dir, ['hash-object', '--stdin'], process.env, 'hi\n'), want);
  assert.throws(() => gitOut(dir, ['cat-file', 'blob', '0'.repeat(40)]), /git cat-file failed: .+/);
  assert.deepEqual(tempOutputs(), [], 'no temp output file is left behind');
});
