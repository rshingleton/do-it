import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('tracker CLI runs through a symlink and prints JSON', { skip: process.platform === 'win32' && 'unprivileged symlinks' }, () => {
  const dir = tmpDir('do-it-cli-');
  fs.mkdirSync(path.join(dir, '.git'));
  const link = path.join(dir, 'tracker-link');
  fs.symlinkSync(path.join(ROOT, 'skills/track-it'), link);
  const out = execFileSync('node', [path.join(link, 'scripts/tracker.mjs'), 'create', '--title', 'Hello', '--body', 'b'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, XDG_CONFIG_HOME: dir, DO_IT_TRACKER: 'local' },
  });
  assert.equal(JSON.parse(out).ref, 'docs/issues/hello.md');
  assert.ok(fs.existsSync(path.join(dir, 'docs/issues/hello.md')));
});
