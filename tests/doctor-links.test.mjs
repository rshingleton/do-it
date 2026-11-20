// doctor.mjs: the managed install read back against the checkout it came from.
// A copy in each state, a copy that drifted and one someone edited, the
// entries the installer did not make, and an unreadable manifest.

import { cleanEnv, tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { install } from '../scripts/install.mjs';
import { sameTarget, under, readManifestState } from '../scripts/lib/install-state.mjs';
import { miniRoot, quiet } from './mini-root.mjs';
import { linkDir } from './links.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'scripts', 'doctor.mjs');

// Install `root` into a fresh home, then run the doctor on it.
function fixture(opts = {}) {
  const root = miniRoot();
  const home = tmpDir('do-it-home-');
  quiet(() => install({ root, home, hooks: false, ...opts }));
  return { root, home };
}

const doctor = (home, root, ...args) =>
  spawnSync('node', [CLI, '--home', home, '--config-home', path.join(home, '.config'), '--root', root, ...args], {
    encoding: 'utf8',
    env: cleanEnv({}, home),
  });

// Remove an installed entry without following a link into what it points at: a
// link goes, and so does a copy, directory or file.
function unlink(at) {
  const st = fs.lstatSync(at, { throwIfNoEntry: false });
  if (!st) return;
  if (st.isSymbolicLink()) {
    try {
      fs.unlinkSync(at);
    } catch {
      fs.rmdirSync(at); // a junction on some Node/Windows builds
    }
    return;
  }
  fs.rmSync(at, { recursive: true, force: true });
}

const states = (out) => out.split('\n').map((line) => line.split(/\s/)[0]).filter(Boolean);

test('a clean install prints one ok line per entry and exits 0, in text and in --json', () => {
  const { root, home } = fixture();
  const r = doctor(home, root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(states(r.stdout), ['ok', 'ok', 'ok', 'summary'], r.stdout);
  assert.match(r.stdout, /^summary 3 entries: 3 ok$/m, r.stdout);

  const json = doctor(home, root, '--json');
  assert.equal(json.status, 0, json.stderr);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.findings.length, 3);
  assert.ok(parsed.findings.every((f) => f.state === 'ok'));
});

test('a missing link, a link to another checkout and a link to a renamed skill each report and exit 1', () => {
  const { root, home } = fixture();
  const other = tmpDir('do-it-else-');
  fs.mkdirSync(path.join(other, 'skills', 'a-it'), { recursive: true });

  unlink(path.join(home, '.agents', 'skills', 'a-it'));

  const foreign = path.join(home, '.claude', 'skills', 'a-it');
  unlink(foreign);
  linkDir(path.join(other, 'skills', 'a-it'), foreign);

  // A skill since renamed: the link is there, its target is gone.
  const renamed = path.join(home, '.claude', 'skills', 'renamed-it');
  linkDir(path.join(root, 'skills', 'renamed-it'), renamed);
  fs.rmSync(path.join(root, 'skills', 'renamed-it'), { recursive: true, force: true });

  const r = doctor(home, root);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /^missing\s+.*\.agents.*a-it/m, r.stdout);
  assert.match(r.stdout, /^foreign\s+.*\.claude.*a-it/m, r.stdout);
  assert.match(r.stdout, /^orphan\s+.*renamed-it.*is gone/m, r.stdout);
  assert.match(r.stdout, /^ok\s+.*x\.md/m, r.stdout);
});

test('a copy that drifted from its source and a copy someone edited are separate findings', () => {
  const { root, home } = fixture();
  const agent = path.join(home, '.claude', 'agents', 'x.md');
  assert.equal(fs.readFileSync(agent, 'utf8'), 'v1', 'the agent is a copy');
  assert.equal(doctor(home, root).status, 0);

  fs.writeFileSync(agent, 'edited');
  const edited = doctor(home, root);
  assert.equal(edited.status, 1, edited.stdout);
  assert.match(edited.stdout, /^edited copy\s+.*x\.md/m, edited.stdout);

  fs.writeFileSync(agent, 'v1');
  fs.writeFileSync(path.join(root, 'agents', 'x.md'), 'v2');
  const stale = doctor(home, root);
  assert.equal(stale.status, 1, stale.stdout);
  assert.match(stale.stdout, /^stale copy\s+.*x\.md/m, stale.stdout);
  assert.doesNotMatch(stale.stdout, /edited copy/);
});

test('a directory copy that drifted and one someone edited are separate findings', () => {
  const { root, home } = fixture();
  const skill = path.join(home, '.claude', 'skills', 'a-it');
  assert.equal(doctor(home, root).status, 0, 'the fresh copy is ok');

  fs.writeFileSync(path.join(skill, 'SKILL.md'), 'edited');
  const edited = doctor(home, root);
  assert.equal(edited.status, 1, edited.stdout);
  assert.match(edited.stdout, /^edited copy\s+.*a-it/m, edited.stdout);

  quiet(() => install({ root, home, hooks: false, force: true }));
  fs.writeFileSync(path.join(root, 'skills', 'a-it', 'SKILL.md'), 'b');
  const stale = doctor(home, root);
  assert.equal(stale.status, 1, stale.stdout);
  assert.match(stale.stdout, /^stale copy\s+.*a-it/m, stale.stdout);
  assert.doesNotMatch(stale.stdout, /edited copy/);
});

