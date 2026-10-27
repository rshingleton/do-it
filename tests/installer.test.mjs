// install-hooks.mjs as a user runs it: what it refuses to touch and what a dry run leaves alone.

import { cleanEnv } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALL = path.join(ROOT, 'scripts', 'install-hooks.mjs');

function setup(settings) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-inst-'));
  const file = path.join(home, '.claude', 'settings.json');
  if (settings !== undefined) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, settings);
  }
  const run = (...args) => spawnSync('node', [INSTALL, 'claude', ...args], { encoding: 'utf8', env: cleanEnv({ HOME: home }) });
  return { home, file, backup: `${file}.bak-do-it`, run };
}

test('a settings.json with comments is refused and left byte-identical', () => {
  const text = '// my settings\n{ "model": "x", /* keep */ "hooks": {} }\n';
  const { file, backup, run } = setup(text);
  const before = fs.readFileSync(file);
  const r = run();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not plain JSON/);
  assert.ok(fs.readFileSync(file).equals(before), 'the file is untouched');
  assert.equal(fs.existsSync(backup), false, 'no backup is taken for a file that was not changed');
});

test('--dry-run prints the result and writes nothing, not even a backup or a missing directory', () => {
  const existing = setup('{"model":"x"}\n');
  const before = fs.readFileSync(existing.file);
  const r = existing.run('--dry-run');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /dry run/);
  assert.ok(fs.readFileSync(existing.file).equals(before));
  assert.equal(fs.existsSync(existing.backup), false);

  const fresh = setup();
  const f = fresh.run('--dry-run');
  assert.equal(f.status, 0, f.stderr);
  assert.equal(fs.existsSync(path.join(fresh.home, '.claude')), false, 'a dry run creates no directory');
});

test('a real run keeps the original in one backup, and a second run changes nothing', () => {
  const { file, backup, run } = setup('{"model":"x"}\n');
  const original = fs.readFileSync(file);
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.ok(fs.readFileSync(backup).equals(original), 'the backup is the file as it was');
  assert.ok(JSON.parse(fs.readFileSync(file, 'utf8')).hooks, 'the hooks were added');
  const after = fs.readFileSync(file);
  const second = run();
  assert.match(second.stdout, /unchanged/);
  assert.ok(fs.readFileSync(file).equals(after));
  assert.ok(fs.readFileSync(backup).equals(original), 'the backup is never overwritten');
});
