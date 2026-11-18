// install-hooks.mjs and install.mjs as a user runs them: what it refuses to
// touch, what a dry run leaves alone, and what each installer edge answers.

import { cleanEnv, tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { install, uninstall } from '../scripts/install.mjs';
import { plural } from '../scripts/doctor.mjs';
import { miniRoot, quiet } from './mini-root.mjs';
import { present, standsFor } from './links.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALL = path.join(ROOT, 'scripts', 'install-hooks.mjs');

function setup(settings) {
  const home = tmpDir('do-it-inst-');
  const file = path.join(home, '.claude', 'settings.json');
  if (settings !== undefined) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, settings);
  }
  const run = (...args) => spawnSync('node', [INSTALL, 'claude', ...args], { encoding: 'utf8', env: cleanEnv({}, home) });
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

test('a settings.json starting with a BOM is reported as a BOM, not as comments', () => {
  const { file, backup, run } = setup('\uFEFF{"model":"x"}\n');
  const before = fs.readFileSync(file);
  const r = run();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /byte-order mark \(BOM\)/);
  assert.doesNotMatch(r.stderr, /comments/);
  assert.ok(fs.readFileSync(file).equals(before), 'the file is untouched');
  assert.equal(fs.existsSync(backup), false, 'no backup is taken for a file that was not changed');
});

// ---- install.mjs: the root, uninstall(), and the hook steps ----

const opencodeConfig = (home) => path.join(home, '.config', 'opencode', 'opencode.json');

// Run `fn` with one environment variable set, then put the environment back.
function withEnv(name, value, fn) {
  const before = process.env[name];
  process.env[name] = value;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env[name];
    else process.env[name] = before;
  }
}

test('DO_IT_HOME moves the root, and an explicit root still wins', () => {
  const fromEnv = miniRoot();
  const named = miniRoot();
  withEnv('DO_IT_HOME', fromEnv, () => {
    const home = tmpDir('do-it-home-');
    quiet(() => install({ home, hooks: false }));
    assert.ok(standsFor(path.join(home, '.claude', 'skills', 'a-it'), path.join(fromEnv, 'skills', 'a-it')), 'the environment moved the root');

    const other = tmpDir('do-it-home-');
    quiet(() => install({ root: named, home: other, hooks: false }));
    assert.ok(standsFor(path.join(other, '.claude', 'skills', 'a-it'), path.join(named, 'skills', 'a-it')), 'an explicit root wins');
  });
});

test('a relative DO_IT_HOME still makes absolute link targets', () => {
  const root = miniRoot();
  const home = tmpDir('do-it-home-');
  const cwd = process.cwd();
  // The environment names the checkout by its directory name alone, so a
  // root left relative would place a link target inside the link's directory.
  process.chdir(path.dirname(root));
  try {
    withEnv('DO_IT_HOME', path.basename(root), () => quiet(() => install({ home, hooks: false })));
  } finally {
    process.chdir(cwd);
  }
  const link = path.join(home, '.claude', 'skills', 'a-it');
  assert.ok(standsFor(link, path.join(root, 'skills', 'a-it')), 'the link points at the checkout, not at a path beside itself');
  assert.ok(fs.existsSync(path.join(link, 'SKILL.md')), 'the skill is reachable through the link');
});

test('uninstall() stands alone, and install({ uninstall: true }) still dispatches to it', () => {
  const root = miniRoot();
  const alone = tmpDir('do-it-home-');
  quiet(() => install({ root, home: alone, hooks: false }));
  assert.equal(quiet(() => uninstall({ root, home: alone, hooks: false })), 0);
  assert.equal(present(path.join(alone, '.claude', 'skills', 'a-it')), false, 'the links are gone');

  const flag = tmpDir('do-it-home-');
  quiet(() => install({ root, home: flag, hooks: false }));
  assert.equal(quiet(() => install({ root, home: flag, hooks: false, uninstall: true })), 0);
  assert.equal(present(path.join(flag, '.claude', 'skills', 'a-it')), false, 'the option still removes');
});

test('a commented settings.json fails the Claude removal and the OpenCode hooks are still removed', () => {
  const root = miniRoot();
  const home = tmpDir('do-it-home-');
  quiet(() => install({ root, home }));
  const settings = path.join(home, '.claude', 'settings.json');
  const broken = '// my settings\n{ "model": "x" }\n';
  fs.writeFileSync(settings, broken);
  const code = quiet(() => install({ root, home, uninstall: true }));
  assert.equal(code, 1, 'the Claude failure is the exit code');
  assert.equal(fs.readFileSync(settings, 'utf8'), broken, 'the refused file is untouched');
  assert.deepEqual(JSON.parse(fs.readFileSync(opencodeConfig(home), 'utf8')), {}, 'the OpenCode hooks were removed');
});

