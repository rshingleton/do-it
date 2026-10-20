// Regression tests for bugs found in the install, check and helper scripts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseFrontmatter } from '../scripts/lib/skills.mjs';
import { fingerprint as fp } from '../skills/do-it/scripts/changeset.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

function copyRepo(dest) {
  fs.cpSync(ROOT, dest, { recursive: true, filter: (src) => !src.includes(`${path.sep}.git${path.sep}`) && !src.endsWith(`${path.sep}.git`) });
  return dest;
}

function gitRepo() {
  const dir = tmp('do-it-sreg-');
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  return { dir, git, commit: () => git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'c') };
}

test('install-hooks works from a checkout path with a space', () => {
  const base = tmp('do-it-sp-');
  const repo = copyRepo(path.join(base, 'sp ace', 'do it'));
  const home = path.join(base, 'home');
  const r = spawnSync('node', [path.join(repo, 'scripts/install-hooks.mjs'), 'claude'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf8'), /claude\.mjs/);
});

test('uninstall on a clean home writes nothing; re-install keeps the first backup', () => {
  const home = tmp('do-it-home-');
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') };
  const hooks = (...a) => spawnSync('node', [path.join(ROOT, 'scripts/install-hooks.mjs'), ...a], { encoding: 'utf8', env });
  hooks('claude', '--remove');
  hooks('opencode', '--remove');
  assert.equal(fs.existsSync(path.join(home, '.claude/settings.json')), false);
  assert.equal(fs.existsSync(path.join(home, '.config/opencode/opencode.json')), false);

  fs.mkdirSync(path.join(home, '.claude'));
  fs.writeFileSync(path.join(home, '.claude/settings.json'), '{"model":"orig"}');
  hooks('claude');
  hooks('claude');
  assert.equal(fs.readFileSync(path.join(home, '.claude/settings.json.bak-do-it'), 'utf8'), '{"model":"orig"}');
});

test('uninstall removes every link into this checkout, including renamed skills', () => {
  const home = tmp('do-it-home-');
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') };
  fs.mkdirSync(path.join(home, '.claude/skills'), { recursive: true });
  const stale = path.join(home, '.claude/skills/diagnosing-bugs');
  fs.symlinkSync(path.join(ROOT, 'skills/diagnosing-bugs'), stale);
  const foreign = path.join(home, '.claude/skills/other');
  fs.symlinkSync('/nowhere/else', foreign);
  spawnSync('bash', [path.join(ROOT, 'scripts/install.sh'), '--uninstall'], { encoding: 'utf8', env });
  assert.equal(fs.existsSync(stale) || fs.lstatSync(stale, { throwIfNoEntry: false }) !== undefined, false);
  assert.ok(fs.lstatSync(foreign, { throwIfNoEntry: false }), 'foreign link must stay');
});

test('install.sh run from a pipe clones the repo, installs from the clone, and pulls on a re-run', () => {
  // The source is on a branch, as GitHub's default branch is; cloning ROOT
  // itself fails in CI, where a pull request checks out a detached merge commit.
  const source = copyRepo(tmp('do-it-src-'));
  const git = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: source });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'source');
  const home = tmp('do-it-home-');
  const clone = path.join(home, 'share/do-it');
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), DO_IT_REPO: source, DO_IT_HOME: clone };
  const piped = (...args) =>
    spawnSync('bash', ['-s', '--', ...args], { cwd: home, input: fs.readFileSync(path.join(ROOT, 'scripts/install.sh')), encoding: 'utf8', env });

  const dry = piped('--dry-run');
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /would clone/);
  assert.equal(fs.existsSync(clone), false, 'a dry run clones nothing');

  const first = piped('--no-hooks');
  assert.equal(first.status, 0, first.stderr);
  assert.ok(fs.existsSync(path.join(clone, '.git')));
  assert.equal(fs.readlinkSync(path.join(home, '.claude/skills/do-it')), path.join(clone, 'skills/do-it'));

  const again = piped('--no-hooks');
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /updating .*share\/do-it/);
});

function scan(dir, ...args) {
  return spawnSync('node', [path.join(ROOT, 'skills/guard-it/scripts/scan.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
}

test('scan.mjs finds secrets in files with quoted or non-ASCII names', () => {
  const { dir, git, commit } = gitRepo();
  commit();
  fs.writeFileSync(path.join(dir, 'naïve.js'), `k = "${KEY}"\n`);
  fs.writeFileSync(path.join(dir, 'q"uote.js'), `k = "${KEY}"\n`);
  assert.equal(scan(dir).status, 1, scan(dir).stdout);
  git('add', '-A');
  commit();
  fs.appendFileSync(path.join(dir, 'naïve.js'), `j = "${KEY}"\n`);
  assert.equal(scan(dir).status, 1);
});

test('scan.mjs reports the real line of a tracked change', () => {
  const { dir, git, commit } = gitRepo();
  fs.writeFileSync(path.join(dir, 'a.js'), 'one\ntwo\n');
  git('add', '-A');
  commit();
  fs.appendFileSync(path.join(dir, 'a.js'), `k = "${KEY}"\n`);
  const r = scan(dir);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /in a\.js:3:/);
});

test('scan.mjs finds a staged file before the first commit', () => {
  const { dir, git } = gitRepo();
  fs.writeFileSync(path.join(dir, 'a.js'), `k = "${KEY}"\n`);
  git('add', 'a.js');
  const r = scan(dir);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /in a\.js:1:/);
});

test('scan.mjs rejects an unknown --since ref instead of reporting clean', () => {
  const { dir, commit } = gitRepo();
  commit();
  const r = scan(dir, '--since', 'nosuchref');
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stdout + r.stderr, /unknown ref/);
});

