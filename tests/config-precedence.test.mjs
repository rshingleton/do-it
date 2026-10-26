// Which layer wins when the same key is set more than once, per loadConfig:
// default, then the user file, the project file, the local file, then the environment.

import { cleanEnv } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { configFiles, loadConfig, DEFAULTS } from '../skills/track-it/scripts/config.mjs';

// A temp repo and user config dir, with each layer's file written when given.
function layers({ user, project, local } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-prec-'));
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

test('each later layer beats the one before it: user, project, local, then env', () => {
  const l = layers({ user: `${KEY}=user\n`, project: `${KEY}=project\n`, local: `${KEY}=local\n` });
  const at = (env) => loadConfig({ cwd: l.root, env });

  assert.equal(at(l.env).values[KEY], 'local');
  assert.equal(at(l.env).sources[KEY], l.files.local);

  const noLocal = layers({ user: `${KEY}=user\n`, project: `${KEY}=project\n` });
  assert.equal(loadConfig({ cwd: noLocal.root, env: noLocal.env }).values[KEY], 'project');

  const userOnly = layers({ user: `${KEY}=user\n` });
  assert.equal(loadConfig({ cwd: userOnly.root, env: userOnly.env }).values[KEY], 'user');

  const viaEnv = at({ ...l.env, [KEY]: 'env' });
  assert.equal(viaEnv.values[KEY], 'env');
  assert.equal(viaEnv.sources[KEY], 'env');
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
