// The change-set module's addedLines: what a change adds, at which lines.

import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { addedLines } from '../skills/do-it/scripts/changeset.mjs';

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

test('an added line that starts with ++ is kept', () => {
  const { dir, write, commit } = gitRepo();
  commit();
  write('p.js', '++ x\n+++ y\n');
  assert.deepEqual(byFile(addedLines(dir, { against: 'staged' })), {});
  execFileSync('git', ['add', 'p.js'], { cwd: dir });
  assert.deepEqual(byFile(addedLines(dir, { against: 'staged' })), {
    'p.js': [
      { n: 1, text: '++ x' },
      { n: 2, text: '+++ y' },
    ],
  });
});

test('non-ASCII and quote-bearing names come back exact', () => {
  const { dir, git, write, commit } = gitRepo();
  commit();
  write('naïve.js', 'a\n');
  write('q"uote.js', 'b\n');
  write('tab\there.js', 'c\n');
  git('add', '-A');
  assert.deepEqual(addedLines(dir, { against: 'staged' }).map((f) => f.file).sort(), ['naïve.js', 'q"uote.js', 'tab\there.js']);
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

test('a mode change and an empty new file are listed with no lines', () => {
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

test('with no commits, staged files are listed for staged and for a base', () => {
  const { dir, git, write } = gitRepo();
  write('a.js', 'a\n');
  git('add', 'a.js');
  assert.deepEqual(byFile(addedLines(dir, { against: 'staged' })), { 'a.js': [{ n: 1, text: 'a' }] });
  assert.deepEqual(byFile(addedLines(dir, { against: 'HEAD' })), { 'a.js': [{ n: 1, text: 'a' }] });
});

test('repo config cannot replace, colour or narrow the diff', () => {
  const { dir, git, write, commit } = gitRepo();
  write('sub/x.js', 'x\n');
  commit();
  write('.gitattributes', '*.js diff=hide\n');
  git('config', 'diff.hide.textconv', 'sh -c "echo hidden"');
  git('config', 'diff.external', 'sh -c "echo external"');
  git('config', 'color.diff', 'always');
  git('config', 'color.ui', 'always');
  git('config', 'diff.relative', 'true');
  git('config', 'diff.noprefix', 'true');
  git('config', 'diff.mnemonicPrefix', 'true');
  write('sub/x.js', 'x\nreal\n');
  write('top.js', 'top\n');
  git('add', '-A');
  assert.deepEqual(byFile(addedLines(path.join(dir, 'sub'), { against: 'staged' })), {
    '.gitattributes': [{ n: 1, text: '*.js diff=hide' }],
    'sub/x.js': [{ n: 2, text: 'real' }],
    // The driver's output is read as well as the file, never instead of it.
    'top.js': [
      { n: 1, text: 'top' },
      { n: 1, text: 'hidden' },
    ],
  });
});

test('an unknown base ref throws instead of reporting no change', () => {
  const { dir, commit } = gitRepo();
  commit();
  assert.throws(() => addedLines(dir, { against: 'nosuchref' }), /unknown base ref: nosuchref/);
});

test('untracked regular files are read whole; other entries get no lines', () => {
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
});

test('untracked as pathspecs reads only the untracked files they match', () => {
  const { dir, write, commit } = gitRepo();
  commit();
  write('a.js', 'one\n');
  write('b.js', 'two\n');
  write('sub/c.js', 'three\n');
  assert.deepEqual(byFile(addedLines(dir, { untracked: ['b.js'] })), { 'b.js': [{ n: 1, text: 'two' }] });
  assert.deepEqual(byFile(addedLines(path.join(dir, 'sub'), { untracked: ['c.js'] })), { 'sub/c.js': [{ n: 1, text: 'three' }] });
  assert.deepEqual(addedLines(dir, { untracked: ['nothing.js'] }), []);
});

test('a type change and an unmerged path still list every file with its lines', () => {
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

test('a submodule bump under diff.submodule=log does not hide other files', () => {
  const inner = gitRepo();
  inner.write('i', 'i\n');
  inner.commit();
  const { dir, git, write, commit } = gitRepo();
  git('-c', 'protocol.file.allow=always', 'submodule', '-q', 'add', inner.dir, 'sub');
  commit();
  inner.write('i', 'i\nj\n');
  inner.commit();
  execFileSync('git', ['pull', '-q', 'origin', 'HEAD'], { cwd: path.join(dir, 'sub'), stdio: 'ignore' });
  git('config', 'diff.submodule', 'log');
  write('z.js', 'z\n');
  git('add', 'sub', 'z.js');
  const files = byFile(addedLines(dir, { against: 'staged' }));
  assert.deepEqual(files['z.js'], [{ n: 1, text: 'z' }]);
  assert.ok('sub' in files);
});

test('a file git treats as binary is read as text', () => {
  const { dir, git, write, commit } = gitRepo();
  commit();
  write('nul.dat', 'x\0y\nseen\n');
  write('a.js', 'a\n');
  git('add', '-A');
  assert.deepEqual(byFile(addedLines(dir, { against: 'staged' })), {
    'a.js': [{ n: 1, text: 'a' }],
    'nul.dat': [
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

test('works with a git that predates --no-relative', () => {
  const { dir, git, write, commit } = gitRepo();
  commit();
  write('a.js', 'a\n');
  git('add', 'a.js');
  // A git on PATH that rejects --no-relative the way git before 2.28 does.
  const bin = tmpDir('do-it-oldgit-');
  const real = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\nfor a in "$@"; do [ "$a" = --no-relative ] && exit 129; done\nexec "${real}" "$@"\n`, { mode: 0o755 });
  const saved = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${saved}`;
  try {
    assert.deepEqual(byFile(addedLines(dir, { against: 'staged' })), { 'a.js': [{ n: 1, text: 'a' }] });
  } finally {
    process.env.PATH = saved;
  }
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
});

test('diff.interHunkContext does not shift line numbers', () => {
  const { dir, git, write, commit } = gitRepo();
  write('f.txt', Array.from({ length: 20 }, (_, i) => `${i + 1}`).join('\n') + '\n');
  commit();
  write('f.txt', Array.from({ length: 20 }, (_, i) => (i === 1 || i === 5 ? `X${i + 1}` : `${i + 1}`)).join('\n') + '\n');
  git('config', 'diff.interHunkContext', '5');
  assert.deepEqual(byFile(addedLines(dir)), {
    'f.txt': [
      { n: 2, text: 'X2' },
      { n: 6, text: 'X6' },
    ],
  });
});

test('a file that is slow to diff gets path rules only and does not hold up the rest', () => {
  const { dir, git, write, commit } = gitRepo();
  // A text file of random short lines rewritten: small output, slow to diff.
  const random = () => Array.from({ length: 1e6 }, () => (Math.random() < 0.5 ? 'a' : 'b')).join('\n') + '\n';
  write('slow.txt', random());
  commit();
  write('slow.txt', random());
  write('small.js', 's\n');
  git('add', '-A');
  const start = Date.now();
  const files = byFile(addedLines(dir, { against: 'staged' }));
  assert.ok(Date.now() - start < 6000, `took ${Date.now() - start} ms`);
  assert.deepEqual(files['small.js'], [{ n: 1, text: 's' }]);
  assert.deepEqual(files['slow.txt'], []);
});

test('a file whose diff fails is listed with no lines and the rest are still read', () => {
  const { dir, git, write, commit } = gitRepo();
  write('a.txt', 'a\n');
  write('locked/z.txt', 'z\n');
  commit();
  write('a.txt', 'a\nmore\n');
  write('locked/z.txt', 'z\nmore\n');
  const locked = path.join(dir, 'locked/z.txt');
  fs.chmodSync(locked, 0o000);
  try {
    assert.deepEqual(byFile(addedLines(dir)), {
      'a.txt': [{ n: 2, text: 'more' }],
      'locked/z.txt': [],
    });
  } finally {
    fs.chmodSync(locked, 0o644);
  }
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
});

test('a binary costs two diffs: the listing view, then as text', () => {
  const { dir, git, write, commit } = gitRepo();
  write('.gitattributes', '*.tx diff=tx\n');
  git('config', 'diff.tx.textconv', 'cat');
  for (let i = 0; i < 20; i++) write(`b${i}.bin`, `a\0${i}\n`);
  commit();
  for (let i = 0; i < 20; i++) write(`b${i}.bin`, `c\0${i}\n`);
  git('add', '-A');
  // A git on PATH that counts its calls.
  const bin = tmpDir('do-it-countgit-');
  const real = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const log = path.join(bin, 'calls');
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\necho x >> "${log}"\nexec "${real}" "$@"\n`, { mode: 0o755 });
  const saved = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${saved}`;
  try {
    const files = byFile(addedLines(dir, { against: 'staged' }));
    assert.equal(Object.keys(files).length, 20);
  } finally {
    process.env.PATH = saved;
  }
  const calls = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).length;
  // Two diffs per file, plus the listing and a few lookups.
  assert.ok(calls <= 2 * 20 + 6, `${calls} git calls for 20 binaries`);
});

test('GIT_DIFF_OPTS and diff.suppressBlankEmpty do not lose or shift lines', () => {
  const { dir, git, write, commit } = gitRepo();
  const before = ['1', '', '3', '4', '5', '6', '7', '8', '9', '10', '', '12'];
  write('f.txt', before.join('\n') + '\n');
  commit();
  const after = [...before];
  after[2] = 'NEW3';
  after[11] = 'NEW12';
  write('f.txt', after.join('\n') + '\n');
  git('config', 'diff.suppressBlankEmpty', 'true');
  const saved = process.env.GIT_DIFF_OPTS;
  process.env.GIT_DIFF_OPTS = '-u3';
  try {
    assert.deepEqual(byFile(addedLines(dir))['f.txt'], [
      { n: 3, text: 'NEW3' },
      { n: 12, text: 'NEW12' },
    ]);
  } finally {
    if (saved === undefined) delete process.env.GIT_DIFF_OPTS;
    else process.env.GIT_DIFF_OPTS = saved;
  }
});

function b64Driver({ dir, git, write }, sleepMs = 0) {
  write('dec.mjs', `import fs from 'node:fs';\nAtomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${sleepMs});\nprocess.stdout.write(Buffer.from(fs.readFileSync(process.argv[2], 'utf8').trim(), 'base64'));\n`);
  write('.gitattributes', '*.b64 diff=b64\n');
  git('config', 'diff.b64.textconv', `node ${path.join(dir, 'dec.mjs')}`);
}

test('an untracked file with a textconv driver is read raw and through the driver', () => {
  const r = gitRepo();
  b64Driver(r);
  r.write('s.b64', Buffer.from('decoded secret\n').toString('base64'));
  const lines = byFile(addedLines(r.dir, { untracked: ['s.b64'] }))['s.b64'].map((l) => l.text);
  assert.ok(lines.includes('decoded secret'));
  assert.ok(lines.includes(Buffer.from('decoded secret\n').toString('base64')));
});

test('textconv diffs of driven files share the time budget', () => {
  const r = gitRepo();
  b64Driver(r, 1000);
  for (let i = 0; i < 5; i++) r.write(`s${i}.b64`, Buffer.from(`secret ${i}\n`).toString('base64'));
  r.git('add', '-A');
  const start = Date.now();
  const files = addedLines(r.dir, { against: 'staged', budget: { deadline: Date.now() + 500 } });
  assert.ok(Date.now() - start < 2500, `took ${Date.now() - start} ms`);
  const driven = files.filter((f) => f.file.endsWith('.b64'));
  assert.equal(driven.length, 5);
  for (const f of driven) assert.ok(f.lines.length >= 1, `${f.file} keeps its raw lines`);
});

test('three thousand staged files read the same as one at a time', () => {
  const r = gitRepo();
  for (let i = 0; i < 3000; i++) r.write(`d/f${i}.js`, `a${i}\nb${i}\n`);
  r.git('add', '-A');
  const files = byFile(addedLines(r.dir, { against: 'staged' }));
  assert.equal(Object.keys(files).length, 3000);
  for (const i of [0, 1500, 2999]) assert.deepEqual(files[`d/f${i}.js`], [{ n: 1, text: `a${i}` }, { n: 2, text: `b${i}` }]);
});
