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
import { sameTarget } from '../scripts/lib/install-state.mjs';
import { linkDir, present, standsFor } from './links.mjs';
import { clone, eperm, miniRoot, quiet, seed } from './mini-root.mjs';
import { gitOut } from '../skills/do-it/scripts/git.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'scripts', 'install.mjs');

test('a default install turns a link into a copy, and --link turns the copy back', () => {
  const root = miniRoot();
  const home = tmpDir('do-it-home-');
  const skill = path.join(home, '.claude', 'skills', 'a-it');
  quiet(() => install({ root, home, hooks: false, link: true }));
  assert.equal(fs.lstatSync(skill).isSymbolicLink(), true, '--link installs a link');
  quiet(() => install({ root, home, hooks: false }));
  assert.equal(fs.lstatSync(skill).isSymbolicLink(), false, 'a default install replaces our link with a copy');
  assert.equal(fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8'), 'a');
  quiet(() => install({ root, home, hooks: false, link: true }));
  assert.equal(fs.lstatSync(skill).isSymbolicLink(), true, '--link turns our copy back into a link');
});

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

test('place copies by default; with link it falls back from a refused symlink: junction for a directory on Windows, copy for a file', () => {
  const root = miniRoot();
  const out = tmpDir();
  // Copying is the default: nothing is linked, so nothing can be refused.
  assert.equal(place(path.join(root, 'skills', 'a-it'), path.join(out, 'd'), {}), 'copy');
  assert.equal(fs.lstatSync(path.join(out, 'd')).isSymbolicLink(), false, 'the directory is a real directory');
  assert.equal(fs.readFileSync(path.join(out, 'd', 'SKILL.md'), 'utf8'), 'a', 'its contents came across whole');
  assert.equal(place(path.join(root, 'agents', 'x.md'), path.join(out, 'x.md'), {}), 'copy');

  const refuse = { ...fs, symlinkSync: () => { throw eperm(); } };
  assert.equal(place(path.join(root, 'agents', 'x.md'), path.join(out, 'y.md'), { fs: refuse, platform: 'linux', link: true }), 'copy');
  assert.equal(fs.readFileSync(path.join(out, 'y.md'), 'utf8'), 'v1');
  const types = [];
  const record = { ...fs, symlinkSync: (s, d, t) => { types.push(t); if (t !== 'junction') throw eperm(); } };
  assert.equal(place(path.join(root, 'skills', 'a-it'), path.join(out, 'a-it'), { fs: record, platform: 'win32', link: true }), 'junction');
  assert.deepEqual(types, ['dir', 'junction']);
  assert.throws(() => place(path.join(root, 'skills', 'a-it'), path.join(out, 'b'), { fs: refuse, platform: 'linux', link: true }), { code: 'EPERM' });
});

test('the installer folds case only where the filesystem does, so a POSIX pair differing by case is two paths', { skip: process.platform === 'win32' && 'a Windows filesystem folds case' }, () => {
  assert.equal(sameTarget('/tmp/A', '/tmp/a'), false);
});

test('an install copies skills and files, records both in the manifest, refreshes a changed source, and uninstall removes exactly them', () => {
  const root = miniRoot();
  const home = tmpDir('do-it-home-');
  const opts = { root, home, hooks: false };
  const manifest = path.join(home, '.claude', 'do-it', 'install.json');
  const agent = path.join(home, '.claude', 'agents', 'x.md');
  const skill = path.join(home, '.claude', 'skills', 'a-it');
  quiet(() => install(opts));
  assert.equal(fs.readFileSync(agent, 'utf8'), 'v1');
  assert.equal(fs.lstatSync(skill).isSymbolicLink(), false, 'the skill is a real directory, not a link into the checkout');
  const copies = JSON.parse(fs.readFileSync(manifest, 'utf8')).copies;
  assert.deepEqual(copies.map((c) => [path.relative(home, c.dst).split(path.sep).join('/'), c.kind ?? 'file']).sort(), [
    ['.agents/skills/a-it', 'dir'],
    ['.claude/agents/x.md', 'file'],
    ['.claude/skills/a-it', 'dir'],
  ]);

  fs.writeFileSync(path.join(root, 'agents', 'x.md'), 'v2');
  fs.writeFileSync(path.join(root, 'skills', 'a-it', 'SKILL.md'), 'b');
  quiet(() => install(opts));
  assert.equal(fs.readFileSync(agent, 'utf8'), 'v2', 'a changed file source refreshes the copy');
  assert.equal(fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8'), 'b', 'a changed skill source refreshes the copy');

  const mine = path.join(home, '.claude', 'agents', 'mine.md');
  fs.writeFileSync(mine, 'user');
  quiet(() => install({ ...opts, uninstall: true }));
  assert.equal(present(agent), false);
  assert.equal(present(skill), false, 'the copied skill is removed with the rest');
  assert.equal(present(manifest), false, 'no manifest once nothing is copied');
  assert.equal(fs.readFileSync(mine, 'utf8'), 'user', 'a user file is left alone');
  assert.ok(fs.existsSync(path.join(root, 'skills', 'a-it', 'SKILL.md')), 'uninstall never touches the checkout');
});

test('an edited directory copy is left alone on a re-run and on uninstall', () => {
  const root = miniRoot();
  const home = tmpDir('do-it-home-');
  const opts = { root, home, hooks: false };
  const skill = path.join(home, '.claude', 'skills', 'a-it');
  quiet(() => install(opts));
  fs.writeFileSync(path.join(skill, 'SKILL.md'), 'mine');
  fs.writeFileSync(path.join(root, 'skills', 'a-it', 'SKILL.md'), 'b');
  quiet(() => install(opts));
  assert.equal(fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8'), 'mine', 'an edited copy is not overwritten');
  quiet(() => install({ ...opts, uninstall: true }));
  assert.equal(fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8'), 'mine', 'uninstall leaves an edited copy');
});

test('--link does not replace an edited copy without --force', () => {
  const root = miniRoot();
  const home = tmpDir('do-it-home-');
  const skill = path.join(home, '.claude', 'skills', 'a-it');
  quiet(() => install({ root, home, hooks: false }));
  fs.writeFileSync(path.join(skill, 'SKILL.md'), 'mine');
  quiet(() => install({ root, home, hooks: false, link: true }));
  assert.equal(fs.lstatSync(skill).isSymbolicLink(), false, 'the edited copy is kept');
  assert.equal(fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8'), 'mine');
  quiet(() => install({ root, home, hooks: false, link: true, force: true }));
  assert.equal(fs.lstatSync(skill).isSymbolicLink(), true, '--force replaces it with the link');
});

test('--force removes an orphaned copy the user edited', () => {
  const root = miniRoot();
  fs.mkdirSync(path.join(root, 'skills', 'b-it'));
  fs.writeFileSync(path.join(root, 'skills', 'b-it', 'SKILL.md'), 'b');
  const home = tmpDir('do-it-home-');
  const opts = { root, home, hooks: false };
  quiet(() => install(opts));
  const b = path.join(home, '.claude', 'skills', 'b-it');
  fs.writeFileSync(path.join(b, 'SKILL.md'), 'mine');
  fs.rmSync(path.join(root, 'skills', 'b-it'), { recursive: true, force: true });
  quiet(() => install(opts));
  assert.equal(fs.readFileSync(path.join(b, 'SKILL.md'), 'utf8'), 'mine', 'edited and orphaned: left without --force');
  quiet(() => install({ ...opts, force: true }));
  assert.equal(present(b), false, '--force removes it');
});

test('a copy the skills CLI recorded is left alone and never recorded', () => {
  const root = miniRoot();
  const home = tmpDir('do-it-home-');
  const cli = path.join(home, '.agents', 'skills', 'a-it');
  const claude = path.join(home, '.claude', 'skills', 'a-it');
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.cpSync(path.join(root, 'skills', 'a-it'), cli, { recursive: true });
  fs.writeFileSync(
    path.join(home, '.agents', '.skill-lock.json'),
    JSON.stringify({ version: 3, skills: { 'a-it': { source: 'somewhere' } } }),
  );
  quiet(() => install({ root, home, hooks: false }));
  const manifest = path.join(home, '.claude', 'do-it', 'install.json');
  const recorded = JSON.parse(fs.readFileSync(manifest, 'utf8')).copies.map((c) => c.dst);
  assert.equal(recorded.includes(cli), false, 'the CLI copy is not recorded as ours');
  assert.equal(recorded.includes(claude), true, 'the same skill name in another folder is ours to install');
  assert.equal(fs.readFileSync(path.join(cli, 'SKILL.md'), 'utf8'), 'a', 'and it is left in place');
  quiet(() => install({ root, home, hooks: false, force: true }));
  assert.equal(fs.readFileSync(path.join(cli, 'SKILL.md'), 'utf8'), 'a', '--force does not take another route’s copy either');
  quiet(() => install({ root, home, hooks: false, uninstall: true }));
  assert.equal(present(cli), true, 'uninstall leaves another route’s copy alone');
});

test('a link that is not ours is left alone and not recorded', () => {
  const root = miniRoot();
  const other = tmpDir('do-it-else-');
  fs.mkdirSync(path.join(other, 'skills', 'a-it'), { recursive: true });
  fs.writeFileSync(path.join(other, 'skills', 'a-it', 'SKILL.md'), 'a');
  const home = tmpDir('do-it-home-');
  const dst = path.join(home, '.claude', 'skills', 'a-it');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  linkDir(path.join(other, 'skills', 'a-it'), dst);
  quiet(() => install({ root, home, hooks: false }));
  assert.equal(fs.lstatSync(dst).isSymbolicLink(), true, 'the foreign link stays a link');
  const manifest = path.join(home, '.claude', 'do-it', 'install.json');
  const recorded = JSON.parse(fs.readFileSync(manifest, 'utf8')).copies.map((c) => c.dst);
  assert.equal(recorded.includes(dst), false, 'and it is not recorded as ours');
});

test('a record whose entry vanished is dropped on the next run', () => {
  const root = miniRoot();
  fs.mkdirSync(path.join(root, 'skills', 'b-it'));
  fs.writeFileSync(path.join(root, 'skills', 'b-it', 'SKILL.md'), 'b');
  const home = tmpDir('do-it-home-');
  const opts = { root, home, hooks: false };
  const manifest = path.join(home, '.claude', 'do-it', 'install.json');
  quiet(() => install(opts));
  const b = path.join(home, '.claude', 'skills', 'b-it');
  fs.rmSync(b, { recursive: true, force: true });
  fs.rmSync(path.join(root, 'skills', 'b-it'), { recursive: true, force: true });
  quiet(() => install(opts));
  const recorded = JSON.parse(fs.readFileSync(manifest, 'utf8')).copies.map((c) => c.dst);
  assert.equal(recorded.includes(b), false, 'the record went with the entry');
});

test('a recorded copy whose kind changed is kept without --force', () => {
  const root = miniRoot();
  const home = tmpDir('do-it-home-');
  const agent = path.join(home, '.claude', 'agents', 'x.md');
  quiet(() => install({ root, home, hooks: false }));
  fs.rmSync(agent);
  fs.mkdirSync(agent, { recursive: true });
  fs.writeFileSync(path.join(agent, 'user.txt'), 'mine');
  quiet(() => install({ root, home, hooks: false }));
  assert.equal(fs.readFileSync(path.join(agent, 'user.txt'), 'utf8'), 'mine', 'the user directory is left alone');
  quiet(() => install({ root, home, hooks: false, force: true }));
  assert.equal(fs.readFileSync(agent, 'utf8'), 'v1', '--force puts the recorded file back');
});

test('--link finishes an interrupted run, and still refuses another route', () => {
  const root = miniRoot();
  const home = tmpDir('do-it-home-');
  const agent = path.join(home, '.claude', 'agents', 'x.md');
  const cli = path.join(home, '.agents', 'skills', 'a-it');
  fs.mkdirSync(path.dirname(agent), { recursive: true });
  fs.mkdirSync(path.dirname(cli), { recursive: true });
  fs.copyFileSync(path.join(root, 'agents', 'x.md'), agent);
  fs.cpSync(path.join(root, 'skills', 'a-it'), cli, { recursive: true });
  fs.writeFileSync(
    path.join(home, '.agents', '.skill-lock.json'),
    JSON.stringify({ version: 3, skills: { 'a-it': {} } }),
  );

  quiet(() => install({ root, home, hooks: false, link: true }));
  assert.ok(standsFor(agent, path.join(root, 'agents', 'x.md')), 'an identical unrecorded copy is finished, not refused');
  assert.equal(fs.lstatSync(cli).isSymbolicLink(), false, 'the CLI copy stays a directory');

  quiet(() => install({ root, home, hooks: false, link: true, force: true }));
  assert.equal(fs.lstatSync(cli).isSymbolicLink(), false, 'the CLI copy stays a directory under --force');
  assert.equal(fs.readFileSync(path.join(cli, 'SKILL.md'), 'utf8'), 'a', 'and keeps its content');
});

test('a record for a copy the skills CLI now owns is dropped when its source goes', () => {
  const root = miniRoot();
  const home = tmpDir('do-it-home-');
  const opts = { root, home, hooks: false };
  quiet(() => install(opts));
  const dst = path.join(home, '.agents', 'skills', 'a-it');
  fs.writeFileSync(
    path.join(home, '.agents', '.skill-lock.json'),
    JSON.stringify({ version: 3, skills: { 'a-it': {} } }),
  );
  fs.rmSync(path.join(root, 'skills', 'a-it'), { recursive: true, force: true });
  quiet(() => install(opts));
  const manifest = path.join(home, '.claude', 'do-it', 'install.json');
  const recorded = JSON.parse(fs.readFileSync(manifest, 'utf8')).copies.map((c) => c.dst);
  assert.equal(recorded.includes(dst), false, 'the record goes when the route takes the copy');
});

test('a default run finishes an interrupted --link that left a link and its record', () => {
  const root = miniRoot();
  const home = tmpDir('do-it-home-');
  const skill = path.join(home, '.claude', 'skills', 'a-it');
  quiet(() => install({ root, home, hooks: false }));
  fs.rmSync(skill, { recursive: true, force: true });
  linkDir(path.join(root, 'skills', 'a-it'), skill);
  quiet(() => install({ root, home, hooks: false }));
  assert.equal(fs.lstatSync(skill).isSymbolicLink(), false, 'the link becomes the copy the record promised');
  assert.equal(fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8'), 'a');
});

test('an unrecorded copy that matches the source is adopted, not refused with --force', () => {
  const root = miniRoot();
  const home = tmpDir('do-it-home-');
  const skill = path.join(home, '.claude', 'skills', 'a-it');
  fs.mkdirSync(path.dirname(skill), { recursive: true });
  fs.cpSync(path.join(root, 'skills', 'a-it'), skill, { recursive: true });
  const manifest = path.join(home, '.claude', 'do-it', 'install.json');
  quiet(() => install({ root, home, hooks: false }));
  assert.equal(fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8'), 'a');
  const recorded = JSON.parse(fs.readFileSync(manifest, 'utf8')).copies.map((c) => c.dst);
  assert.ok(recorded.includes(skill), 'the identical copy was adopted into the manifest');
});

test('a user file at a target is skipped without --force and replaced with it; an edited copy is left alone', () => {
  const root = miniRoot();
  const home = tmpDir('do-it-home-');
  const agent = path.join(home, '.claude', 'agents', 'x.md');
  fs.mkdirSync(path.dirname(agent), { recursive: true });
  fs.writeFileSync(agent, 'user');
  const manifest = path.join(home, '.claude', 'do-it', 'install.json');
  const opts = { root, home, hooks: false };
  quiet(() => install(opts));
  assert.equal(fs.readFileSync(agent, 'utf8'), 'user');
  const recorded = JSON.parse(fs.readFileSync(manifest, 'utf8')).copies.map((c) => c.dst);
  assert.equal(recorded.includes(agent), false, 'a user file is not recorded as ours');
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
  assert.match(dry.stdout, /^copy  /m);
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

// The mini-root's seed and a clone of its remote: the clone is the checkout the
// installer runs from, so its ref is the one the line reports.
function checkout() {
  const { dir, remote } = seed();
  return { seed: dir, remote, root: clone(remote) };
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
  assert.equal(refLine(lines), `installed from ${root} at ${shortSha(root)} (main), 1 commit behind origin/main; fetched just now`);
  assert.equal(lines.at(-1), refLine(lines), 'the ref line is the last thing an install prints');

  assert.equal(gitOut(root, ['rev-parse', 'HEAD']), before.head, 'HEAD is where it was');
  assert.equal(gitOut(root, ['branch', '--show-current']), before.branch, 'the branch is where it was');
  assert.deepEqual(fs.readFileSync(fetchHead), before.fetched, 'no fetch moved FETCH_HEAD');
  assert.equal(gitOut(remote, ['for-each-ref']), before.refs, 'the remote is where it was');

  // Level with its remote: up to date, cloned and not yet fetched; a dry run says would and writes nothing.
  const level = checkout();
  const real = printed(() => install({ root: level.root, home: tmpDir('do-it-home-'), hooks: false }));
  assert.equal(real.code, 0);
  assert.equal(refLine(real.lines), `installed from ${level.root} at ${shortSha(level.root)} (main), up to date with origin/main; cloned, not yet fetched`);
  const dryHome = tmpDir('do-it-home-');
  const dry = printed(() => install({ root: level.root, home: dryHome, hooks: false, dry: true }));
  assert.equal(dry.code, 0);
  assert.equal(refLine(dry.lines), `would install from ${level.root} at ${shortSha(level.root)} (main), up to date with origin/main; cloned, not yet fetched`);
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
  assert.equal(refLine(out.lines), `installed from ${root} at ${shortSha(root)} (main), up to date with origin/main; cloned, not yet fetched`);
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
