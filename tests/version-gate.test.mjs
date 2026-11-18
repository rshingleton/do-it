// The version gate: a change under a gated path that leaves
// .claude-plugin/plugin.json's version alone fails, or a plugin user never
// receives it. One fixture repo per case; the gate runs as the CI step does.

import { cleanEnv, tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE = path.join(ROOT, 'scripts/version-gate.mjs');

const manifest = (version) =>
  `${JSON.stringify(
    { name: 'do-it', version, description: 't', author: { name: 't' }, license: 'MIT', skills: './skills' },
    null,
    2,
  )}\n`;
const skill = (name) => `---\nname: ${name}\ndescription: T. Use when testing.\n---\n\nBody.\n`;

function put(dir, rel, text) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
}

// A repo whose base commit holds a 0.1.0 manifest, one skill, one agent, one
// hook file and a README, with origin/main at that tip.
function fixture() {
  const dir = tmpDir('do-it-vgate-');
  const git = (...a) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...a], {
      cwd: dir,
      encoding: 'utf8',
    });
  git('init', '-q', '-b', 'main');
  put(dir, '.claude-plugin/plugin.json', manifest('0.1.0'));
  put(dir, 'skills/alpha-it/SKILL.md', skill('alpha-it'));
  put(dir, 'agents/it-scout.md', '---\nname: it-scout\nmodel: sonnet\ntools: Read\n---\n\nBrief.\n');
  put(dir, 'hooks/hooks.json', '{}\n');
  put(dir, 'README.md', '# do-it\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD').trim());
  return { dir, git, write: (rel, text) => put(dir, rel, text) };
}

// The gate reads the caller's CI environment to pick a default base; keep the
// runner's values out of every case.
const run = (dir, args = [], extra = {}) =>
  spawnSync('node', [GATE, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: cleanEnv({ GITHUB_EVENT_NAME: '', GITHUB_BASE_REF: '', GITHUB_EVENT_PATH: '', ...extra }),
  });

const out = (r) => `${r.stdout}${r.stderr}`;

test('a skills change with no bump fails and names both versions', () => {
  const { dir, write } = fixture();
  write('skills/alpha-it/SKILL.md', `${skill('alpha-it')}\nMore.\n`);
  write('agents/it-scout.md', '---\nname: it-scout\nmodel: sonnet\ntools: Read, Grep\n---\n\nBrief.\n');
  write('hooks/hooks.json', '{ "hooks": {} }\n');
  const r = run(dir, ['--base', 'main']);
  assert.equal(r.status, 1, out(r));
  assert.match(out(r), /version-gate: fail - version 0\.1\.0 -> 0\.1\.0, 3 gated files changed/);
  for (const f of ['skills/alpha-it/SKILL.md', 'agents/it-scout.md', 'hooks/hooks.json']) assert.ok(out(r).includes(f), f);
});

test('a skill moved out of skills/ still counts as a gated change', () => {
  const { dir, git } = fixture();
  git('mv', 'skills/alpha-it/SKILL.md', 'keep.md');
  const r = run(dir, ['--base', 'main']);
  assert.equal(r.status, 1, out(r));
  assert.match(out(r), /version-gate: fail/);
});

test('an untracked skill file whose name git would quote fails with no bump', () => {
  const { dir, write } = fixture();
  write('skills/naïve-it/SKILL.md', skill('naïve-it'));
  const r = run(dir, ['--base', 'main']);
  assert.equal(r.status, 1, out(r));
  assert.match(out(r), /1 gated file changed \(skills\/naïve-it\/SKILL\.md\)/);
});

test('the same skills change with a bump to 0.2.0 passes', () => {
  const { dir, write } = fixture();
  write('skills/alpha-it/SKILL.md', `${skill('alpha-it')}\nMore.\n`);
  write('.claude-plugin/plugin.json', manifest('0.2.0'));
  const r = run(dir, ['--base', 'main']);
  assert.equal(r.status, 0, out(r));
  assert.match(out(r), /version-gate: pass - version 0\.1\.0 -> 0\.2\.0, 1 gated file changed/);
});

test('a version below the base tip fails even when it is above the merge base', () => {
  const { dir, git, write } = fixture();
  // origin/main moves to 0.3.0 after the branch's fork point at 0.1.0.
  git('checkout', '-q', '-b', 'release');
  write('.claude-plugin/plugin.json', manifest('0.3.0'));
  git('add', '-A');
  git('commit', '-q', '-m', 'release 0.3.0');
  git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD').trim());
  // The feature branch bumps only to 0.2.0 and changes a skill.
  git('checkout', '-q', '-b', 'feature', 'main');
  write('skills/alpha-it/SKILL.md', `${skill('alpha-it')}\nMore.\n`);
  write('.claude-plugin/plugin.json', manifest('0.2.0'));
  const r = run(dir, ['--base', 'origin/main']);
  assert.equal(r.status, 1, out(r));
  assert.match(out(r), /version-gate: fail - version 0\.3\.0 -> 0\.2\.0, 1 gated file changed/);
});

