// The host decision module: what every hook event decides, whatever the host.

import { cleanEnv } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { decide } from '../hooks/lib/decide.mjs';

// Fake secrets are assembled at runtime so this file never holds one literally.
const FAKE_AWS = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');
const PLACEHOLDER = ['// TODO: insert', 'API key here'].join(' '); // do-it: allow (fixture)

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-decide-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base');
  return { dir, git };
}

test('session gives the core posture, plus a notice for skipped rules', () => {
  const { dir } = repo();
  const env = cleanEnv();
  const clean = decide('session', { cwd: dir }, { env });
  assert.match(clean.context, /Core posture/);
  assert.doesNotMatch(clean.context, /do-it: /);

  fs.mkdirSync(path.join(dir, '.compliance-rules'));
  fs.writeFileSync(path.join(dir, '.compliance-rules', 'checks.json'), '[null]');
  assert.match(decide('session', { cwd: dir }, { env }).context, /do-it: .*checks\.json/);
});

test('before an edit, a secret blocks and clean text passes', () => {
  const { dir } = repo();
  const env = cleanEnv();
  const blocked = decide('before', { kind: 'edit', args: { file_path: 'a.js', content: `k = "${FAKE_AWS}"` }, cwd: dir }, { env });
  assert.match(blocked.block, /aws-access-key in a\.js/);
  assert.deepEqual(decide('before', { kind: 'edit', args: { file_path: 'a.js', content: 'const a = 1' }, cwd: dir }, { env }), {});
  // Notes wait until the edit has run.
  assert.deepEqual(decide('before', { kind: 'edit', args: { file_path: 'a.js', content: PLACEHOLDER }, cwd: dir }, { env }), {});
});

test('before a shell command, a commit staging a secret blocks', () => {
  const { dir, git } = repo();
  const env = cleanEnv();
  fs.writeFileSync(path.join(dir, 'a.js'), `k = "${FAKE_AWS}"\n`);
  git('add', 'a.js');
  assert.match(decide('before', { kind: 'shell', args: { command: 'git commit -m x' }, cwd: dir }, { env }).block, /blocked the commit/);
  assert.deepEqual(decide('before', { kind: 'shell', args: { command: 'git status' }, cwd: dir }, { env }), {});
});

test('after an edit, lint failures come before compliance notes', () => {
  const { dir } = repo();
  const env = cleanEnv({ DO_IT_LINT_CMD: 'echo lint says no; exit 1' });
  const r = decide('after', { kind: 'edit', args: { file_path: 'a.js', content: PLACEHOLDER }, cwd: dir }, { env });
  assert.equal(r.block, undefined);
  assert.match(r.context, /^do-it lint failed for a\.js[\s\S]*lint says no[\s\S]*\n\ndo-it compliance notes:\n.*credential-placeholder/);
});

test('after an edit, nothing blocks: the edit already ran', () => {
  const { dir } = repo();
  assert.deepEqual(decide('after', { kind: 'edit', args: { file_path: '.env', content: 'A=1' }, cwd: dir }, { env: cleanEnv() }), {});
});

test('hooks off, an unknown event or a tool with no kind decide nothing', () => {
  const { dir } = repo();
  const args = { file_path: '.env', content: '' };
  assert.deepEqual(decide('before', { kind: 'edit', args, cwd: dir }, { env: cleanEnv({ DO_IT_HOOKS: 'off' }) }), {});
  assert.deepEqual(decide('session', { cwd: dir }, { env: cleanEnv({ DO_IT_HOOKS: 'off' }) }), {});
  assert.deepEqual(decide('nope', { kind: 'edit', args, cwd: dir }, { env: cleanEnv() }), {});
  assert.deepEqual(decide('before', { kind: null, args, cwd: dir }, { env: cleanEnv() }), {});
});

test('a failure inside fails open with a notice', () => {
  const { dir } = repo();
  const args = {
    file_path: 'a.js',
    get content() {
      throw new Error('boom');
    },
  };
  assert.deepEqual(decide('before', { kind: 'edit', args, cwd: dir }, { env: cleanEnv() }), {
    notice: 'do-it hook before failed open: boom',
  });
});

test('before a shell command, a commit message without an id prefix passes with a note', () => {
  const { dir } = repo();
  const env = cleanEnv();
  const bad = decide('before', { kind: 'shell', args: { command: 'git commit --allow-empty -m "fix thing"' }, cwd: dir }, { env });
  assert.equal(bad.block, undefined);
  assert.match(bad.context, /<id>: /);
  assert.deepEqual(decide('before', { kind: 'shell', args: { command: 'git commit --allow-empty -m "abc-1: fix thing"' }, cwd: dir }, { env }), {});
});
