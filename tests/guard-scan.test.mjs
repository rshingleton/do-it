// The compliance scanner runs from any install, or says plainly why it cannot.

import { cleanEnv, tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN = path.join(ROOT, 'skills/guard-it/scripts/scan.mjs');
const KEY = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');

function gitRepo() {
  const dir = tmpDir('do-it-guard-scan-');
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base');
  return { dir, git };
}

function run(script, cwd, ...args) {
  return spawnSync('node', [script, ...args], { cwd, encoding: 'utf8', env: cleanEnv() });
}

// A skill tree installed on its own, the way the `skills` CLI and a plugin
// carry it: guard-it and nothing beside it.
function copiedSkill() {
  const dir = path.join(tmpDir('do-it-guard-copy-'), 'skills/guard-it');
  fs.cpSync(path.join(ROOT, 'skills/guard-it'), dir, { recursive: true });
  return dir;
}

test('the checkout scan still reports a finding from another repo', () => {
  const { dir } = gitRepo();
  fs.writeFileSync(path.join(dir, 'a.js'), `k = "${KEY}"\n`);
  const r = run(SCAN, dir);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /in a\.js:1:/);
});

test('the checkout scan loads its rules and reports a clean change as clean', () => {
  const { dir } = gitRepo();
  const r = run(SCAN, dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^clean: \d+ rules/);
});

test('a copied skill tree with no hooks/lib reports unverified and exits 2', () => {
  const { dir } = gitRepo();
  const skill = copiedSkill();
  const r = run(path.join(skill, 'scripts/scan.mjs'), dir);
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stderr, /^Unverified: cannot resolve hooks\/lib\/checks\.mjs from /);
  assert.doesNotMatch(r.stdout, /clean/, 'a scan that did not run is never clean');
});

test('a root found with a module missing is unverified, never a throw', () => {
  const { dir } = gitRepo();
  const skill = copiedSkill();
  const root = path.dirname(path.dirname(skill));
  fs.mkdirSync(path.join(root, 'hooks/lib'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'hooks/lib/checks.mjs'), path.join(root, 'hooks/lib/checks.mjs'));
  const r = run(path.join(skill, 'scripts/scan.mjs'), dir);
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stderr, /^Unverified: cannot resolve .*skills\/track-it\/scripts\/config\.mjs/);
  assert.doesNotMatch(r.stderr, /\n\s+at /, 'no stack trace');
});
