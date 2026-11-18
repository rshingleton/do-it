import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HELPER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'env.mjs');
const HELPER_URL = pathToFileURL(HELPER).href;

test('importing the helper hides the developer environment from this process and its children', () => {
  const real = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-real-'));
  const gitconfig = path.join(real, 'gitconfig');
  fs.writeFileSync(gitconfig, '[commit]\n\tgpgsign = true\n');
  const probe = `
    await import(${JSON.stringify(HELPER_URL)});
    const { spawnSync } = await import('node:child_process');
    const e = process.env;
    console.log(JSON.stringify({
      home: e.HOME, xdg: e.XDG_CONFIG_HOME, gcg: e.GIT_CONFIG_GLOBAL, nosys: e.GIT_CONFIG_NOSYSTEM,
      leaked: Object.keys(e).filter((k) => /^(DO_IT_|JIRA_|GITHUB_)/.test(k)),
      sign: spawnSync('git', ['config', '--get', 'commit.gpgsign'], { encoding: 'utf8' }).stdout.trim() || null,
    }));`;
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-probe-'));
  const r = spawnSync('node', ['--input-type=module', '-e', probe], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, HOME: real, DO_IT_HOOKS: 'off', JIRA_TOKEN: 'x', GITHUB_TOKEN: 'x', GIT_CONFIG_GLOBAL: gitconfig },
  });
  fs.rmSync(cwd, { recursive: true, force: true });
  fs.rmSync(real, { recursive: true, force: true });
  const out = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.notEqual(out.home, real);
  assert.ok(out.home.startsWith(os.tmpdir()) || fs.realpathSync(out.home).startsWith(fs.realpathSync(os.tmpdir())));
  assert.equal(out.xdg, path.join(out.home, '.config'));
  assert.equal(out.gcg, process.platform === 'win32' ? 'NUL' : os.devNull);
  assert.equal(out.nosys, '1');
  assert.deepEqual(out.leaked, []);
  assert.equal(out.sign, null, 'the global gpgsign setting did not reach git');
  assert.equal(fs.existsSync(out.home), false, 'the temp HOME is removed on exit');
});

test('cleanEnv strips do-it and tracker variables set after import, and takes the home it should isolate', async () => {
  const { cleanEnv } = await import('./env.mjs');
  Object.assign(process.env, { DO_IT_LATE: '1', JIRA_LATE: '1', GITHUB_LATE: '1' });
  try {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-given-'));
    const env = cleanEnv({ DO_IT_KEEP: '1' }, home);
    assert.deepEqual(Object.keys(env).filter((k) => /^(DO_IT_|JIRA_|GITHUB_)/.test(k)), ['DO_IT_KEEP']);
    assert.equal(env.HOME, home);
    assert.equal(env.XDG_CONFIG_HOME, path.join(home, '.config'));
    fs.rmSync(home, { recursive: true, force: true });
  } finally {
    for (const k of ['DO_IT_LATE', 'JIRA_LATE', 'GITHUB_LATE']) delete process.env[k];
  }
});

test('tmpDir directories are removed when the process exits', () => {
  const probe = `
    const { tmpDir } = await import(${JSON.stringify(HELPER_URL)});
    const dir = tmpDir('do-it-probe-');
    (await import('node:fs')).writeFileSync(dir + '/f', 'x');
    console.log(dir);`;
  const r = spawnSync('node', ['--input-type=module', '-e', probe], { encoding: 'utf8' });
  const dir = r.stdout.trim().split('\n').pop();
  assert.match(path.basename(dir), /^do-it-probe-/, r.stderr);
  assert.equal(fs.existsSync(dir), false);
});

test('the helper throws at import when the home variable os.homedir() reads is not isolated', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-copy-'));
  const key = process.platform === 'win32' ? 'USERPROFILE' : 'HOME';
  const lines = fs.readFileSync(HELPER, 'utf8').split('\n');
  const kept = lines.filter((l) => !l.trim().startsWith(key + ': home,'));
  assert.equal(kept.length, lines.length - 1, 'the helper has one ' + key + ' line');
  const copy = path.join(dir, 'env.mjs');
  fs.writeFileSync(copy, kept.join('\n'));
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(copy).href)})`], { encoding: 'utf8' });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /os\.homedir\(\) is/);
});