test('a version absent at the base counts as a bump', () => {
  const { dir, git, write } = fixture();
  git('rm', '-q', '.claude-plugin/plugin.json');
  git('commit', '-q', '-m', 'drop the manifest');
  git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD').trim());
  write('.claude-plugin/plugin.json', manifest('0.1.0'));
  write('skills/alpha-it/SKILL.md', `${skill('alpha-it')}\nMore.\n`);
  const r = run(dir, ['--base', 'main']);
  assert.equal(r.status, 0, out(r));
  assert.match(out(r), /version-gate: pass - version absent -> 0\.1\.0/);
});

test('a package.json version that differs from the plugin manifest fails and names both', () => {
  const { dir, write } = fixture();
  write('package.json', `${JSON.stringify({ name: 'do-it', version: '0.1.1' }, null, 2)}\n`);
  const r = run(dir, ['--base', 'main']);
  assert.equal(r.status, 1, out(r));
  assert.match(out(r), /version-gate: fail - package\.json is 0\.1\.1, \.claude-plugin\/plugin\.json is 0\.1\.0/);

  write('package.json', `${JSON.stringify({ name: 'do-it', version: '0.1.0' }, null, 2)}\n`);
  assert.equal(run(dir, ['--base', 'main']).status, 0);
});

test('--skip-missing-base prints one line and passes when the base does not resolve', () => {
  const { dir } = fixture();
  const r = run(dir, ['--base', 'origin/no-such-branch', '--skip-missing-base']);
  assert.equal(r.status, 0, out(r));
  assert.match(r.stdout, /version-gate: skipped - base origin\/no-such-branch does not resolve here/);
});

test('a README change passes, reading origin/main when no base is given', () => {
  const { dir, write } = fixture();
  write('README.md', '# do-it\n\nInstalled the managed way.\n');
  const r = run(dir);
  assert.equal(r.status, 0, out(r));
  assert.match(out(r), /version-gate: pass - version 0\.1\.0 -> 0\.1\.0, no gated file changed/);
});

test('a push reads its whole range from the event payload, not just the last commit', () => {
  const { dir, git, write } = fixture();
  const before = git('rev-parse', 'HEAD').trim();
  write('skills/alpha-it/SKILL.md', `${skill('alpha-it')}\nMore.\n`);
  git('add', '-A');
  git('commit', '-q', '-m', 'a skills change with no bump');
  write('README.md', '# do-it\n\nA later README commit.\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'readme only');
  const event = path.join(dir, 'event.json');
  fs.writeFileSync(event, JSON.stringify({ before }));
  const r = run(dir, [], { GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: event });
  assert.equal(r.status, 1, out(r));
});

test('a directory that is not a git repo exits 2', () => {
  const dir = tmpDir('do-it-vgate-bare-');
  const r = run(dir, [], { GIT_CEILING_DIRECTORIES: path.dirname(dir) });
  assert.equal(r.status, 2, out(r));
  assert.match(out(r), /git cannot answer/);
  // An unknown base ref is not the empty change either.
  assert.equal(run(fixture().dir, ['--base', 'origin/no-such-branch']).status, 2);
});

test('a manifest that does not parse, in the tree or at the base, exits 2', () => {
  const tree = fixture();
  tree.write('.claude-plugin/plugin.json', '{ "version": ');
  const brokenTree = run(tree.dir, ['--base', 'main']);
  assert.equal(brokenTree.status, 2, out(brokenTree));

  const base = fixture();
  base.write('.claude-plugin/plugin.json', '{ "version": ');
  base.git('commit', '-q', '-am', 'a broken manifest');
  base.write('.claude-plugin/plugin.json', manifest('0.2.0'));
  const brokenBase = run(base.dir, ['--base', 'main']);
  assert.equal(brokenBase.status, 2, out(brokenBase));
  assert.match(out(brokenBase), /plugin\.json/);

  const missing = fixture();
  fs.rmSync(path.join(missing.dir, '.claude-plugin/plugin.json'));
  const missingTree = run(missing.dir, ['--base', 'main']);
  assert.equal(missingTree.status, 2, out(missingTree));
  assert.match(out(missingTree), /plugin\.json/);
});
