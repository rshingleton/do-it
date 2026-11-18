// doctor.mjs: the checkout's ref read back against the remote it came from,
// the plugin, `skills` CLI and hooks routes read back from what each host
// stores, and the probe prompt the routes page asks. A fixture checkout with a
// bare remote: the branch and short sha, the counts against the upstream and
// against origin/main, the fetch or clone behind them, --fetch, and the states
// where git cannot answer. Then a recorded `claude plugin list --json` payload
// behind a stub exec, fixture lock files in both shapes the CLI writes, and the
// OpenCode config the hook step edits.

import { cleanEnv, read, tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { install } from '../scripts/install.mjs';
import { pluginState } from '../scripts/doctor.mjs';
import { gitOut } from '../skills/do-it/scripts/git.mjs';
import { clone, quiet, seed } from './mini-root.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'scripts', 'doctor.mjs');

const write = (dir, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};

// A clone with a clean install made from it, so no link finding can hide a ref
// one, and the home the install went into.
function installed(root) {
  const home = tmpDir('do-it-ref-home-');
  quiet(() => install({ root, home, hooks: false }));
  return home;
}

const runDoctor = (root, home, args, env = cleanEnv({}, home), cwd = ROOT) =>
  spawnSync(process.execPath, [CLI, '--home', home, '--config-home', path.join(home, '.config'), '--root', root, ...args], { encoding: 'utf8', env, cwd });

const doctor = (root, home, ...args) => runDoctor(root, home, args);

const refLine = (out) => out.split('\n').find((line) => /^\s+ref: /.test(line)) ?? '';
const json = (r) => JSON.parse(r.stdout);

test('a fresh clone with no FETCH_HEAD reports its branch, short sha and that the clone is not a fetch', () => {
  const { remote } = seed();
  const root = clone(remote);
  const home = installed(root);

  const r = doctor(root, home);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const line = refLine(r.stdout);
  assert.match(line, /ref: main @ [0-9a-f]{7,},/, r.stdout);
  assert.match(line, /upstream origin\/main \(0 ahead, 0 behind\)/, r.stdout);
  assert.match(line, /origin\/main \(0 behind\)/, r.stdout);
  assert.match(line, /, cloned, not yet fetched$/, r.stdout); // a clone writes no FETCH_HEAD
  const ref = json(doctor(root, home, '--json')).ref;
  assert.deepEqual(Object.keys(ref).sort(), ['ahead', 'behind', 'behindMain', 'branch', 'cloned', 'fetchedAt', 'followed', 'sha', 'upstream']);
  assert.equal(ref.behindMain, 0);
  assert.equal(ref.cloned, true, 'the refs came with the clone');
  assert.equal(ref.fetchedAt, null, 'nothing was fetched');
  assert.deepEqual(ref.followed, { name: 'origin/main', behind: 0 });
});

test('a repository pushed to its remote was never cloned, so it keeps never fetched', () => {
  // init, commit, `git remote add`, `git push`: origin/main exists with no
  // clone behind it and no FETCH_HEAD.
  const { dir } = seed();
  const home = installed(dir);

  const r = doctor(dir, home);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(refLine(r.stdout), /, never fetched$/, r.stdout);
  const ref = json(doctor(dir, home, '--json')).ref;
  assert.equal(ref.cloned, false, 'a push is not a clone');
  assert.equal(ref.fetchedAt, null);
});

test('a clone whose remote moved keeps its old count without --fetch and gets the new one with it', () => {
  const { dir, remote } = seed();
  const root = clone(remote);
  const home = installed(root);
  const head = gitOut(root, ['rev-parse', 'HEAD']);
  const branch = gitOut(root, ['branch', '--show-current']);
  const originBefore = gitOut(root, ['rev-parse', 'origin/main']);
  const fetchHead = path.join(root, '.git', 'FETCH_HEAD');

  // The remote moves one commit on.
  write(dir, 'a.txt', 'two\n');
  gitOut(dir, ['add', '-A']);
  gitOut(dir, ['commit', '-qm', 'second']);
  gitOut(dir, ['push', '-q', 'origin', 'main']);
  const remoteRefs = gitOut(remote, ['for-each-ref']);

  const stale = doctor(root, home);
  assert.equal(stale.status, 0, stale.stdout); // behind its own stale ref, so no finding yet
  assert.match(refLine(stale.stdout), /origin\/main \(0 behind\)/, stale.stdout);
  assert.match(refLine(stale.stdout), /, cloned, not yet fetched$/);
  assert.equal(json(doctor(root, home, '--json')).ref.behindMain, 0);

  // No network call: the refs it would have moved are where they were.
  assert.equal(gitOut(root, ['rev-parse', 'origin/main']), originBefore, 'no fetch moved origin/main');
  assert.equal(fs.existsSync(fetchHead), false, 'no fetch wrote FETCH_HEAD');

  const fetched = doctor(root, home, '--fetch');
  assert.equal(fetched.status, 1, fetched.stdout);
  assert.match(refLine(fetched.stdout), /origin\/main \(1 behind\)/, fetched.stdout);
  assert.match(refLine(fetched.stdout), /fetched (just now|\d+[smhd] ago)$/, fetched.stdout);
  assert.equal(json(doctor(root, home, '--json')).ref.cloned, false, 'the fetch, not the clone, is what the counts came from');
  assert.match(fetched.stdout, /^\s+ref: 1 commit behind origin\/main; the install follows main {2}fix: git -C .* pull --ff-only$/m, fetched.stdout);
  assert.equal(json(doctor(root, home, '--json')).ref.behindMain, 1, 'the fetched count is read without fetching again');

  // A clone made after the move is level: the count came from this checkout's
  // refs, not from the remote.
  const fresh = clone(remote);
  assert.equal(json(doctor(fresh, installed(fresh), '--json')).ref.behindMain, 0);

  // Neither run touched the checkout or the remote.
  assert.equal(gitOut(root, ['rev-parse', 'HEAD']), head, 'HEAD is where it was');
  assert.equal(gitOut(root, ['branch', '--show-current']), branch, 'the branch is where it was');
  assert.equal(gitOut(root, ['status', '--porcelain']), '', 'the working tree is clean');
  assert.equal(gitOut(remote, ['for-each-ref']), remoteRefs, 'no remote ref changed');
});

test('a branch ahead of its own upstream is reported, not failed', () => {
  const { remote } = seed();
  const root = clone(remote);
  const home = installed(root);
  write(root, 'a.txt', 'local\n');
  gitOut(root, ['add', '-A']);
  gitOut(root, ['commit', '-qm', 'local']);

  const r = doctor(root, home);
  assert.equal(r.status, 0, r.stdout);
  assert.match(refLine(r.stdout), /upstream origin\/main \(1 ahead, 0 behind\)/, r.stdout);
  assert.match(refLine(r.stdout), /origin\/main \(0 behind\)/, r.stdout);
  assert.doesNotMatch(r.stdout, /behind origin\/main;/, 'nothing to update');
  const ref = json(doctor(root, home, '--json')).ref;
  assert.deepEqual([ref.ahead, ref.behind, ref.behindMain], [1, 0, 0]);
});

test('an upstream without origin/main is the one ref the doctor and the install follow', () => {
  const { dir, remote } = seed();
  const root = clone(remote);
  // No origin at all: the branch tracks a remote called up.
  gitOut(root, ['remote', 'rename', 'origin', 'up']);
  gitOut(root, ['fetch', '-q', 'up']);
  gitOut(root, ['branch', '--set-upstream-to=up/main', 'main']);
  const home = installed(root);

  // The remote moves on and the checkout fetches, so it is behind its upstream.
  write(dir, 'a.txt', 'two\n');
  gitOut(dir, ['add', '-A']);
  gitOut(dir, ['commit', '-qm', 'second']);
  gitOut(dir, ['push', '-q', 'origin', 'main']);
  gitOut(root, ['fetch', '-q', 'up']);

  const r = doctor(root, home);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /origin\/main absent/, r.stdout);
  assert.match(r.stdout, /^  ref: 1 commit behind up\/main; the install follows its upstream {2}fix: git -C .* pull --ff-only$/m, r.stdout);
  const ref = json(doctor(root, home, '--json')).ref;
  assert.equal(ref.behindMain, null);
  assert.deepEqual(ref.followed, { name: 'up/main', behind: 1 });

  const lines = [];
  const log = console.log;
  console.log = (...a) => lines.push(a.join(' '));
  try {
    install({ root, home: tmpDir('do-it-follow-home-'), hooks: false });
  } finally {
    console.log = log;
  }
  const line = lines.find((l) => l.startsWith('installed from '));
  assert.equal(line, `installed from ${root} at ${gitOut(root, ['rev-parse', '--short', 'HEAD']).trim()} (main), 1 commit behind up/main; fetched just now`);
});

