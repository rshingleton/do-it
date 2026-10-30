import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEFAULTS } from '../skills/track-it/scripts/config.mjs';
import { loadChecks } from '../hooks/lib/checks.mjs';
import { beforeShell } from '../hooks/lib/guard.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'skills/do-it/scripts/work.mjs');
const LINE = 'Build assistance with do-it: https://github.com/rshingleton/do-it';

const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
const write = (dir, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};
function work(dir, ...args) {
  const r = spawnSync('node', [WORK, ...args], { cwd: dir, encoding: 'utf8', env: process.env });
  return { status: r.status, out: JSON.parse(r.stdout) };
}
const ok = (r) => {
  assert.equal(r.status, 0, JSON.stringify(r.out));
  return r.out;
};

// A repo on `branch` with one commit, a bare remote, and a lane M item "feat"
// that has two phases, phase 1 built and verified.
function fixture({ branch = 'main', config = '' } = {}) {
  const dir = tmpDir('do-it-runcommit-');
  const remote = tmpDir('do-it-remote-');
  git(remote, 'init', '-q', '--bare');
  git(dir, 'init', '-q', '-b', branch);
  git(dir, 'config', 'user.name', 't');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'commit.gpgsign', 'false');
  write(dir, 'a.js', 'one\n');
  write(dir, 'unrelated.txt', 'mine\n');
  if (config) write(dir, '.do-it/config.env', config);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  git(dir, 'remote', 'add', 'origin', remote);
  git(dir, 'push', '-q', 'origin', branch);
  ok(work(dir, 'new', 'feat', '--lane', 'm', '--title', 'Feature'));
  write(dir, 'docs/planning/feat/phase-1.md', '# Phase 1\n');
  ok(work(dir, 'set', 'feat', 'phases', '[{"n":1,"title":"Limiter"},{"n":2,"title":"Wire","blocked_by":[1]}]'));
  ok(work(dir, 'event', 'feat', 'approve'));
  ok(work(dir, 'event', 'feat', 'start'));
  write(dir, 'a.js', 'two\n');
  write(dir, 'b.js', 'new file\n');
  write(dir, 'unrelated.txt', 'mine, edited\n');
  return { dir, remote };
}
const verify = (dir, n = 1) => ok(work(dir, 'verify-phase', 'feat', String(n), '--', 'true'));
const refs = (remote) => git(remote, 'for-each-ref');

