// The change-set module's addedLines: what a change adds, at which lines.

import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { addedLines, fingerprint } from '../skills/do-it/scripts/changeset.mjs';

function gitRepo() {
  const dir = tmpDir('do-it-cs-');
  // An identity on every call: merge needs one too, and CI runners have none.
  const git = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  const write = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  };
  const commit = () => {
    git('add', '-A');
    git('commit', '-q', '--allow-empty', '-m', 'c');
  };
  return { dir, git, write, commit };
}

const byFile = (files) => Object.fromEntries(files.map((f) => [f.file, f.lines]));

test('added lines carry their line number in the new file', () => {
  const { dir, write, commit } = gitRepo();
  write('a.js', 'one\ntwo\nthree\nfour\nfive\n');
  commit();
  write('a.js', 'one\nNEW2\ntwo\nthree\nfour\nfive\nNEW7\n');
  assert.deepEqual(byFile(addedLines(dir)), {
    'a.js': [
      { n: 2, text: 'NEW2' },
      { n: 7, text: 'NEW7' },
    ],
  });
});

// NTFS refuses a double quote or a tab in a name; an apostrophe and a space stand in.
const QUOTED = process.platform === 'win32' ? "q'uote.js" : 'q"uote.js';
const TABBED = process.platform === 'win32' ? 'sp ace.js' : 'tab\there.js';

test('non-ASCII and quote-bearing names come back exact', () => {
  const { dir, git, write, commit } = gitRepo();
  commit();
  write('naïve.js', 'a\n');
  write(QUOTED, 'b\n');
  write(TABBED, 'c\n');
  git('add', '-A');
  assert.deepEqual(addedLines(dir, { against: 'staged' }).map((f) => f.file).sort(), ['naïve.js', QUOTED, TABBED].sort());
});

test('staged sees only the index; a ref sees the working tree', () => {
  const { dir, git, write, commit } = gitRepo();
  write('a.js', 'a\n');
  write('b.js', 'b\n');
  commit();
  write('a.js', 'a\nstaged\n');
  git('add', 'a.js');
  write('b.js', 'b\nworking\n');
  assert.deepEqual(byFile(addedLines(dir, { against: 'staged' })), { 'a.js': [{ n: 2, text: 'staged' }] });
  assert.deepEqual(byFile(addedLines(dir, { against: 'HEAD' })), {
    'a.js': [{ n: 2, text: 'staged' }],
    'b.js': [{ n: 2, text: 'working' }],
  });
  // Before the first commit there is no HEAD to compare: staged files are the change.
  const fresh = gitRepo();
  fresh.write('a.js', 'a\n');
  fresh.git('add', 'a.js');
  assert.deepEqual(byFile(addedLines(fresh.dir, { against: 'staged' })), { 'a.js': [{ n: 1, text: 'a' }] });
  assert.deepEqual(byFile(addedLines(fresh.dir, { against: 'HEAD' })), { 'a.js': [{ n: 1, text: 'a' }] });
});

test('paths resolve against cwd and names come back top-relative', () => {
  const { dir, write, commit } = gitRepo();
  write('sub/x.js', 'x\n');
  write('top.js', 't\n');
  commit();
  write('sub/x.js', 'x\nmore\n');
  write('top.js', 't\nmore\n');
  const sub = path.join(dir, 'sub');
  assert.deepEqual(addedLines(sub, { paths: ['x.js'] }).map((f) => f.file), ['sub/x.js']);
  assert.deepEqual(addedLines(sub).map((f) => f.file), ['sub/x.js', 'top.js']);
});

test('a mode change and an empty new file are listed with no lines', { skip: process.platform === 'win32' && 'POSIX mode bits' }, () => {
  const { dir, git, write, commit } = gitRepo();
  write('run.sh', 'echo\n');
  commit();
  fs.chmodSync(path.join(dir, 'run.sh'), 0o755);
  write('empty.js', '');
  write('real.js', 'r\n');
  git('add', '-A');
  assert.deepEqual(byFile(addedLines(dir, { against: 'staged' })), {
    'empty.js': [],
    'real.js': [{ n: 1, text: 'r' }],
    'run.sh': [],
  });
});