test('a repository with no remote reports no upstream, no origin/main and never fetched', () => {
  const root = tmpDir('do-it-lonely-');
  gitOut(root, ['init', '-q', '-b', 'main']);
  gitOut(root, ['config', 'user.name', 't']);
  gitOut(root, ['config', 'user.email', 't@t']);
  gitOut(root, ['config', 'commit.gpgsign', 'false']);
  write(root, 'skills/a-it/SKILL.md', 'a');
  gitOut(root, ['add', '-A']);
  gitOut(root, ['commit', '-qm', 'init']);
  const home = installed(root);

  const r = doctor(root, home);
  assert.equal(r.status, 0, r.stdout);
  assert.match(refLine(r.stdout), /ref: main @ [0-9a-f]{7,}, upstream none, origin\/main absent, never fetched$/m, r.stdout);
  const ref = json(doctor(root, home, '--json')).ref;
  assert.deepEqual([ref.upstream, ref.ahead, ref.behind, ref.behindMain, ref.fetchedAt, ref.cloned], [null, null, null, null, null, false]);

  // --fetch against a remote that is gone: the ref is still read, and the
  // failure is said out loud rather than passing as a fetch that found nothing
  // new.
  gitOut(root, ['remote', 'add', 'origin', path.join(tmpDir('do-it-gone-'), 'gone')]);
  const fetched = doctor(root, home, '--fetch');
  assert.equal(fetched.status, 0, fetched.stdout);
  assert.match(refLine(fetched.stdout), /fetch failed: .*does not appear to be a git repository/, fetched.stdout);
});

