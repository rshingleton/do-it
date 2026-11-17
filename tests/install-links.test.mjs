// install.mjs: the link plan, the symlink to junction to copy fallback, the
// manifest of copies, and the CLI a user runs.

import { cleanEnv, tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planLinks, place, install } from '../scripts/install.mjs';
import { present } from './links.mjs';
import { eperm, miniRoot, quiet } from './mini-root.mjs';
import { gitOut } from '../skills/do-it/scripts/git.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'scripts', 'install.mjs');

// Symlinks refused, junctions allowed: a Windows account without Developer Mode.
const noSymlinks = {
  ...fs,
  symlinkSync: (s, d, t) => {
    if (t === 'junction') return fs.symlinkSync(s, d, t);
    throw eperm();
  },
};

test('planLinks lists skills for both hosts, agents and the OpenCode files, and nothing else', () => {
  const root = miniRoot();
  fs.mkdirSync(path.join(root, '.opencode', 'commands'), { recursive: true });
  fs.writeFileSync(path.join(root, '.opencode', 'commands', 'c.md'), 'c');
  const home = path.join(tmpDir(), 'h');
  const got = planLinks(root, home).map((l) => [path.relative(home, l.dst).split(path.sep).join('/'), l.kind]);
  assert.deepEqual(got, [
    ['.claude/skills/a-it', 'dir'],
    ['.agents/skills/a-it', 'dir'],
    ['.claude/agents/x.md', 'file'],
    ['.config/opencode/commands/c.md', 'file'],
  ]);
});

test('place falls back from a refused symlink: junction for a directory on Windows, copy for a file', () => {
  const root = miniRoot();
  const out = tmpDir();
  const refuse = { ...fs, symlinkSync: () => { throw eperm(); } };
  assert.equal(place(path.join(root, 'agents', 'x.md'), path.join(out, 'x.md'), { fs: refuse, platform: 'linux' }), 'copy');
  assert.equal(fs.readFileSync(path.join(out, 'x.md'), 'utf8'), 'v1');
  const types = [];
  const record = { ...fs, symlinkSync: (s, d, t) => { types.push(t); if (t !== 'junction') throw eperm(); } };
  assert.equal(place(path.join(root, 'skills', 'a-it'), path.join(out, 'a-it'), { fs: record, platform: 'win32' }), 'junction');
  assert.deepEqual(types, ['dir', 'junction']);
  assert.throws(() => place(path.join(root, 'skills', 'a-it'), path.join(out, 'b'), { fs: refuse, platform: 'linux' }), { code: 'EPERM' });
});

test('with symlinks refused: copies are in the manifest, refreshed on change, and uninstall removes exactly them', { skip: process.platform !== 'win32' && 'a junction fallback needs Windows' }, () => {
  const root = miniRoot();
  const home = tmpDir('do-it-home-');
  const opts = { root, home, hooks: false, placeFs: noSymlinks };
  const manifest = path.join(home, '.claude', 'do-it', 'install.json');
  const agent = path.join(home, '.claude', 'agents', 'x.md');
  quiet(() => install(opts));
  assert.equal(fs.readFileSync(agent, 'utf8'), 'v1');
  assert.deepEqual(JSON.parse(fs.readFileSync(manifest, 'utf8')).copies.map((c) => c.dst), [agent]);
  assert.ok(fs.existsSync(path.join(home, '.claude', 'skills', 'a-it', 'SKILL.md')), 'the directory is reachable through its junction');

  fs.writeFileSync(path.join(root, 'agents', 'x.md'), 'v2');
  quiet(() => install(opts));
  assert.equal(fs.readFileSync(agent, 'utf8'), 'v2', 'a changed source refreshes the copy');

  const mine = path.join(home, '.claude', 'agents', 'mine.md');
  fs.writeFileSync(mine, 'user');
  quiet(() => install({ ...opts, uninstall: true }));
  assert.equal(present(agent), false);
  assert.equal(present(manifest), false, 'no manifest once nothing is copied');
  assert.equal(fs.readFileSync(mine, 'utf8'), 'user', 'a user file is left alone');
  assert.equal(present(path.join(home, '.claude', 'skills', 'a-it')), false);
  assert.ok(fs.existsSync(path.join(root, 'skills', 'a-it', 'SKILL.md')), 'uninstall never follows a link into the checkout');
});

test('a user file at a target is skipped without --force and replaced with it; an edited copy is left alone', () => {
  const root = miniRoot();
  const home = tmpDir('do-it-home-');
  const agent = path.join(home, '.claude', 'agents', 'x.md');
  fs.mkdirSync(path.dirname(agent), { recursive: true });
  fs.writeFileSync(agent, 'user');
  // Files fall back to a copy; directories link as the platform allows.
  const placeFs = { ...fs, symlinkSync: (s, d, t) => (t === 'file' ? (() => { throw eperm(); })() : fs.symlinkSync(s, d, t)) };
  const opts = { root, home, hooks: false, placeFs };
  quiet(() => install(opts));
  assert.equal(fs.readFileSync(agent, 'utf8'), 'user');
  assert.equal(present(path.join(home, '.claude', 'do-it', 'install.json')), false, 'nothing was copied');
  quiet(() => install({ ...opts, force: true }));
  assert.equal(fs.readFileSync(agent, 'utf8'), 'v1');
  fs.writeFileSync(agent, 'edited');
  fs.writeFileSync(path.join(root, 'agents', 'x.md'), 'v2');
  quiet(() => install(opts));
  assert.equal(fs.readFileSync(agent, 'utf8'), 'edited');
  quiet(() => install({ ...opts, uninstall: true }));
  assert.equal(fs.readFileSync(agent, 'utf8'), 'edited', 'uninstall leaves an edited copy');
});