test('a renamed file is read as a whole added file; a deleted one is left out', () => {
  const { dir, git, write, commit } = gitRepo();
  write('old.js', 'kept\n');
  write('gone.js', 'bye\n');
  commit();
  git('mv', 'old.js', 'new.js');
  git('rm', '-q', 'gone.js');
  assert.deepEqual(byFile(addedLines(dir, { against: 'staged' })), { 'new.js': [{ n: 1, text: 'kept' }] });
});

test('repo config cannot replace, colour or narrow the diff', () => {
  const { dir, git, write, commit } = gitRepo();
  write('sub/x.js', 'x\n');
  const blanks = ['1', '', '3', '4', '5', '6', '7', '8', '9', '10', '', '12'];
  write('g.txt', blanks.join('\n') + '\n');
  write('h.txt', Array.from({ length: 20 }, (_, i) => `${i + 1}`).join('\n') + '\n');
  commit();
  // A submodule bump must not hide the other files' lines.
  const inner = gitRepo();
  inner.write('i', 'i\n');
  inner.commit();
  git('-c', 'protocol.file.allow=always', 'submodule', '-q', 'add', inner.dir, 'mod');
  commit();
  inner.write('i', 'i\nj\n');
  inner.commit();
  execFileSync('git', ['pull', '-q', 'origin', 'HEAD'], { cwd: path.join(dir, 'mod'), stdio: 'ignore' });
  write('.gitattributes', '*.js diff=hide\n');
  git('config', 'diff.hide.textconv', 'sh -c "echo hidden"');
  git('config', 'diff.external', 'sh -c "echo external"');
  git('config', 'color.diff', 'always');
  git('config', 'color.ui', 'always');
  git('config', 'diff.relative', 'true');
  git('config', 'diff.noprefix', 'true');
  git('config', 'diff.mnemonicPrefix', 'true');
  git('config', 'diff.submodule', 'log');
  git('config', 'diff.interHunkContext', '5');
  git('config', 'diff.suppressBlankEmpty', 'true');
  write('sub/x.js', 'x\nreal\n');
  write('top.js', 'top\n');
  const after = [...blanks];
  after[2] = 'NEW3';
  after[11] = 'NEW12';
  write('g.txt', after.join('\n') + '\n');
  write('h.txt', Array.from({ length: 20 }, (_, i) => (i === 1 || i === 5 ? `X${i + 1}` : `${i + 1}`)).join('\n') + '\n');
  git('add', '-A');
  const saved = process.env.GIT_DIFF_OPTS;
  process.env.GIT_DIFF_OPTS = '-u3';
  let files;
  try {
    files = byFile(addedLines(path.join(dir, 'sub'), { against: 'staged' }));
  } finally {
    if (saved === undefined) delete process.env.GIT_DIFF_OPTS;
    else process.env.GIT_DIFF_OPTS = saved;
  }
  assert.deepEqual(files['.gitattributes'], [{ n: 1, text: '*.js diff=hide' }]);
  assert.deepEqual(files['sub/x.js'], [{ n: 2, text: 'real' }]);
  // The driver's output is read as well as the file, never instead of it.
  assert.deepEqual(files['top.js'], [
    { n: 1, text: 'top' },
    { n: 1, text: 'hidden' },
  ]);
  // A submodule bump under diff.submodule=log is listed and hides nothing.
  assert.ok('mod' in files);
  // diff.interHunkContext does not shift line numbers.
  assert.deepEqual(files['h.txt'], [
    { n: 2, text: 'X2' },
    { n: 6, text: 'X6' },
  ]);
  // GIT_DIFF_OPTS and diff.suppressBlankEmpty do not lose or shift lines.
  assert.deepEqual(files['g.txt'], [
    { n: 3, text: 'NEW3' },
    { n: 12, text: 'NEW12' },
  ]);
});