test('an empty untracked skill directory is not a skill, so it is never ok', () => {
  const root = miniRoot();
  fs.mkdirSync(path.join(root, 'skills', 'empty-it'));
  const home = tmpDir('do-it-home-');
  quiet(() => install({ root, home, hooks: false }));

  const r = doctor(home, root);
  assert.equal(r.status, 0, r.stdout);
  assert.equal(fs.existsSync(path.join(home, '.claude', 'skills', 'empty-it')), false, 'the plan leaves it out, so no link is placed');
  assert.doesNotMatch(r.stdout, /empty-it/, 'and the read-back cannot call it ok');
  assert.match(r.stdout, /^ok\s+.*a-it/m, 'the skill beside it still is');
});

test('the fix the doctor names prunes a link whose source is gone, so the next run is green', () => {
  const { root, home } = fixture();
  // A second skill keeps both managed skill directories on the plan, as a real
  // checkout has, so a link left at the removed name is still read back.
  fs.mkdirSync(path.join(root, 'skills', 'b-it'));
  fs.writeFileSync(path.join(root, 'skills', 'b-it', 'SKILL.md'), 'b');
  quiet(() => install({ root, home, hooks: false }));
  fs.rmSync(path.join(root, 'skills', 'a-it'), { recursive: true, force: true });

  const red = doctor(home, root);
  assert.equal(red.status, 1, red.stdout);
  assert.match(red.stdout, /^orphan\s+.*\.claude.*a-it.*is gone.*fix: node .*install\.mjs$/m, red.stdout);

  quiet(() => install({ root, home, hooks: false }));
  assert.equal(fs.existsSync(path.join(home, '.claude', 'skills', 'a-it')), false, 'the stale link is gone');

  const green = doctor(home, root);
  assert.equal(green.status, 0, green.stdout); // the skills that remain are ok
  assert.doesNotMatch(green.stdout, /orphan/);
});

test('a synced directory and another repo skill are counted in the summary, never listed', () => {
  const { root, home } = fixture();
  const synced = path.join(home, '.claude', 'skills', 'synced');
  fs.mkdirSync(synced, { recursive: true });
  fs.writeFileSync(path.join(synced, 'SKILL.md'), 's');
  linkDir(path.join(tmpDir('do-it-else-'), 'other-it'), path.join(home, '.claude', 'skills', 'other-it'));

  const r = doctor(home, root);
  assert.equal(r.status, 0, r.stdout);
  assert.doesNotMatch(r.stdout, /synced|other-it/);
  assert.match(r.stdout, /; 2 entries not ours \(left alone\)/, r.stdout);
});

test('an unreadable install.json is one finding naming the file, not an empty install', () => {
  const { root, home } = fixture();
  const manifest = path.join(home, '.claude', 'do-it', 'install.json');
  fs.mkdirSync(path.dirname(manifest), { recursive: true });
  fs.writeFileSync(manifest, '{"version": 1, "copies": [');

  const state = readManifestState(home);
  assert.deepEqual(state.copies, []);
  assert.ok(state.error, 'the reader tells an unreadable manifest from no copies');

  const r = doctor(home, root);
  assert.equal(r.status, 1, r.stdout);
  const named = r.stdout.split('\n').filter((line) => line.includes('install.json'));
  assert.equal(named.length, 1, r.stdout);
  assert.match(named[0], /^unreadable\s/, named[0]);
  assert.match(named[0], /delete .*install\.json/, named[0]);
  assert.match(named[0], /delete it, then run the installer with --force/, named[0]);
});

test('under treats a sibling directory with a shared prefix as outside, and folds the Windows separator and case', () => {
  const base = tmpDir('do-it-under-');
  assert.equal(under(path.join(base, 'a', 'b'), path.join(base, 'a')), true);
  assert.equal(under(path.join(base, 'ab'), path.join(base, 'a')), false);
  if (process.platform === 'win32') {
    assert.equal(under('C:\\Users\\X\\do-it\\skills\\a-it', 'c:/users/x/do-it/skills'), true);
    assert.equal(under('c:/users/x/do-it/skills/a-it', 'C:\\Users\\X\\do-it\\skills'), true);
    assert.equal(under('C:\\Users\\X\\do-it2\\skills', 'C:\\Users\\X\\do-it'), false);
  }
});

test('sameTarget resolves a link, and a path that does not exist yet through its nearest ancestor', () => {
  const real = tmpDir('do-it-same-');
  fs.mkdirSync(path.join(real, 'skills'));
  const alias = path.join(tmpDir('do-it-same-alias-'), 'link');
  linkDir(real, alias); // the alias `/var` is to `/private/var`, or a Windows short name to its long one

  assert.equal(sameTarget(alias, real), true);
  // A skill since renamed is gone, so each side resolves as far as its parent.
  assert.equal(sameTarget(path.join(alias, 'skills', 'gone-it'), path.join(real, 'skills', 'gone-it')), true);
  assert.equal(sameTarget(real, tmpDir('do-it-same-other-')), false);
});