test('--dry-run writes nothing, and an unknown option exits 2 as install.sh did', () => {
  const home = tmpDir('do-it-home-');
  const run = (...a) => spawnSync('node', [CLI, ...a], { encoding: 'utf8', env: cleanEnv({}, home) });
  const dry = run('--dry-run', '--no-hooks');
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /^link  /m);
  assert.deepEqual(fs.readdirSync(home), [], 'a dry run creates nothing');
  const bad = run('--nope');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unknown option: --nope/);
});

test('a real run into a temp home then --uninstall leaves no do-it links or files', () => {
  const home = tmpDir('do-it-home-');
  const run = (...a) => spawnSync('node', [CLI, ...a], { encoding: 'utf8', env: cleanEnv({}, home) });
  const up = run();
  assert.equal(up.status, 0, up.stderr);
  const down = run('--uninstall');
  assert.equal(down.status, 0, down.stderr);
  const left = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isSymbolicLink() || e.isFile()) left.push(path.relative(home, p));
      else walk(p);
    }
  };
  walk(home);
  // The two host config files stay, emptied of our entries; their backups are the user's originals.
  const configs = [path.join('.claude', 'settings.json'), path.join('.config', 'opencode', 'opencode.json')];
  for (const c of configs) assert.deepEqual(JSON.parse(fs.readFileSync(path.join(home, c), 'utf8')), {}, c);
  assert.deepEqual(left.filter((p) => !/\.bak-do-it$/.test(p) && !configs.includes(p)), [], 'no other files or links remain');
});

test('an install into the current home leaves OpenCode runtime data alone', () => {
  const root = miniRoot();
  const home = os.homedir(); // tests/env.mjs points this at the temp home
  const db = path.join(home, '.local', 'share', 'opencode', 'opencode.db');
  fs.mkdirSync(path.dirname(db), { recursive: true });
  fs.writeFileSync(db, 'saved account');
  const code = quiet(() => install({ root, home }));
  assert.equal(code, 0);
  assert.equal(fs.readFileSync(db, 'utf8'), 'saved account', 'an install must never delete the live OpenCode database');
});

test('an uninstall with hooks off runs no hook step, so no host config is touched', () => {
  const home = tmpDir('do-it-home-');
  const root = miniRoot();
  const up = quiet(() => install({ root, home, hooks: false }));
  assert.equal(up, 0);
  const { code, lines } = quiet(() => {
    const said = [];
    const log = console.log;
    console.log = (...a) => said.push(a.join(' '));
    try {
      return { code: install({ root, home, hooks: false, uninstall: true }), lines: said };
    } finally {
      console.log = log;
    }
  });
  assert.equal(code, 0);
  assert.deepEqual(lines.filter((l) => /settings\.json|opencode\.json/.test(l)), [], 'the hook step did not run');
});

test('a home other than the real one carries into the hook step, so the host config lands there', () => {
  const home = tmpDir('do-it-home-');
  const root = miniRoot();
  const runtime = path.join(home, '.local', 'share', 'opencode');
  const code = quiet(() => install({ root, home }));
  assert.equal(code, 0);
  const settings = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'));
  assert.ok(Object.keys(settings.hooks ?? {}).length > 0, 'the hooks were written into the temporary home');
  assert.equal(present(runtime), false, 'runtime dirs the hooks created there are still cleared');
});

// ---- The checkout's ref in the install's closing line ----

// A one-skill checkout pushed to a bare remote, and a clone of it: the clone is
// the checkout the installer runs from, so its ref is the one the line reports.
function checkout() {
  const seed = tmpDir('do-it-seed-');
  const remote = tmpDir('do-it-ref-remote-');
  gitOut(seed, ['init', '-q', '-b', 'main']);
  gitOut(seed, ['config', 'user.name', 't']);
  gitOut(seed, ['config', 'user.email', 't@t']);
  gitOut(seed, ['config', 'commit.gpgsign', 'false']);
  fs.mkdirSync(path.join(seed, 'skills', 'a-it'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'skills', 'a-it', 'SKILL.md'), 'a');
  gitOut(seed, ['add', '-A']);
  gitOut(seed, ['commit', '-qm', 'init']);
  gitOut(remote, ['init', '-q', '--bare', '-b', 'main']);
  gitOut(seed, ['remote', 'add', 'origin', remote]);
  gitOut(seed, ['push', '-q', 'origin', 'main']);
  const root = path.join(tmpDir('do-it-ref-clone-'), 'repo');
  gitOut(path.dirname(root), ['clone', '-q', remote, root]);
  gitOut(root, ['config', 'user.name', 't']);
  gitOut(root, ['config', 'user.email', 't@t']);
  gitOut(root, ['config', 'commit.gpgsign', 'false']);
  return { seed, remote, root };
}