test('untracked regular files are read whole; other entries get no lines', { skip: process.platform === 'win32' && 'unprivileged symlinks' }, () => {
  const { dir, write, commit } = gitRepo();
  commit();
  write('new.js', 'one\ntwo\n');
  fs.symlinkSync('/etc/hosts', path.join(dir, 'link'));
  write('ignored.log', 'x\n');
  write('.gitignore', '*.log\n');
  assert.deepEqual(byFile(addedLines(dir, { untracked: true })), {
    '.gitignore': [{ n: 1, text: '*.log' }],
    link: [],
    'new.js': [
      { n: 1, text: 'one' },
      { n: 2, text: 'two' },
    ],
  });
  // As pathspecs, only the untracked files they match, resolved against cwd.
  write('sub/c.js', 'three\n');
  assert.deepEqual(byFile(addedLines(path.join(dir, 'sub'), { untracked: ['c.js'] })), { 'sub/c.js': [{ n: 1, text: 'three' }] });
  assert.deepEqual(byFile(addedLines(dir, { untracked: ['new.js'] })), {
    'new.js': [
      { n: 1, text: 'one' },
      { n: 2, text: 'two' },
    ],
  });
  assert.deepEqual(addedLines(dir, { untracked: ['nothing.js'] }), []);
});

test('a type change and an unmerged path still list every file with its lines', { skip: process.platform === 'win32' && 'unprivileged symlinks' }, () => {
  const { dir, git, write, commit } = gitRepo();
  write('f', 'f\n');
  fs.symlinkSync('f', path.join(dir, 'l'));
  write('m.txt', 'base\n');
  commit();
  git('checkout', '-q', '-b', 'other');
  write('m.txt', 'other\n');
  commit();
  git('checkout', '-q', '-');
  write('m.txt', 'mine\n');
  commit();
  try {
    git('merge', '-q', 'other');
  } catch {
    // The conflict is the point: m.txt is now unmerged.
  }
  assert.match(git('ls-files', '-u'), /m\.txt/, 'the merge left m.txt unmerged');
  fs.rmSync(path.join(dir, 'l'));
  write('l', 'now a file\n');
  write('z.js', 'z\n');
  git('add', 'l', 'z.js');
  const files = byFile(addedLines(dir, { against: 'staged' }));
  assert.deepEqual(files.l, [{ n: 1, text: 'now a file' }]);
  assert.deepEqual(files['z.js'], [{ n: 1, text: 'z' }]);
  assert.ok('m.txt' in files);
});

test('a file git treats as binary is read as text', () => {
  const { dir, git, write, commit } = gitRepo();
  commit();
  write('zero.dat', 'x\0y\nseen\n');
  write('a.js', 'a\n');
  git('add', '-A');
  assert.deepEqual(byFile(addedLines(dir, { against: 'staged' })), {
    'a.js': [{ n: 1, text: 'a' }],
    'zero.dat': [
      { n: 1, text: 'x\0y' },
      { n: 2, text: 'seen' },
    ],
  });
});

test('a file whose diff is over the cap keeps path rules only; a large file with a small change is still read', () => {
  const { dir, git, write, commit } = gitRepo();
  write('big.txt', 'line\n'.repeat(600000));
  commit();
  fs.appendFileSync(path.join(dir, 'big.txt'), 'tail\n');
  fs.writeFileSync(path.join(dir, 'huge.bin'), crypto.randomBytes(20 * 1024 * 1024));
  write('small.js', 's\n');
  git('add', '-A');
  assert.deepEqual(byFile(addedLines(dir, { against: 'staged' })), {
    'big.txt': [{ n: 600001, text: 'tail' }],
    'huge.bin': [],
    'small.js': [{ n: 1, text: 's' }],
  });
});