test('a checkout that is not a repository, or a machine without git, reports unknown and adds no finding', () => {
  const root = tmpDir('do-it-notgit-');
  write(root, 'skills/a-it/SKILL.md', 'a');
  const home = installed(root); // both links clean, so only the ref is in question

  const plain = doctor(root, home);
  assert.equal(plain.status, 0, plain.stdout);
  assert.match(refLine(plain.stdout), /^\s+ref: unknown, not a git repository/m, plain.stdout);
  assert.match(plain.stdout, /^summary 2 entries: 2 ok$/m, plain.stdout);
  assert.match(json(doctor(root, home, '--json')).ref.unknown, /not a git repository/);

  // The same checkout on a machine where git is not installed.
  const env = cleanEnv({}, home);
  for (const key of Object.keys(env)) if (key.toUpperCase() === 'PATH') delete env[key];
  env.PATH = tmpDir('do-it-nogit-path-');
  const noGit = runDoctor(root, home, [], env);
  assert.equal(noGit.status, 0, noGit.stdout + noGit.stderr);
  assert.match(refLine(noGit.stdout), /^\s+ref: unknown, git is not installed$/m, noGit.stdout + noGit.stderr);
});

// ---- The plugin route ----

// The payload `claude plugin list --json` printed for this machine, recorded
// once: an in-place install names the folder it reads in place, and a cached
// install holds the version directory of its install-time snapshot.
function listing(readFromFolder, folderVersion) {
  return [
    {
      id: 'game-skillet@game-skillet',
      version: '0.2.0',
      scope: 'user',
      enabled: true,
      installPath: path.join(tmpDir('do-it-plugin-cache-'), 'game-skillet', 'game-skillet', '0.2.0'),
      readFromFolder: path.join(tmpDir('do-it-other-'), 'game-skillet'),
      folderVersion: '9.9.9',
    },
    {
      id: 'do-it@do-it',
      version: '0.1.0',
      scope: 'user',
      enabled: true,
      installPath: path.join(tmpDir('do-it-plugin-cache-'), 'do-it', 'do-it', '0.1.0'),
      readFromFolder,
      folderVersion,
      installedAt: '2026-11-14T15:30:30.817Z',
      lastUpdated: '2026-11-14T15:30:30.817Z',
      projectEnabled: false,
    },
  ];
}