test('a verified phase on a protected branch commits on do-it/<slug>, staged by path, tagged, nothing pushed', () => {
  const { dir, remote } = fixture();
  ok(work(dir, 'run', 'new', 'road'));
  verify(dir);
  const before = refs(remote);
  const r = ok(work(dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', 'a.js,b.js'));
  assert.equal(r.branch, 'do-it/road');
  assert.equal(git(dir, 'branch', '--show-current'), 'do-it/road');
  assert.equal(git(dir, 'rev-parse', 'main'), git(dir, 'rev-parse', 'HEAD~1'), 'main itself is untouched');
  assert.deepEqual(git(dir, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort(), ['a.js', 'b.js'], 'the commit holds exactly the mapped set');
  assert.equal(git(dir, 'diff', '--name-only'), 'unrelated.txt', 'the unrelated dirty file stays unstaged');
  assert.equal(git(dir, 'diff', '--cached', '--name-only'), '');
  assert.equal(git(dir, 'tag', '-l', 'do-it/*'), 'do-it/feat/phase-1');
  assert.equal(git(dir, 'rev-parse', 'do-it/feat/phase-1^{commit}'), git(dir, 'rev-parse', 'HEAD'));
  assert.equal(refs(remote), before, 'no remote ref changed');
  assert.equal(ok(work(dir, 'run', 'show', 'road')).branch, 'do-it/road');
  const msg = git(dir, 'log', '-1', '--format=%B');
  assert.equal(msg.split('\n')[0], 'feat: phase 1 Limiter');
  assert.equal(msg.split('\n').at(-1), LINE);
  assert.doesNotMatch(msg, /Co-Authored|Generated with/);
});

test('an unprotected branch is committed on as is; a configured protected branch is moved off', () => {
  let f = fixture({ branch: 'work' });
  ok(work(f.dir, 'run', 'new', 'road'));
  verify(f.dir);
  assert.equal(ok(work(f.dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', 'a.js')).branch, 'work');

  f = fixture({ branch: 'release', config: 'DO_IT_PROTECTED_BRANCHES=release\n' });
  ok(work(f.dir, 'run', 'new', 'road'));
  verify(f.dir);
  assert.equal(ok(work(f.dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', 'a.js')).branch, 'do-it/road');
});

test('no commit before a passing verify-phase, and a failing check leaves HEAD unchanged', () => {
  const { dir } = fixture();
  ok(work(dir, 'run', 'new', 'road'));
  const head = git(dir, 'rev-parse', 'HEAD');
  let r = work(dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', 'a.js');
  assert.match(r.out.error, /no passing verify-phase/);
  assert.equal(work(dir, 'verify-phase', 'feat', '1', '--', 'false').status, 1);
  r = work(dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', 'a.js');
  assert.match(r.out.error, /no passing verify-phase/);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
  assert.equal(git(dir, 'branch', '--show-current'), 'main', 'a refused commit does not even switch branch');
  assert.equal(git(dir, 'tag', '-l'), '');
});

test('the commit step refuses everything-staging and a dirty index', () => {
  const { dir } = fixture();
  ok(work(dir, 'run', 'new', 'road'));
  verify(dir);
  const head = git(dir, 'rev-parse', 'HEAD');
  for (const paths of ['.', '-A', ':/', '']) {
    assert.equal(work(dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', paths).status, 1, `paths "${paths}"`);
  }
  assert.match(work(dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', 'a.js,clean-nothing.js').out.error, /no change to commit/);
  git(dir, 'add', 'unrelated.txt');
  assert.match(work(dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', 'a.js').out.error, /already holds staged files/);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
});

test('a directory path is refused, so another slice\'s edit in it stays unstaged', () => {
  const { dir } = fixture();
  ok(work(dir, 'run', 'new', 'road'));
  verify(dir);
  write(dir, 'src/mine.js', 'mine\n');
  write(dir, 'src/theirs.js', 'theirs\n');
  const head = git(dir, 'rev-parse', 'HEAD');
  assert.match(work(dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', 'src').out.error, /directory/);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
  assert.equal(git(dir, 'diff', '--cached', '--name-only'), '', 'nothing was staged');
});

test('a retried phase commit after the commit landed returns the same sha and tag', () => {
  const { dir } = fixture();
  ok(work(dir, 'run', 'new', 'road'));
  verify(dir);
  // ./a.js is a file, not a directory, whatever form it is spelled in.
  const first = ok(work(dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', './a.js,b.js'));
  const again = ok(work(dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', 'a.js,b.js'));
  assert.equal(again.commit, first.commit);
  assert.equal(again.tag, first.tag);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), first.commit, 'no second commit');
  // The commit landed but the tag did not (a crash between them): the retry tags it.
  git(dir, 'tag', '-d', first.tag);
  assert.equal(ok(work(dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', 'a.js,b.js')).tag, first.tag);
  assert.equal(git(dir, 'rev-parse', `${first.tag}^{commit}`), first.commit);
});

test('a glob or deleted-directory path cannot stage another slice\'s edits', () => {
  const { dir } = fixture();
  ok(work(dir, 'run', 'new', 'road'));
  verify(dir);
  write(dir, 'src/mine.js', 'mine\n');
  write(dir, 'src/theirs.js', 'theirs\n');
  git(dir, 'add', 'src');
  git(dir, 'commit', '-qm', 'add src');
  write(dir, 'src/mine.js', 'mine2\n');
  write(dir, 'src/theirs.js', 'theirs2\n');
  const head = git(dir, 'rev-parse', 'HEAD');
  assert.equal(work(dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', 'src/*').status, 1);
  assert.equal(git(dir, 'diff', '--cached', '--name-only'), '');
  fs.rmSync(path.join(dir, 'src'), { recursive: true });
  assert.match(work(dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', 'src').out.error, /directory/);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
});

test('the first phase commit works in a repo with no commits yet', () => {
  const { dir } = fixture();
  ok(work(dir, 'run', 'new', 'road'));
  verify(dir);
  fs.rmSync(path.join(dir, '.git'), { recursive: true });
  git(dir, 'init', '-q', '-b', 'work');
  git(dir, 'config', 'user.name', 't');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'commit.gpgsign', 'false');
  assert.ok(ok(work(dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', 'a.js')).commit);
});

test('a phase retry with a new edit, or onto a different tag, is refused rather than skipped', () => {
  const { dir } = fixture();
  ok(work(dir, 'run', 'new', 'road'));
  verify(dir);
  const first = ok(work(dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', 'a.js,b.js'));
  write(dir, 'a.js', 'three\n');
  assert.match(work(dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', 'a.js').out.error, /already committed/);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), first.commit);
  git(dir, 'checkout', '-q', 'a.js');
  git(dir, 'tag', '-f', first.tag, 'HEAD~1');
  assert.match(work(dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', 'a.js,b.js').out.error, /already committed/);
});

test('a rejecting pre-commit hook leaves the branch, the index and the run record as they were', () => {
  const { dir } = fixture();
  ok(work(dir, 'run', 'new', 'road'));
  verify(dir);
  write(dir, '.git/hooks/pre-commit', '#!/bin/sh\nexit 1\n');
  fs.chmodSync(path.join(dir, '.git/hooks/pre-commit'), 0o755);
  const before = ok(work(dir, 'run', 'show', 'road'));
  const head = git(dir, 'rev-parse', 'HEAD');
  const r = work(dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', 'a.js', '--limits', '["no browser"]');
  assert.equal(r.status, 1);
  assert.equal(git(dir, 'branch', '--show-current'), 'main', 'back on the protected branch');
  assert.equal(git(dir, 'branch', '--list', 'do-it/road'), '', 'the branch it made is gone');
  assert.equal(git(dir, 'diff', '--cached', '--name-only'), '');
  assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
  const after = ok(work(dir, 'run', 'show', 'road'));
  assert.equal(after.branch, before.branch);
  assert.deepEqual(after.limits, before.limits);
  // With the hook gone the same call commits on do-it/road and records both.
  fs.rmSync(path.join(dir, '.git/hooks/pre-commit'));
  const done = ok(work(dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', 'a.js', '--limits', '["no browser"]'));
  assert.equal(done.branch, 'do-it/road');
  const rec = ok(work(dir, 'run', 'show', 'road'));
  assert.equal(rec.branch, 'do-it/road');
  assert.deepEqual(rec.limits, ['no browser']);
});

test('verification limits go to the run record and the commit body, not a trailer', () => {
  const { dir } = fixture();
  ok(work(dir, 'run', 'new', 'road'));
  verify(dir);
  const r = ok(work(dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', 'a.js', '--limits', '["no browser: UI not seen"]'));
  assert.deepEqual(r.limits, ['no browser: UI not seen']);
  assert.deepEqual(ok(work(dir, 'run', 'show', 'road')).limits, ['no browser: UI not seen']);
  const msg = git(dir, 'log', '-1', '--format=%B');
  assert.match(msg, /\n\nVerification limits:\n- no browser: UI not seen\n\nBuild assistance/);
  assert.equal(git(dir, 'log', '-1', '--format=%(trailers)'), '');
});

test('a lane S slice is one commit with no tag; mode none and slice rules hold', () => {
  const dir = tmpDir('do-it-runcommit-s-');
  git(dir, 'init', '-q', '-b', 'topic');
  git(dir, 'config', 'user.name', 't');
  git(dir, 'config', 'user.email', 't@t');
  write(dir, 'x.js', '1\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  ok(work(dir, 'new', 'small', '--lane', 's', '--title', 'Small fix'));
  ok(work(dir, 'event', 'small', 'approve'));
  ok(work(dir, 'event', 'small', 'start'));
  write(dir, 'x.js', '2\n');
  ok(work(dir, 'run', 'new', 'sl', '--commit', 'slice'));
  assert.match(work(dir, 'run', 'commit', 'sl', 'small', '--paths', 'x.js').out.error, /no passing verify-phase/);
  ok(work(dir, 'verify-phase', 'small', '--', 'true'));
  assert.match(work(dir, 'run', 'commit', 'sl', 'small', '--phase', '1', '--paths', 'x.js').out.error, /per slice/);
  const r = ok(work(dir, 'run', 'commit', 'sl', 'small', '--paths', 'x.js'));
  assert.equal(r.subject, 'small: Small fix');
  assert.equal(r.tag, null);
  assert.equal(git(dir, 'tag', '-l'), '');

  write(dir, 'x.js', '3\n');
  ok(work(dir, 'run', 'new', 'off', '--commit', 'none'));
  assert.match(work(dir, 'run', 'commit', 'off', 'small', '--paths', 'x.js').out.error, /mode none/);
});

test('a lane S slice closing docs commit uses --docs, so the subject differs from the code commit', () => {
  const dir = tmpDir('do-it-runcommit-sdocs-');
  git(dir, 'init', '-q', '-b', 'topic');
  git(dir, 'config', 'user.name', 't');
  git(dir, 'config', 'user.email', 't@t');
  write(dir, 'x.js', '1\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  ok(work(dir, 'new', 'small', '--lane', 's', '--title', 'Small fix'));
  ok(work(dir, 'event', 'small', 'approve'));
  ok(work(dir, 'event', 'small', 'start'));
  write(dir, 'x.js', '2\n');
  ok(work(dir, 'run', 'new', 'sl', '--commit', 'slice'));
  ok(work(dir, 'verify-phase', 'small', '--', 'true'));
  assert.equal(ok(work(dir, 'run', 'commit', 'sl', 'small', '--paths', 'x.js')).subject, 'small: Small fix');
  write(dir, 'notes.md', 'closing\n');
  const r = ok(work(dir, 'run', 'commit', 'sl', 'small', '--docs', '--paths', 'notes.md'));
  assert.equal(r.subject, 'small: closing docs');
  assert.equal(r.tag, null);
});

test('without a run record nothing commits, and build-it still forbids commits', () => {
  const { dir } = fixture();
  verify(dir);
  const head = git(dir, 'rev-parse', 'HEAD');
  assert.match(work(dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', 'a.js').out.error, /no run record/);
  assert.equal(git(dir, 'rev-parse', 'HEAD'), head);
  const text = fs.readFileSync(path.join(ROOT, 'skills/build-it/SKILL.md'), 'utf8');
  const rules = text.slice(text.indexOf('## Rules'));
  assert.match(rules, /No commits, no pushes, no stashes on the user's branch, unless a run record\s+exists/);
  assert.match(fs.readFileSync(path.join(ROOT, 'skills/build-it/COMMITS.md'), 'utf8'), /No run record: none of this applies/);
});

test('the run flag wins over DO_IT_COMMIT=never for that run, and never alone means none', () => {
  const { dir } = fixture({ config: 'DO_IT_COMMIT=never\n' });
  assert.equal(ok(work(dir, 'run', 'new', 'noflag')).commit, 'none');
  assert.equal(ok(work(dir, 'run', 'new', 'flagged', '--commit', 'phase')).commit, 'phase');
  verify(dir);
  assert.equal(ok(work(dir, 'run', 'commit', 'flagged', 'feat', '--phase', '1', '--paths', 'a.js')).tag, 'do-it/feat/phase-1');
  const plain = fixture();
  assert.equal(ok(work(plain.dir, 'run', 'new', 'x')).commit, 'phase', 'ask (the default) still defaults to phase');
});

test('the commit guard allows a run commit message and still blocks a secret in it', () => {
  const { dir } = fixture();
  ok(work(dir, 'run', 'new', 'road'));
  verify(dir);
  const r = ok(work(dir, 'run', 'commit', 'road', 'feat', '--phase', '1', '--paths', 'a.js', '--limits', '["no browser"]'));
  const msg = git(dir, 'log', '-1', '--format=%B');
  assert.equal(r.subject, msg.split('\n')[0]);
  const ctx = { root: dir, cwd: dir, cfg: { ...DEFAULTS }, enabled: true, rules: loadChecks(dir).rules };
  write(dir, 'b.js', 'fine\n');
  assert.equal(beforeShell(ctx, `git commit -m "${msg.replaceAll('"', '\\"')}" b.js`).action, 'allow');
  assert.equal(beforeShell(ctx, 'git commit -m "no id here" b.js').action, 'warn');
  write(dir, 'a.js', `const t = "${['xox', 'b-1234567890-abcdef'].join('')}";\n`);
  assert.equal(beforeShell(ctx, `git commit -m "feat: phase 2 Wire" a.js`).action, 'block');
});

test('lane M closing docs commit with --docs after every phase passed, untagged', () => {
  const { dir } = fixture();
  ok(work(dir, 'run', 'new', 'road'));
  write(dir, 'docs/notes.md', 'closing\n');
  assert.match(work(dir, 'run', 'commit', 'road', 'feat', '--paths', 'docs/notes.md').out.error, /--docs/);
  verify(dir);
  assert.match(work(dir, 'run', 'commit', 'road', 'feat', '--docs', '--paths', 'docs/notes.md').out.error, /not verified/);
  write(dir, 'docs/planning/feat/phase-2.md', '# Phase 2\n');
  verify(dir, 2);
  const r = ok(work(dir, 'run', 'commit', 'road', 'feat', '--docs', '--paths', 'docs/notes.md'));
  assert.equal(r.subject, 'feat: closing docs');
  assert.equal(r.tag, null);
  assert.equal(git(dir, 'tag', '-l'), '');
  assert.equal(git(dir, 'log', '-1', '--format=%B').split('\n').at(-1), LINE);
});

test('run add-assumptions merges per work id and is idempotent', () => {
  const { dir } = fixture();
  ok(work(dir, 'run', 'new', 'road'));
  ok(work(dir, 'run', 'set', 'road', 'assumptions', '["sweep default"]'));
  ok(work(dir, 'run', 'add-assumptions', 'road', 'feat', '["a","b"]'));
  ok(work(dir, 'run', 'add-assumptions', 'road', 'other', '["c"]'));
  const r = ok(work(dir, 'run', 'add-assumptions', 'road', 'feat', '["a2"]'));
  assert.deepEqual(r.assumptions, ['sweep default', 'other#1: c', 'feat#1: a2']);
});
