// Import this first in a suite: static imports run in source order, and the
// isolation must be in place before any other module reads the environment.
// The developer's HOME, do-it and tracker variables, and global git config
// (signing, hooks) must never reach a test or a process it spawns.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LEAKY = /^(DO_IT_|JIRA_|GITHUB_)/;
for (const k of Object.keys(process.env)) if (LEAKY.test(k)) delete process.env[k];

const temps = [];

// A temp directory removed when the test process exits, so a run leaves
// nothing in tmp. Use it in place of `fs.mkdtempSync`.
export function tmpDir(prefix = 'do-it-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A file in this repo, as text. A docs test that pins a heading or a link reads
// through this; never a whole sentence.
export function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const freshHome = () => tmpDir('do-it-home-');

// os.homedir() reads HOME on POSIX and USERPROFILE on Windows; set both.
const homeVars = (home) => ({
  HOME: home,
  USERPROFILE: home,
  ...(process.platform === 'win32' ? { HOMEDRIVE: path.parse(home).root.slice(0, 2), HOMEPATH: home.slice(2) } : {}),
  XDG_CONFIG_HOME: path.join(home, '.config'),
});

const home0 = freshHome();
Object.assign(process.env, homeVars(home0), {
  GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : os.devNull,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'safe.bareRepository',
  GIT_CONFIG_VALUE_0: 'all',
});

// Fail loudly if the process home is still the developer's: a test would
// otherwise write into the real config.
if (path.resolve(os.homedir()) !== path.resolve(home0)) {
  throw new Error(`tests/env.mjs: os.homedir() is ${os.homedir()}, not the temp home ${home0}`);
}

process.on('exit', () => {
  for (const d of temps) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

// The isolated environment for a spawned process. Variables a suite set in
// this process after the import are stripped here, at call time. `home`
// defaults to a fresh empty one, so config or trust one test writes never
// reaches the next; pass the home the test already prepared to use that.
export function cleanEnv(extra = {}, home = freshHome()) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !LEAKY.test(k)));
  return {
    ...env,
    ...homeVars(home),
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : os.devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'safe.bareRepository',
    GIT_CONFIG_VALUE_0: 'all',
    ...extra,
  };
}