// What an install printed, and the code it returned.
function printed(fn) {
  const lines = [];
  const log = console.log;
  console.log = (...a) => lines.push(a.join(' '));
  try {
    return { code: fn(), lines };
  } finally {
    console.log = log;
  }
}

const refLine = (lines) => lines.find((l) => /^(would )?(installed|install) from .* at [0-9a-f]{7,} \(/.test(l)) ?? '';
const shortSha = (root) => gitOut(root, ['rev-parse', '--short', 'HEAD']).trim();

test('an install from a checkout behind its remote ends with the sha, the branch and 1 commit behind, and moves nothing', () => {
  const { seed, remote, root } = checkout();
  const home = tmpDir('do-it-home-');
  // The remote moves one commit on; the clone has fetched, so the count is read
  // from its own refs. The installer must not go near the network itself.
  fs.writeFileSync(path.join(seed, 'a.txt'), 'two\n');
  gitOut(seed, ['add', '-A']);
  gitOut(seed, ['commit', '-qm', 'second']);
  gitOut(seed, ['push', '-q', 'origin', 'main']);
  gitOut(root, ['fetch', '-q']);
  const fetchHead = path.join(root, '.git', 'FETCH_HEAD');
  const before = {
    head: gitOut(root, ['rev-parse', 'HEAD']),
    branch: gitOut(root, ['branch', '--show-current']),
    fetched: fs.readFileSync(fetchHead),
    refs: gitOut(remote, ['for-each-ref']),
  };

  const { code, lines } = printed(() => install({ root, home, hooks: false }));
  assert.equal(code, 0);
  assert.equal(refLine(lines), `installed from ${root} at ${shortSha(root)} (main), 1 commit behind origin/main; last fetch just now`);
  assert.equal(lines.at(-1), refLine(lines), 'the ref line is the last thing an install prints');

  assert.equal(gitOut(root, ['rev-parse', 'HEAD']), before.head, 'HEAD is where it was');
  assert.equal(gitOut(root, ['branch', '--show-current']), before.branch, 'the branch is where it was');
  assert.deepEqual(fs.readFileSync(fetchHead), before.fetched, 'no fetch moved FETCH_HEAD');
  assert.equal(gitOut(remote, ['for-each-ref']), before.refs, 'the remote is where it was');
});

test('a checkout level with its remote says up to date, and a dry run prefixes the line with would', () => {
  const { root } = checkout();
  const home = tmpDir('do-it-home-');
  const real = printed(() => install({ root, home, hooks: false }));
  assert.equal(real.code, 0);
  assert.equal(refLine(real.lines), `installed from ${root} at ${shortSha(root)} (main), up to date with origin/main; never fetched`);

  const dryHome = tmpDir('do-it-home-');
  const dry = printed(() => install({ root, home: dryHome, hooks: false, dry: true }));
  assert.equal(dry.code, 0);
  assert.equal(refLine(dry.lines), `would install from ${root} at ${shortSha(root)} (main), up to date with origin/main; never fetched`);
  assert.deepEqual(fs.readdirSync(dryHome), [], 'a dry run creates nothing');
});

test('a run whose hooks fail still prints the ref line, because it prints before them', () => {
  const { root } = checkout();
  const home = tmpDir('do-it-home-');
  // A settings file the hooks step refuses: claude returns 1, so the installer
  // returns before its own last statement. A line printed after the hooks block
  // would never appear.
  // The hook step now follows the install home, so the broken file that makes
  // it fail is the one in that home.
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '{ not json');
  const out = printed(() => install({ root, home, hooks: true }));
  assert.equal(out.code, 1, 'the hook failure is still the exit code');
  assert.equal(refLine(out.lines), `installed from ${root} at ${shortSha(root)} (main), up to date with origin/main; never fetched`);
});

test('a checkout that is not a git repository installs as before, with no ref line', () => {
  const root = miniRoot();
  const home = tmpDir('do-it-home-');
  const { code, lines } = printed(() => install({ root, home, hooks: false }));
  assert.equal(code, 0);
  assert.equal(refLine(lines), '', 'no ref line without a repository');
  assert.equal(lines.at(-1), `do-it installed from ${root}`);
});

test('an install on a machine where git cannot answer prints no ref line and still succeeds', () => {
  const home = tmpDir('do-it-home-');
  const noGit = tmpDir('do-it-nogit-path-');
  const r = spawnSync(process.execPath, [CLI, '--dry-run', '--no-hooks'], { encoding: 'utf8', env: cleanEnv({ PATH: noGit }, home) });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /installed from .* at [0-9a-f]{7}/, r.stdout);
  assert.equal(r.stdout.trim().split('\n').at(-1), `do-it installed from ${ROOT}`);
});
