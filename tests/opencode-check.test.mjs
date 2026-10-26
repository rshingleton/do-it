import './env.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkExternalDirectory as check, checkRepo } from '../skills/setup-it/scripts/opencode-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = (v) => JSON.stringify({ permission: { external_directory: v } });

test('allow is flagged, ask and deny pass', () => {
  assert.equal(check(cfg('allow')).status, 'allow');
  assert.equal(check(cfg('ask')).status, 'ok');
  assert.equal(check(cfg('deny')).status, 'ok');
});

test('a missing key or permission block is flagged', () => {
  assert.equal(check('{}').status, 'missing');
  assert.equal(check('{"permission":{"bash":"ask"}}').status, 'missing');
});

test('object form is judged by its "*" entry', () => {
  assert.equal(check(cfg({ '*': 'ask', '/tmp/**': 'allow' })).status, 'ok');
  assert.equal(check(cfg({ '*': 'allow' })).status, 'allow');
  assert.equal(check(cfg({ '/tmp/**': 'allow' })).status, 'missing');
});

test('comments and trailing commas parse; URLs in strings survive', () => {
  const r = check('{\n // note\n "x": "http://a/b", /* c */\n "permission": {"external_directory": "ask",},\n}');
  assert.deepEqual([r.status, r.comments], ['ok', true]);
  assert.equal(check('{}').comments, false);
});

test('invalid JSON or a string permission is reported, not thrown', () => {
  assert.equal(check('{nope').status, 'invalid');
  assert.equal(check('{"permission":"allow"}').status, 'invalid');
});

test('repo discovery: no OpenCode skips, .opencode alone is missing, file is read', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-oc-'));
  assert.equal(checkRepo(dir).applies, false);
  fs.mkdirSync(path.join(dir, '.opencode'));
  assert.deepEqual([checkRepo(dir).applies, checkRepo(dir).status], [true, 'missing']);
  fs.writeFileSync(path.join(dir, 'opencode.jsonc'), cfg('allow'));
  const r = spawnSync('node', ['skills/setup-it/scripts/opencode-check.mjs', dir], { cwd: ROOT, encoding: 'utf8' });
  const out = JSON.parse(r.stdout);
  assert.deepEqual([out.file, out.status], ['opencode.jsonc', 'allow']);
});