test('a line break other than \\n cannot forge a file section', () => {
  const { dir, git, write, commit } = gitRepo();
  write('u.txt', 'base\n');
  commit();
  git('checkout', '-q', '-b', 'other');
  write('u.txt', 'other\n');
  commit();
  git('checkout', '-q', '-');
  write('u.txt', 'mine\n');
  commit();
  try {
    git('merge', '-q', 'other');
  } catch {
    // u.txt is now unmerged, so it has no section in the staged patch.
  }
  assert.match(git('ls-files', '-u'), /u\.txt/, 'the merge left u.txt unmerged');
  for (const sep of ['\r', ' ', ' ']) {
    write('a.txt', `ok${sep}diff --git a/u.txt b/u.txt\nafter\n`);
    git('add', 'a.txt');
    const files = byFile(addedLines(dir, { against: 'staged' }));
    assert.deepEqual(files['a.txt'], [
      { n: 1, text: `ok${sep}diff --git a/u.txt b/u.txt` },
      { n: 2, text: 'after' },
    ], JSON.stringify(sep));
  }
  // An added line that starts with ++ is content, never the +++ header.
  write('p.js', '++ x\n+++ y\n');
  git('add', 'p.js');
  assert.deepEqual(byFile(addedLines(dir, { against: 'staged' }))['p.js'], [
    { n: 1, text: '++ x' },
    { n: 2, text: '+++ y' },
  ]);
});

test('a file that is slow, fails or is driven gets path rules only and does not hold up the rest', () => {
  const { dir, git, write, commit } = gitRepo();
  // A text file of random short lines rewritten: small output, slow to diff.
  const random = () => Array.from({ length: 1e6 }, () => (Math.random() < 0.5 ? 'a' : 'b')).join('\n') + '\n';
  write('slow.txt', random());
  write('locked/z.txt', 'z\n');
  commit();
  write('slow.txt', random());
  write('small.js', 's\n');
  write('locked/z.txt', 'z\nmore\n');
  git('add', '-A');
  const start = Date.now();
  const files = byFile(addedLines(dir, { against: 'staged' }));
  assert.ok(Date.now() - start < 6000, `took ${Date.now() - start} ms`);
  assert.deepEqual(files['small.js'], [{ n: 1, text: 's' }]);
  assert.deepEqual(files['slow.txt'], []);
  if (process.platform !== 'win32') {
    // A file whose diff fails is listed with no lines, and the rest are still read.
    const locked = path.join(dir, 'locked/z.txt');
    fs.chmodSync(locked, 0o000);
    try {
      const unstaged = byFile(addedLines(dir));
      assert.deepEqual(unstaged['locked/z.txt'], []);
      assert.deepEqual(unstaged['small.js'], [{ n: 1, text: 's' }]);
    } finally {
      fs.chmodSync(locked, 0o644);
    }
  }
  // Textconv diffs of driven files share the time budget.
  git('reset', '-q', '--', 'slow.txt');
  git('checkout', '--', 'slow.txt');
  b64Driver({ dir, git, write }, 1000);
  for (let i = 0; i < 5; i++) write(`s${i}.b64`, Buffer.from(`secret ${i}\n`).toString('base64'));
  git('add', '-A');
  const drivenStart = Date.now();
  const driven = addedLines(dir, { against: 'staged', budget: { deadline: Date.now() + 500 } }).filter((f) => f.file.endsWith('.b64'));
  assert.ok(Date.now() - drivenStart < 2500, `took ${Date.now() - drivenStart} ms`);
  assert.equal(driven.length, 5);
  for (const f of driven) assert.ok(f.lines.length >= 1, `${f.file} keeps its raw lines`);
});

test('a binary with a textconv driver is read raw and through the driver', () => {
  const { dir, git, write, commit } = gitRepo();
  write('.gitattributes', '*.bin diff=tx\n');
  git('config', 'diff.tx.textconv', "tr -d '\\000' <");
  commit();
  write('x.bin', 'head\0\nseen\n');
  git('add', '-A');
  assert.deepEqual(byFile(addedLines(dir, { against: 'staged' }))['x.bin'], [
    { n: 1, text: 'head\0' },
    { n: 2, text: 'seen' },
    { n: 1, text: 'head' },
  ]);
  // An untracked file with a driver is read raw and through the driver too.
  b64Driver({ dir, git, write });
  write('s.b64', Buffer.from('decoded secret\n').toString('base64'));
  const lines = byFile(addedLines(dir, { untracked: ['s.b64'] }))['s.b64'].map((l) => l.text);
  assert.ok(lines.includes('decoded secret'));
  assert.ok(lines.includes(Buffer.from('decoded secret\n').toString('base64')));
});