test('a commented settings.json fails the Claude install and the OpenCode hooks are still registered', () => {
  const root = miniRoot();
  const home = tmpDir('do-it-home-');
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '// keep\n{ "model": "x" }\n');
  // The fixture has no hook script, so the step falls back to this checkout's;
  // the split from the linked root is reported.
  const notes = [];
  const err = console.error;
  console.error = (...a) => notes.push(a.join(' '));
  let code;
  try {
    code = quiet(() => install({ root, home }));
  } finally {
    console.error = err;
  }
  assert.equal(code, 1, 'the Claude failure is the exit code');
  assert.match(notes.join('\n'), /has no scripts\/install-hooks\.mjs; hooks come from/);
  const config = JSON.parse(fs.readFileSync(opencodeConfig(home), 'utf8'));
  assert.ok(config.plugin ?? config.plugins, 'the OpenCode hooks were registered');
});

test('one plural helper: the commit count keeps its singular word', () => {
  assert.equal(plural(1, 'commit', 'commits'), '1 commit');
  assert.equal(plural(2, 'commit', 'commits'), '2 commits');
});

// ---- install-hooks.mjs: which OpenCode form, and where the answer came from ----

// No `opencode` on PATH, so `opencode --version` cannot answer.
const opencodeRun = (home) => spawnSync(process.execPath, [INSTALL, 'opencode'], { encoding: 'utf8', env: cleanEnv({ PATH: tmpDir('do-it-nopath-') }, home) });
const opencodeFile = (home) => path.join(home, '.config', 'opencode', 'opencode.json');

test("with no version to ask, the config's plugins key names the OpenCode 2 form", () => {
  const home = tmpDir('do-it-inst-');
  fs.mkdirSync(path.join(home, '.config', 'opencode'), { recursive: true });
  fs.writeFileSync(opencodeFile(home), JSON.stringify({ plugins: ['other'] }));
  const r = opencodeRun(home);
  assert.equal(r.status, 0, r.stderr);
  const config = JSON.parse(fs.readFileSync(opencodeFile(home), 'utf8'));
  assert.equal(config.plugin, undefined, 'no v1 key beside the v2 one');
  assert.equal(config.plugins[0], 'other');
  assert.match(config.plugins[1], /do-it-plugin$/);
  assert.match(r.stderr, /"plugins" key names the OpenCode 2 form/);
});

test('with no version and no config key, the guessed form is reported', () => {
  const home = tmpDir('do-it-inst-');
  const r = opencodeRun(home);
  assert.equal(r.status, 0, r.stderr);
  const config = JSON.parse(fs.readFileSync(opencodeFile(home), 'utf8'));
  assert.match(config.plugin[0], /do-it-plugin[\\/]do-it\.mjs$/);
  assert.equal(config.plugins, undefined, 'the guess writes the v1 key alone');
  assert.match(r.stderr, /guessing the OpenCode 1 form/);
});

// An `opencode` on PATH that reports a version, and nothing else: npm installs
// it as opencode.cmd on Windows, which a bare spawn never finds.
function fakeOpencode(answer) {
  const bin = tmpDir('do-it-opencode-bin-');
  if (process.platform === 'win32') fs.writeFileSync(path.join(bin, 'opencode.cmd'), `@echo ${answer}\r\n`);
  else fs.writeFileSync(path.join(bin, 'opencode'), `#!/bin/sh\necho ${answer}\n`, { mode: 0o755 });
  return bin;
}

const opencodeRunWith = (home, bin) =>
  spawnSync(process.execPath, [INSTALL, 'opencode'], { encoding: 'utf8', env: cleanEnv({ PATH: `${bin}${path.delimiter}${process.env.PATH}` }, home) });

test('a version on PATH decides the form, and no note is printed', () => {
  const home = tmpDir('do-it-inst-');
  const r = opencodeRunWith(home, fakeOpencode('2.3.0'));
  assert.equal(r.status, 0, r.stderr);
  const config = JSON.parse(fs.readFileSync(opencodeFile(home), 'utf8'));
  assert.match(config.plugins[0], /do-it-plugin$/);
  assert.equal(config.plugin, undefined, 'the v2 key alone');
  assert.doesNotMatch(r.stderr, /OpenCode/, 'the form was named by the version, not read from the config');
});

test('a v1 host on PATH keeps the v1 form, and another tool\'s v2 entry stays put', () => {
  const home = tmpDir('do-it-inst-');
  fs.mkdirSync(path.join(home, '.config', 'opencode'), { recursive: true });
  fs.writeFileSync(opencodeFile(home), JSON.stringify({ plugins: ['other'] }));
  const r = opencodeRunWith(home, fakeOpencode('1.19.5'));
  assert.equal(r.status, 0, r.stderr);
  const config = JSON.parse(fs.readFileSync(opencodeFile(home), 'utf8'));
  assert.match(config.plugin[0], /do-it-plugin[\\/]do-it\.mjs$/);
  assert.deepEqual(config.plugins, ['other'], 'an entry that is not ours is left alone');
});


