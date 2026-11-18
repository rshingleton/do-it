// Which layer wins when the same key is set more than once, per loadConfig:
// default, then the user file, the project file, the local file, then the environment.

import { cleanEnv, tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { configFiles, loadConfig, DEFAULTS } from '../skills/track-it/scripts/config.mjs';

// A temp repo and user config dir, with each layer's file written when given.
function layers({ user, project, local } = {}) {
  const root = tmpDir('do-it-prec-');
  execFileSync('git', ['init', '-q'], { cwd: root });
  const env = cleanEnv();
  const files = Object.fromEntries(configFiles(root, env).map((f) => [f.scope, f.file]));
  for (const [scope, text] of Object.entries({ user, project, local })) {
    if (text === undefined) continue;
    fs.mkdirSync(path.dirname(files[scope]), { recursive: true });
    fs.writeFileSync(files[scope], text);
  }
  return { root, env, files };
}

// DO_IT_COMMIT is neither guarded nor a secret, so only precedence decides it.
const KEY = 'DO_IT_COMMIT';

test('the default applies when nothing sets the key', () => {
  const { root, env } = layers();
  const c = loadConfig({ cwd: root, env });
  assert.equal(c.values[KEY], DEFAULTS[KEY]);
  assert.equal(c.sources[KEY], 'default');
});

test('each file layer beats the one before it: user, then project, then local', () => {
  const user = layers({ user: `${KEY}=user\n` });
  const u = loadConfig({ cwd: user.root, env: user.env });
  assert.equal(u.values[KEY], 'user');
  assert.equal(u.sources[KEY], user.files.user);

  const project = layers({ user: `${KEY}=user\n`, project: `${KEY}=project\n` });
  const p = loadConfig({ cwd: project.root, env: project.env });
  assert.equal(p.values[KEY], 'project');
  assert.equal(p.sources[KEY], project.files.project);

  const local = layers({ user: `${KEY}=user\n`, project: `${KEY}=project\n`, local: `${KEY}=local\n` });
  const l = loadConfig({ cwd: local.root, env: local.env });
  assert.equal(l.values[KEY], 'local');
  assert.equal(l.sources[KEY], local.files.local);
});

test('the environment beats every file', () => {
  const l = layers({ user: `${KEY}=user\n`, project: `${KEY}=project\n`, local: `${KEY}=local\n` });
  const c = loadConfig({ cwd: l.root, env: { ...l.env, [KEY]: 'env' } });
  assert.equal(c.values[KEY], 'env');
  assert.equal(c.sources[KEY], 'env');
});

test('an empty value in the environment still overrides a file', () => {
  const l = layers({ project: `${KEY}=project\n` });
  assert.equal(loadConfig({ cwd: l.root, env: { ...l.env, [KEY]: '' } }).values[KEY], '');
});

test('a guarded key from a repo file is ignored until trusted, but the user file and env set it', () => {
  const KEY2 = 'DO_IT_LINT_CMD';
  const repo = layers({ project: `${KEY2}=from-repo\n` });
  const c = loadConfig({ cwd: repo.root, env: repo.env });
  assert.equal(c.values[KEY2], DEFAULTS[KEY2], 'the repo value is not applied');
  assert.deepEqual(c.untrusted, [KEY2]);

  const user = layers({ user: `${KEY2}=mine\n`, project: `${KEY2}=from-repo\n` });
  assert.equal(loadConfig({ cwd: user.root, env: user.env }).values[KEY2], 'mine');

  const viaEnv = loadConfig({ cwd: repo.root, env: { ...repo.env, [KEY2]: 'env-wins' } });
  assert.equal(viaEnv.values[KEY2], 'env-wins');
  assert.deepEqual(viaEnv.untrusted, []);
});
