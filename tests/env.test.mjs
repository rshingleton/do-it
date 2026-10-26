import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HELPER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'env.mjs');

test('importing the helper hides the developer environment from this process and its children', () => {
  const real = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-real-'));
  const gitconfig = path.join(real, 'gitconfig');
  fs.writeFileSync(gitconfig, '[commit]\n\tgpgsign = true\n');
  const probe = `
    await import(${JSON.stringify(HELPER)});
    const { spawnSync } = await import('node:child_process');
    const e = process.env;
    console.log(JSON.stringify({
      home: e.HOME, xdg: e.XDG_CONFIG_HOME, gcg: e.GIT_CONFIG_GLOBAL, nosys: e.GIT_CONFIG_NOSYSTEM,
      leaked: Object.keys(e).filter((k) => /^(DO_IT_|JIRA_|GITHUB_)/.test(k)),
      sign: spawnSync('git', ['config', '--get', 'commit.gpgsign'], { encoding: 'utf8' }).stdout.trim() || null,
    }));`;
  const r = spawnSync('node', ['--input-type=module', '-e', probe], {
    encoding: 'utf8',
    env: { ...process.env, HOME: real, DO_IT_HOOKS: 'off', JIRA_TOKEN: 'x', GITHUB_TOKEN: 'x', GIT_CONFIG_GLOBAL: gitconfig },
  });
  const out = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.notEqual(out.home, real);
  assert.ok(out.home.startsWith(os.tmpdir()) || fs.realpathSync(out.home).startsWith(fs.realpathSync(os.tmpdir())));
  assert.equal(out.xdg, path.join(out.home, '.config'));
  assert.equal(out.gcg, '/dev/null');
  assert.equal(out.nosys, '1');
  assert.deepEqual(out.leaked, []);
  assert.equal(out.sign, null, 'the global gpgsign setting did not reach git');
  assert.equal(fs.existsSync(out.home), false, 'the temp HOME is removed on exit');
});