// A `claude` on PATH that answers the recorded payload and records every call:
// npm installs it as claude.cmd on Windows.
function fakeClaude(payload) {
  const bin = tmpDir('do-it-claude-bin-');
  const marker = path.join(bin, 'calls');
  const file = path.join(bin, 'listing.json');
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  if (process.platform === 'win32') fs.writeFileSync(path.join(bin, 'claude.cmd'), `@echo %* >> "${marker}"\r\n@type "${file}"\r\n`);
  else fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\necho "$@" >> "${marker}"\ncat "${file}"\n`, { mode: 0o755 });
  return { bin, marker };
}

const withClaude = (bin, home) => cleanEnv({ PATH: `${bin}${path.delimiter}${process.env.PATH}` }, home);

// A developer's own state directory must not decide which global lock a test reads.
const withoutStateHome = (env) => {
  for (const k of Object.keys(env)) if (k.toUpperCase() === 'XDG_STATE_HOME') delete env[k];
  return env;
};

// A checkout that ships a plugin, at the version its manifest names.
function pluginRoot(version) {
  const root = tmpDir('do-it-plugin-checkout-');
  write(root, '.claude-plugin/plugin.json', JSON.stringify({ name: 'do-it', version }));
  write(root, 'skills/a-it/SKILL.md', 'a');
  return root;
}

test('the plugin route compares the version loaded in place with the manifest and names the marketplace update', () => {
  const root = pluginRoot('0.2.0');
  const home = installed(root);
  const { bin, marker } = fakeClaude(listing(root, '0.1.0'));

  const r = runDoctor(root, home, [], withClaude(bin, home));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^\s+plugin: stale, the folder is 0\.1\.0, the manifest 0\.2\.0; .*  fix: \/plugin marketplace update do-it$/m, r.stdout);
  assert.equal(fs.readFileSync(marker, 'utf8').trim(), 'plugin list --json', 'the doctor asked the host one question, list');

  const plugin = json(runDoctor(root, home, ['--json'], withClaude(bin, home))).routes.find((x) => x.route === 'plugin');
  assert.equal(plugin.state, 'stale');
  assert.equal(plugin.fix, '/plugin marketplace update do-it');
});

test('a cached plugin copy is compared by the version its cache holds, not by a folder another checkout owns', () => {
  const root = pluginRoot('0.2.0');
  const home = installed(root);
  const elsewhere = path.join(tmpDir('do-it-plugin-elsewhere-'), 'do-it');
  const { bin } = fakeClaude(listing(elsewhere, '0.2.0'));

  const plugin = json(runDoctor(root, home, ['--json'], withClaude(bin, home))).routes.find((x) => x.route === 'plugin');
  assert.equal(plugin.state, 'stale');
  assert.match(plugin.detail, /the cached copy is 0\.1\.0, the manifest 0\.2\.0/);
  assert.equal(plugin.fix, 'claude plugin update do-it@do-it');
});

test('a plugin whose loaded version matches the manifest is ok and exits 0', () => {
  const root = pluginRoot('0.2.0');
  const home = installed(root);
  const { bin } = fakeClaude(listing(root, '0.2.0'));

  const r = runDoctor(root, home, [], withClaude(bin, home));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^\s+plugin: ok, the folder is 0\.2\.0, the manifest 0\.2\.0/m, r.stdout);
});

test('an absent plugin route carries the two commands that install it', () => {
  const root = pluginRoot('0.2.0');
  const home = installed(root);
  const { bin } = fakeClaude([]); // the host holds no plugin at all

  const r = runDoctor(root, home, [], withClaude(bin, home));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^\s+plugin: not installed on this route {2}fix: claude plugin marketplace add rshingleton\/do-it && claude plugin install do-it@do-it$/m, r.stdout);

  const plugin = json(runDoctor(root, home, ['--json'], withClaude(bin, home))).routes.find((x) => x.route === 'plugin');
  assert.equal(plugin.state, 'absent');
  assert.match(plugin.fix, /^claude plugin marketplace add rshingleton\/do-it && claude plugin install do-it@do-it$/);
});

test('a checkout with no plugin manifest has nothing to install from, so no command is offered', () => {
  const root = cliCheckout(); // a checkout that ships skills alone
  const home = installed(root);

  const plugin = json(runDoctor(root, home, ['--json'], cleanEnv({ PATH: tmpDir('do-it-no-claude-') }, home), root)).routes.find((x) => x.route === 'plugin');
  assert.equal(plugin.state, 'absent');
  assert.equal(plugin.fix, null, 'another checkout cannot install a plugin this one does not ship');
  assert.match(plugin.detail, /ships no plugin manifest/);
});

test('a host that cannot answer reports unknown and adds no finding', () => {
  const state = pluginState({ exec: () => { throw new Error('spawnSync claude ENOENT'); } });
  assert.match(state.unknown, /ENOENT/);

  // The same checkout with nothing named claude on PATH.
  const root = pluginRoot('0.2.0');
  const home = installed(root);
  const r = runDoctor(root, home, [], cleanEnv({ PATH: tmpDir('do-it-no-claude-') }, home));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^\s+plugin: unknown, .*claude/m, r.stdout);
});

test('a PATH entry with a stray quote still finds the host the shell misses', { skip: process.platform !== 'win32' && 'the doctor scans PATH entries on Windows' }, () => {
  const root = pluginRoot('0.2.0');
  const home = installed(root);
  const { bin, marker } = fakeClaude(listing(root, '0.2.0'));
  // The host's directory, written the way a copy-pasted value leaves it: one
  // quote inside the entry, so cmd seeks a directory that does not exist while
  // the platform's own lookup still finds the binary.
  const quoted = `${bin.slice(0, 4)}"${bin.slice(4)}"`;

  const r = runDoctor(root, home, [], cleanEnv({ PATH: quoted }, home));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^\s+plugin: ok, /m, r.stdout);
  assert.equal(fs.readFileSync(marker, 'utf8').trim(), 'plugin list --json', 'the quoted entry found claude');
});

// ---- The `skills` CLI route ----

const GIT_WHEN = { GIT_AUTHOR_DATE: '2026-11-16T01:29:00Z', GIT_COMMITTER_DATE: '2026-11-16T01:29:00Z' };
const PROJECT_HASH = 'afc5d6875e2d2f4356569c20cc05a703077bf4c44a7e049084ff543ae5bb207f'; // 64 hex, content
const GLOBAL_HASH = '17972a1bdbf5909b9dbdc435ad348f0bf45f8664'; // 40 hex, git tree

// A checkout a `skills` CLI install can name, with a fixed commit date so the
// `checkout` half of the timestamp line is stable.
function cliCheckout() {
  const root = tmpDir('do-it-cli-checkout-');
  gitOut(root, ['init', '-q', '-b', 'main']);
  gitOut(root, ['config', 'user.name', 't']);
  gitOut(root, ['config', 'user.email', 't@t']);
  gitOut(root, ['config', 'commit.gpgsign', 'false']);
  gitOut(root, ['remote', 'add', 'origin', 'https://github.com/rshingleton/do-it.git']);
  write(root, 'skills/a-it/SKILL.md', 'a');
  gitOut(root, ['add', '-A']);
  gitOut(root, ['commit', '-qm', 'init'], { ...process.env, ...GIT_WHEN });
  return root;
}

function projectLock(root, commit) {
  return {
    version: 2,
    skills: {
      'a-it': {
        source: '.',
        sourceType: 'local',
        sourceUrl: root,
        skillPath: 'skills/a-it/SKILL.md',
        computedHash: PROJECT_HASH,
        commit,
        ref: 'main',
      },
    },
  };
}

function globalLock(commit) {
  return {
    version: 3,
    skills: {
      'a-it': {
        source: 'rshingleton/do-it',
        sourceType: 'github',
        sourceUrl: 'https://github.com/rshingleton/do-it.git',
        skillPath: 'skills/a-it/SKILL.md',
        skillFolderHash: GLOBAL_HASH,
        commit,
        installedAt: '2026-11-16T01:29:47.562Z',
        updatedAt: '2026-11-16T01:29:47.562Z',
      },
    },
  };
}

test('the skills CLI route reads both lock shapes and keeps the entries that name this checkout', () => {
  const root = cliCheckout();
  const home = installed(root); // the links are clean, so only the routes are in question
  const head = gitOut(root, ['rev-parse', 'HEAD']).trim();
  write(root, 'skills-lock.json', JSON.stringify(projectLock(root, head)));
  write(home, '.agents/.skill-lock.json', JSON.stringify(globalLock(head)));

  const r = runDoctor(root, home, [], withoutStateHome(cleanEnv({}, home)), root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^\s+skills CLI: mixed, project: local \. skills\/a-it\/SKILL\.md hash [0-9a-f]{64} \(64 hex, content\).*checkout 2026-11-16; skills update never touches a local install, re-run npx skills@latest add .*do-it-cli-checkout-/m, r.stdout);
  assert.match(r.stdout, /global: github rshingleton\/do-it skills\/a-it\/SKILL\.md hash [0-9a-f]{40} \(40 hex, git tree\), commit [0-9a-f]{7,40}, recorded 2026-11-16 01:29, checkout 2026-11-16/, r.stdout);
  assert.doesNotMatch(r.stdout, /npx skills@latest update/, 'a local install is never offered an update');

  const routes = json(runDoctor(root, home, ['--json'], withoutStateHome(cleanEnv({}, home)), root)).routes;
  assert.deepEqual(routes.map((x) => x.route), ['plugin', 'skills CLI', 'hooks']);
  for (const route of routes) assert.deepEqual(Object.keys(route).sort(), ['detail', 'fix', 'route', 'state']);
  const cli = routes.find((x) => x.route === 'skills CLI');
  assert.equal(cli.state, 'mixed');
  assert.equal(cli.fix, `npx skills@latest add ${root}`);
});

test('a global lock under $XDG_STATE_HOME is the one read', () => {
  const root = cliCheckout();
  const home = installed(root);
  const state = tmpDir('do-it-cli-state-');
  write(state, 'skills/.skill-lock.json', JSON.stringify(globalLock(gitOut(root, ['rev-parse', 'HEAD']).trim())));

  const r = runDoctor(root, home, [], cleanEnv({ XDG_STATE_HOME: state }, home), root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^\s+skills CLI: git, global: github rshingleton\/do-it .*recorded 2026-11-16 01:29, checkout 2026-11-16  fix: npx skills@latest update$/m, r.stdout);
});

test('a route nothing is installed on says so, carries its install command, and a lock that cannot be parsed says why', () => {
  const root = cliCheckout(); // no plugin manifest, no lock files
  const home = installed(root);

  const r = runDoctor(root, home, [], withoutStateHome(cleanEnv({}, home)), root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^\s+plugin: this checkout ships no plugin manifest$/m, r.stdout);
  assert.match(r.stdout, /^\s+skills CLI: not installed on this route {2}fix: npx skills@latest add .*do-it-cli-checkout-/m, r.stdout);

  write(home, '.agents/.skill-lock.json', '{ not json');
  const broken = runDoctor(root, home, [], withoutStateHome(cleanEnv({}, home)), root);
  assert.equal(broken.status, 0, broken.stdout + broken.stderr);
  assert.match(broken.stdout, /^\s+skills CLI: unknown, cannot read .*\.skill-lock\.json/m, broken.stdout);
});

// ---- The hooks route: the OpenCode config the hook step edits ----

const opencodeFile = (home) => path.join(home, '.config', 'opencode', 'opencode.json');

test('a hooks route with no config names the step that writes one', () => {
  const root = pluginRoot('0.2.0');
  const home = installed(root);

  const r = runDoctor(root, home, [], withClaude(fakeClaude(listing(root, '0.2.0')).bin, home));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^\s+hooks: no .*opencode\.json {2}fix: node .*scripts[\\/]install-hooks\.mjs opencode$/m, r.stdout);
});

test('a config that registers this checkout is ok, and one that names another checkout is stale', () => {
  const root = pluginRoot('0.2.0');
  const home = installed(root);
  const env = withClaude(fakeClaude(listing(root, '0.2.0')).bin, home);
  write(home, '.config/opencode/opencode.json', JSON.stringify({ plugin: [path.join(root, '.opencode', 'do-it-plugin', 'do-it.mjs')] }));

  const ok = runDoctor(root, home, [], env);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /^\s+hooks: ok, the config registers .*do-it-plugin/m, ok.stdout);

  const elsewhere = path.join(tmpDir('do-it-other-checkout-'), '.opencode', 'do-it-plugin');
  write(home, '.config/opencode/opencode.json', JSON.stringify({ plugins: [elsewhere] }));
  const stale = runDoctor(root, home, [], env);
  assert.equal(stale.status, 1, stale.stdout);
  assert.match(stale.stdout, /^\s+hooks: stale, no entry in .*opencode\.json names this checkout {2}fix: node .*install-hooks\.mjs opencode$/m, stale.stdout);
});

test('a commented opencode.json is a finding, not a silent pass', () => {
  const root = pluginRoot('0.2.0');
  const home = installed(root);
  const env = withClaude(fakeClaude(listing(root, '0.2.0')).bin, home);
  write(home, '.config/opencode/opencode.json', `// my config\n{ "plugin": [] }\n`);

  const r = runDoctor(root, home, [], env);
  assert.equal(r.status, 1, 'the hook step refuses the file, so the doctor fails too');
  assert.match(r.stdout, /^\s+hooks: unreadable, .*opencode\.json is not plain JSON \(comments\?\); the OpenCode hook step refuses it$/m, r.stdout);
  assert.doesNotMatch(r.stdout, /hooks: ok/, 'a parse failure never reads as a pass');

  const hooks = json(runDoctor(root, home, ['--json'], env)).routes.find((x) => x.route === 'hooks');
  assert.equal(hooks.state, 'unreadable');
  assert.equal(hooks.fix, null, 'the fix is an edit, not a command');
});