function b64Driver({ dir, git, write }, sleepMs = 0) {
  write('dec.mjs', `import fs from 'node:fs';\nAtomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${sleepMs});\nprocess.stdout.write(Buffer.from(fs.readFileSync(process.argv[2], 'utf8').trim(), 'base64'));\n`);
  write('.gitattributes', '*.b64 diff=b64\n');
  git('config', 'diff.b64.textconv', `node ${path.join(dir, 'dec.mjs').replaceAll('\\', '/')}`);
}

test('fingerprint hashes base..working tree and survives commits after the base', () => {
  const { dir, git, write, commit } = gitRepo();
  write('a.js', 'one\n');
  commit();
  const base = git('rev-parse', 'HEAD').trim();
  assert.equal(fingerprint(dir, base), fingerprint(dir, base), 'stable with no change');
  write('a.js', 'two\n');
  write('b.js', 'new\n');
  const before = fingerprint(dir, base);
  commit();
  assert.equal(fingerprint(dir, base), before, 'committing the same change leaves the hash equal');
  write('c.js', 'more\n');
  assert.notEqual(fingerprint(dir, base), before, 'a new file changes it');
  commit();
  const mid = fingerprint(dir, base);
  write('a.js', 'three\n');
  assert.notEqual(fingerprint(dir, base), mid, 'an edit after a commit changes it');
  write('a.js', 'two\n');
  assert.equal(fingerprint(dir, base), mid, 'reverting the edit restores it');
  // A tracked or untracked edit changes it, from a clean or a dirty base.
  write('d.js', 'one\n');
  const withUntracked = fingerprint(dir, base);
  write('d.js', 'two\n');
  assert.notEqual(fingerprint(dir, base), withUntracked, 'an edit to an untracked file changes it');
  // Nothing ship-it writes as closing docs counts as moved code.
  const steady = fingerprint(dir, base, { exclude: ['docs/planning'] });
  write('docs/planning/x.md', 'plan\n');
  assert.equal(fingerprint(dir, base, { exclude: ['docs/planning'] }), steady, 'a planning file is left out');
});

test('fingerprint narrowed to paths is the change in those files alone', () => {
  const { dir, git, write, commit } = gitRepo();
  write('a.js', 'one\n');
  write('b.js', 'one\n');
  commit();
  const base = git('rev-parse', 'HEAD').trim();
  write('a.js', 'two\n');
  write('b.js', 'two\n');
  const mine = fingerprint(dir, base, { paths: ['a.js'] });
  write('b.js', 'another item wrote here\n');
  assert.equal(fingerprint(dir, base, { paths: ['a.js'] }), mine, 'a change outside the list leaves the hash');
  write('a.js', 'three\n');
  assert.notEqual(fingerprint(dir, base, { paths: ['a.js'] }), mine, 'a change inside the list moves it');
  assert.notEqual(fingerprint(dir, base), fingerprint(dir, base, { paths: ['a.js'] }), 'the whole-tree hash still sees both files');
});

test('a partly staged excluded path does not break the snapshot', () => {
  const { dir, git, write, commit } = gitRepo();
  write('docs/TODO.md', 'a\n');
  write('a.js', 'one\n');
  commit();
  write('docs/TODO.md', 'a\nb\n');
  git('add', 'docs/TODO.md');
  write('docs/TODO.md', 'a\nb\nc\n');
  const before = git('diff', '--cached', '--name-only');
  assert.doesNotThrow(() => fingerprint(dir, 'HEAD', { exclude: ['docs/TODO.md'] }));
  assert.equal(git('diff', '--cached', '--name-only'), before, 'the real index is untouched');
});