const fingerprint = (cwd, base = 'HEAD') => fp(cwd, base, { exclude: ['docs/planning'] });

test('fingerprint is the same from any directory and handles odd entries', () => {
  const { dir, commit } = gitRepo();
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'sub/.keep'), '');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  commit();
  fs.writeFileSync(path.join(dir, 'a'), 'x');
  const root = fingerprint(dir);
  assert.equal(fingerprint(path.join(dir, 'sub')), root);

  fs.symlinkSync('/etc', path.join(dir, 'linkdir'));
  const withLink = fingerprint(dir);
  assert.notEqual(withLink, root);
  assert.equal(fingerprint(dir), withLink);

  fs.mkdirSync(path.join(dir, 'nested'));
  execFileSync('git', ['init', '-q'], { cwd: path.join(dir, 'nested') });
  fs.writeFileSync(path.join(dir, 'nested/f'), 'n');
  const withNested = fingerprint(dir);
  fs.writeFileSync(path.join(dir, 'nested/f'), 'changed');
  assert.equal(fingerprint(dir), withNested, 'a nested repo hashes by name only');
});

test('fingerprint works before the first commit and fails on a bad base', () => {
  const { dir } = gitRepo();
  fs.writeFileSync(path.join(dir, 'a'), 'x');
  assert.notEqual(fingerprint(dir), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  const { dir: d2, commit } = gitRepo();
  commit();
  assert.throws(() => fingerprint(d2, 'nosuchref'), /unknown base ref: nosuchref/);
});

test('fingerprint hashes binary changes and is a git blob id', () => {
  const { dir, git, commit } = gitRepo();
  fs.writeFileSync(path.join(dir, 'b.bin'), Buffer.from([0, 1, 2, 255]));
  git('add', '-A');
  commit();
  assert.equal(fingerprint(dir), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391', 'no change hashes as the empty blob');
  fs.writeFileSync(path.join(dir, 'b.bin'), Buffer.from([0, 9, 2, 255]));
  const diff = execFileSync('git', ['diff', '--binary', 'HEAD'], { cwd: dir });
  const expected = execFileSync('git', ['hash-object', '--stdin'], { cwd: dir, input: diff, encoding: 'utf8' }).trim();
  assert.equal(fingerprint(dir), expected);
});

test('parseFrontmatter handles CRLF, folded blocks with blank lines, quotes', () => {
  assert.deepEqual(parseFrontmatter('---\r\nname: a\r\ndescription: b\r\n---\r\nbody').meta, { name: 'a', description: 'b' });
  assert.equal(parseFrontmatter('---\ndescription: >\n  line one\n\n  line two\n---\n').meta.description, 'line one\nline two');
  assert.equal(parseFrontmatter('---\ndescription: >-\n  a\n  b\n---\n').meta.description, 'a b');
  assert.equal(parseFrontmatter("---\nd: 'it''s'\n---\n").meta.d, "it's");
  assert.equal(parseFrontmatter('---\nd: "a \\x41"\n---\n').meta.d, 'a A');
  assert.equal(parseFrontmatter('---\nd: plain value\n  continued here\n---\n').meta.d, 'plain value continued here');
});

function checkWith(files) {
  const repo = copyRepo(path.join(tmp('do-it-chk-'), 'r'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo, rel), text);
  }
  return spawnSync('node', [path.join(repo, 'scripts/check.mjs')], { encoding: 'utf8' });
}

const SKILL = (body) => `---\nname: zz-it\ndescription: Test skill. Use when testing.\n---\n\n${body}\n`;

test('check.mjs reports broken links with titles, angle brackets and reference definitions', () => {
  const r = checkWith({
    'skills/zz-it/SKILL.md': SKILL('[t](missing.md "Title")\n[a](<missing two.md>)\n\n[r]: missing-ref.md\n'),
  });
  assert.equal(r.status, 1);
  for (const m of ['missing.md', 'missing two.md', 'missing-ref.md']) assert.match(r.stdout, new RegExp(m.replace('.', '\\.')));
});

test('check.mjs: em-dash allowed in inline code and ~~~ fences; Skill-tool calls caught in any case', () => {
  const ok = checkWith({ 'skills/zz-it/SKILL.md': SKILL('Use `a \u2014 b` here.\n\n~~~\nx \u2014 y\n~~~') });
  assert.equal(ok.status, 0, ok.stdout);
  const bad = checkWith({ 'skills/zz-it/SKILL.md': SKILL('Then use the `Skill` tool on "ship-it".') });
  assert.equal(bad.status, 1, bad.stdout);
});

test('importing gen-opencode.mjs does not run it (bug 10)', () => {
  const url = new URL('../scripts/gen-opencode.mjs', import.meta.url).href;
  const r = spawnSync('node', ['--input-type=module', '-e', `const m = await import(${JSON.stringify(url)}); console.log(typeof m.expected)`], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'function');
});