// ---- The probe prompt the routes page asks ----

// The sixteen skills whose name ends in -it and which the model may pick up
// unasked, as the page records them.
const MODEL_INVOCABLE = ['debug-it', 'design-it', 'doubt-it', 'grill-it', 'guard-it', 'link-it', 'log-it', 'map-it', 'merge-it', 'name-it', 'review-it', 'sketch-it', 'skill-it', 'sweep-it', 'test-it', 'track-it'];

test('the probe asks for the suffix, so a name can match it, and the prefix question finds nothing', () => {
  const doc = read('docs/reference/install-routes.md');
  const prompts = [...doc.matchAll(/(?:claude -p|opencode run) "([^"]+)"/g)].map((m) => m[1]);

  assert.ok(prompts.length >= 2, 'both hosts are probed');
  for (const prompt of prompts) assert.match(prompt, /name ends with -it/, prompt);
  // The prefix shape is recorded as the reason the probe moved, never as a
  // command to run: no skill name starts with `it-`.
  assert.doesNotMatch(doc, /(?:claude -p|opencode run) "[^"]*starts with it-/);

  const listed = doc.slice(doc.indexOf('Both printed the same sixteen'));
  for (const name of MODEL_INVOCABLE) assert.ok(listed.includes(`\n${name}\n`), `${name} is listed as found`);
});

// ---- The import graph the ref read moved for ----

test('the doctor and the installer no longer import each other', () => {
  const installText = fs.readFileSync(path.join(ROOT, 'scripts', 'install.mjs'), 'utf8');
  const doctorText = fs.readFileSync(CLI, 'utf8');

  assert.doesNotMatch(installText, /from '\.\/doctor\.mjs'/, 'the installer reads the ref from lib, not from the doctor');
  assert.match(installText, /from '\.\/lib\/read-ref\.mjs'/);
  assert.match(doctorText, /from '\.\/lib\/read-ref\.mjs'/);
});
