// Import this first in a suite: static imports run in source order, and the
// isolation must be in place before any other module reads the environment.
// The developer's HOME, do-it and tracker variables, and global git config
// (signing, hooks) must never reach a test or a process it spawns.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

for (const k of Object.keys(process.env)) if (/^(DO_IT_|JIRA_|GITHUB_)/.test(k)) delete process.env[k];

const homes = [];
function freshHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-home-'));
  homes.push(home);
  return home;
}

const home = freshHome();
Object.assign(process.env, {
  HOME: home,
  XDG_CONFIG_HOME: path.join(home, '.config'),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
});

process.on('exit', () => {
  for (const h of homes) {
    try { fs.rmSync(h, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

// The isolated environment for a spawned process, with its own empty HOME so
// config or trust one test writes never reaches the next.
export function cleanEnv(extra = {}) {
  const h = freshHome();
  return { ...process.env, HOME: h, XDG_CONFIG_HOME: path.join(h, '.config'), ...extra };
}
