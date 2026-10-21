import { test } from 'node:test';
import assert from 'node:assert/strict';

import { commandWords, parseGitCommit, parseGitCommits } from '../hooks/lib/shell.mjs';

const words = (s) => commandWords(s).words;

test('commandWords removes quotes and keeps quoted spaces in one word', () => {
  assert.deepEqual(words('git commit -m "a b" x'), ['git', 'commit', '-m', 'a b', 'x']);
  assert.deepEqual(words("echo 'a  b' c"), ['echo', 'a  b', 'c']);
  assert.deepEqual(words("echo $'a\\'b' c"), ['echo', "a'b", 'c']);
});

test('commandWords stops at the first unquoted ; & | or newline', () => {
  assert.deepEqual(words('a && b'), ['a']);
  assert.deepEqual(words('a b;c d'), ['a', 'b']);
  assert.deepEqual(words('a | b'), ['a']);
  assert.deepEqual(words('a b\nc d'), ['a', 'b']);
  assert.deepEqual(words('a "b;c" d'), ['a', 'b;c', 'd']);
});

test('commandWords keeps $(...) whole and reads its nested quotes', () => {
  assert.deepEqual(words('a $(b; c) d'), ['a', '$(b; c)', 'd']);
  assert.deepEqual(words('a $(b ")" c) d'), ['a', '$(b ")" c)', 'd']);
});

test('commandWords drops redirects, their targets and file descriptor numbers', () => {
  assert.deepEqual(words('a 2>&1 b'), ['a', 'b']);
  assert.deepEqual(words('a >out b'), ['a', 'b']);
  assert.deepEqual(words('a &>out b'), ['a', 'b']);
  assert.deepEqual(words('a <in b'), ['a', 'b']);
});

test('commandWords ends a heredoc operator at its delimiter and keeps the line', () => {
  assert.deepEqual(words('a <<EOF\nbody\nEOF'), ['a']);
  assert.deepEqual(words('a <<EOF b'), ['a', 'b']);
});

test('commandWords reports quoting that never closes as not sure', () => {
  assert.equal(commandWords('a "open').sure, false);
  assert.equal(commandWords("a 'open").sure, false);
  assert.equal(commandWords('a $(open').sure, false);
  assert.equal(commandWords('a "closed" b').sure, true);
});

test('parseGitCommit keeps the paths that follow a redirect', () => {
  for (const cmd of [
    'git commit -m x 2>&1 a.js',
    'git commit -m x >/dev/null a.js',
    'git commit -m x 2>/dev/null a.js',
    'git commit -m x &>/dev/null a.js',
    'git commit -m x >&2 a.js',
  ]) {
    assert.deepEqual(parseGitCommit(cmd).paths, ['a.js'], cmd);
  }
});

const stagesOf = (cmd) => parseGitCommits(cmd).map((c) => c.stages.map(({ all, paths }) => ({ all, paths })));

test('parseGitCommits gives each commit the index-changing commands before it', () => {
  assert.deepEqual(stagesOf('git commit -m x'), [[]]);
  assert.deepEqual(stagesOf('git add b.js && git commit -m x'), [[{ all: false, paths: ['b.js'] }]]);
  assert.deepEqual(stagesOf('git commit -m a && git add b.js && git commit -m b'), [[], [{ all: false, paths: ['b.js'] }]]);
  assert.deepEqual(stagesOf('git stage -- c.js d.js; git commit'), [[{ all: false, paths: ['c.js', 'd.js'] }]]);
  assert.deepEqual(stagesOf('env X=1 git add . && git commit'), [[{ all: false, paths: ['.'] }]]);
  assert.equal(parseGitCommits('git -C sub add c.js && git commit')[0].stages[0].dir, 'sub');
});

test('parseGitCommits reads the add flags that stage more than the named paths as all', () => {
  for (const cmd of ['git add -A', 'git add --all', 'git add -u', 'git add -p', 'git add -i', 'git add -e', 'git add -fA x', 'git add --pathspec-from-file=l', 'git add "open']) {
    assert.equal(parseGitCommits(`${cmd} && git commit`)[0].stages[0].all, true, cmd);
  }
  assert.equal(parseGitCommits('git add -f b.js && git commit')[0].stages[0].all, false);
});

test('parseGitCommits reads a stage path inside a subshell without its closing paren', () => {
  assert.deepEqual(stagesOf('(cd sub && git add n.js); git commit -m x'), [[{ all: false, paths: ['n.js)', 'n.js'] }]]);
  assert.deepEqual(stagesOf('(git add a.js b.js) && git commit'), [[{ all: false, paths: ['a.js', 'b.js)', 'b.js'] }]]);
});

test('parseGitCommits marks an add with -f or --force', () => {
  const force = (cmd) => parseGitCommits(`${cmd} && git commit`)[0].stages[0].force;
  assert.equal(force('git add -f a.js'), true);
  assert.equal(force('git add --force a.js'), true);
  assert.equal(force('git stage -fv a.js'), true);
  assert.equal(force('git add a.js'), false);
  assert.equal(force('git rm -f a.js'), false);
});

test('parseGitCommits: rm names no paths and mv names its sources', () => {
  assert.deepEqual(stagesOf('git rm -r old && git commit'), [[{ all: false, paths: [] }]]);
  assert.deepEqual(stagesOf('git mv a.js b.js && git commit'), [[{ all: false, paths: ['a.js'] }]]);
  assert.deepEqual(stagesOf('git mv a.js b.js dir && git commit'), [[{ all: false, paths: ['a.js', 'b.js'] }]]);
});
