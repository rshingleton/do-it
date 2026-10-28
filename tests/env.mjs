// Import this first in a suite: static imports run in source order, and the
// isolation must be in place before any other module reads the environment.
// The developer's HOME, do-it and tracker variables, and global git config
// (signing, hooks) must never reach a test or a process it spawns.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

const freshHome = () => tmpDir('do-it-home-');

const homeVars = (home) => ({ HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') });

Object.assign(process.env, homeVars(freshHome()), { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' });

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
  return { ...env, ...homeVars(home), ...extra };
}
