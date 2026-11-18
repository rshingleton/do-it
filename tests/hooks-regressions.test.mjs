// Regression tests for bugs found in the hooks and the OpenCode plugin.

import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { BUILTIN, scan, loadChecks } from '../hooks/lib/checks.mjs';
import { beforeEdit, afterEdit, beforeShell } from '../hooks/lib/guard.mjs';
import { EVENTS } from '../hooks/claude.mjs';
import { DEFAULTS } from '../skills/track-it/scripts/config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Assembled at runtime so this file never holds a key-shaped literal.
const KEY = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');

function repo() {
  const dir = tmpDir('do-it-hreg-');
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base');
  return { dir, git };
}

const ctxFor = (root, cfg = {}) => ({ root, cfg: { ...DEFAULTS, ...cfg }, enabled: true, rules: loadChecks(root).rules });

test('NotebookEdit content and path are scanned', () => {
  const ctx = ctxFor(repo().dir);
  assert.equal(beforeEdit(ctx, { notebook_path: 'n.ipynb', new_source: `k = '${KEY}'` }).action, 'block');
  assert.equal(beforeEdit(ctx, { notebook_path: '.env', new_source: 'x' }).action, 'block');
});

test('git commit -a / -am scans tracked changes that are not staged yet', () => {
  const { dir, git } = repo();
  fs.writeFileSync(path.join(dir, 't.py'), 'x = 1\n');
  git('add', 't.py');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 't');
  fs.writeFileSync(path.join(dir, 't.py'), `k = "${KEY}"\n`);
  const ctx = ctxFor(dir);
  assert.equal(beforeShell(ctx, 'git commit -am wip').action, 'block');
  assert.equal(beforeShell(ctx, 'git commit --all -m wip').action, 'block');

  // Before the first commit, -a still covers what the index holds.
  const fresh = tmpDir('do-it-hreg-');
  execFileSync('git', ['init', '-q'], { cwd: fresh });
  fs.writeFileSync(path.join(fresh, 'init.js'), `k = "${KEY}"\n`);
  execFileSync('git', ['add', 'init.js'], { cwd: fresh });
  assert.equal(beforeShell(ctxFor(fresh), 'git commit -am init').action, 'block');
});

test('commit detection: global options, no false hits on strings or commit-tree', () => {
  const { dir, git } = repo();
  fs.writeFileSync(path.join(dir, 'a.js'), `k = "${KEY}"\n`);
  git('add', 'a.js');
  const ctx = ctxFor(os.tmpdir());
  assert.equal(beforeShell(ctx, `git -C ${dir.replaceAll('\\', '/')} commit -m wip`).action, 'block');
  const here = ctxFor(dir);
  assert.equal(beforeShell(here, 'git -c user.name=x commit -m wip').action, 'block');
  assert.equal(beforeShell(here, "echo 'later: git commit'").action, 'allow');
  assert.equal(beforeShell(here, 'git commit-tree HEAD^{tree} -m x').action, 'allow');
});

test('lint command quotes paths so $ and backticks are not expanded', () => {
  const { dir } = repo();
  const file = path.join(dir, 'app/routes/$id.tsx');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x');
  assert.equal(afterEdit(ctxFor(dir, { DO_IT_LINT_CMD: 'node -e "require(\'fs\').statSync(process.argv[1])" {file}' }), { file_path: file }).action, 'allow');
});

test('interpolated credentials in URLs are not secrets', () => {
  const ids = (t) => scan(t, BUILTIN, 'a.env.example').map((f) => f.id);
  assert.deepEqual(ids('DATABASE_URL=postgres://${DB_USER}:${DB_PASS}@db:5432/app'), []);
  assert.deepEqual(ids('const u = `postgres://${user}:${password}@${host}`'), []);
  const literal = ['postgres://admin', 'hunter22@db/app'].join(':');
  assert.deepEqual(scan(literal, BUILTIN, 'a.js').map((f) => f.id), ['credential-in-url']);
});

test('env template variants are allowed', () => {
  for (const f of ['.env.local.example', 'cfg/.env.test.example', '.env.sample', '.env.template']) {
    assert.deepEqual(scan('', BUILTIN, f), [], f);
  }
  for (const f of ['.env', '.env.local', 'cfg/.env.production']) {
    assert.deepEqual(scan('', BUILTIN, f).map((x) => x.id), ['env-file'], f);
  }
});

test('sk- prefixed identifiers are not API keys', () => {
  assert.deepEqual(scan('import sk-learn-classifier-something-long-name', BUILTIN, 'a.py'), []);
  const real = ['sk-', 'proj-', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join('');
  assert.deepEqual(scan(`k = "${real}"`, BUILTIN, 'a.py').map((f) => f.id), ['openai-anthropic-key']);
});

test('OpenCode: apply_patch is guarded, removed lines are not, patched .env is', async () => {
  const { dir } = repo();
  const { DoItPlugin: plugin } = await import('../.opencode/do-it-plugin/do-it.mjs');
  const hooks = await plugin({ directory: dir });
  const before = (tool, args) => hooks['tool.execute.before']({ tool }, { args });
  await assert.rejects(
    before('apply_patch', { patchText: `*** Begin Patch\n*** Update File: a.js\n@@\n+k = "${KEY}"\n*** End Patch` }),
    /aws-access-key/,
  );
  await before('patch', { patchText: `*** Begin Patch\n*** Update File: a.js\n@@\n-k = "${KEY}"\n*** End Patch` });
  await assert.rejects(before('patch', { patchText: '*** Begin Patch\n*** Add File: .env\n+A=1\n*** End Patch' }), /env-file/);
});

// An apply_patch touching a.js then b.py, with `added` on b.py's side only.
const twoFilePatch = (added) =>
  ['*** Begin Patch', '*** Update File: a.js', '@@', '-old', '+const a = 1', '*** Add File: b.py', `+${added}`, '*** End Patch'].join('\n');

test('a secret in the second file of a patch blocks and names that file', () => {
  const r = beforeEdit(ctxFor(repo().dir), { patchText: twoFilePatch(`k = "${KEY}"`) });
  assert.equal(r.action, 'block');
  assert.match(r.reason, /aws-access-key in b\.py:1/);
});

test('a rule scoped to one extension sees only its own file in a patch', () => {
  const { dir } = repo();
  fs.mkdirSync(path.join(dir, '.compliance-rules'));
  fs.writeFileSync(
    path.join(dir, '.compliance-rules', 'checks.json'),
    JSON.stringify([{ id: 'no-print', severity: 'MEDIUM', pattern: 'print\\(', files: ['.js'] }]),
  );
  assert.equal(beforeEdit(ctxFor(dir), { patchText: twoFilePatch('print(1)') }).action, 'allow');
});

test('an added line that looks like a diff header is still scanned (audit 1)', () => {
  const ctx = ctxFor(repo().dir);
  const patch = (header) => ['*** Begin Patch', '*** Add File: notes.md', header, `+k = "${KEY}"`, '*** End Patch'].join('\n');
  assert.equal(beforeEdit(ctx, { patchText: patch('+++ /dev/null') }).action, 'block');
  assert.match(beforeEdit(ctx, { patchText: patch('+++ b/other.md') }).reason, /in notes\.md:2/);
});

test('a moved env file is still caught by its old path (audit 1)', () => {
  const patch = ['*** Begin Patch', '*** Update File: .env', '*** Move to: config.txt', '@@', '-A=1', '+A=2', '*** End Patch'].join('\n');
  assert.match(beforeEdit(ctxFor(repo().dir), { patchText: patch }).reason, /env-file in \.env/);
});

test('every file in a patch is linted, in edit order', () => {
  const { dir } = repo();
  const ctx = ctxFor(dir, { DO_IT_LINT_CMD: 'node -e "if (process.argv[1].endsWith(\'.py\')) process.exit(1)" {file}' });
  const r = afterEdit(ctx, { patchText: twoFilePatch('x = 1') });
  assert.equal(r.action, 'feedback');
  assert.match(r.message, /lint failed for b\.py/);
  assert.doesNotMatch(r.message, /a\.js/);

  const spawn = (cmd) => (cmd.includes('a.js') ? { signal: 'SIGTERM' } : { status: 1, stdout: 'bad' });
  const ordered = afterEdit(ctxFor(dir, { DO_IT_LINT_CMD: 'lint {file}' }), { patchText: twoFilePatch('x = 1') }, { spawn });
  assert.match(ordered.message, /^do-it lint timed out[^\n]*a\.js['"]\n\ndo-it lint failed for b\.py/);
});

test('no added line is dropped from the scan, whatever the patch does with its path (audit 2)', () => {
  const ctx = ctxFor(repo().dir);
  const secret = `+k = "${KEY}"`;
  const applyPatch = (...lines) => ['*** Begin Patch', ...lines, '*** End Patch'].join('\n');
  const blocked = [
    applyPatch('*** Update File: a.txt', '*** Move to: a.txt', '@@', secret),
    applyPatch('*** Update File: a.txt', '*** Move to: b.txt', '*** Add File: a.txt', secret),
    applyPatch('*** Update File: a.txt', '*** Move to: b.txt', '*** Update File: c.txt', '*** Move to: a.txt', secret),
    applyPatch('*** Delete File: old.txt', secret),
  ];
  for (const patchText of blocked) assert.equal(beforeEdit(ctx, { patchText }).action, 'block', patchText);
  const unified = (...lines) => ['--- a/x.js', '+++ b/x.js', '@@ -1 +1,3 @@', ...lines].join('\n');
  assert.equal(beforeEdit(ctx, { patch: unified('+++ /dev/null', secret) }).action, 'block');
  assert.equal(beforeEdit(ctx, { patch: ['--- a/y.js', '+++ /dev/null', '@@', secret].join('\n') }).action, 'block');
});

test('a header pair inside a hunk still names its file (audit 4)', () => {
  const { dir } = repo();
  fs.mkdirSync(path.join(dir, '.compliance-rules'));
  fs.writeFileSync(
    path.join(dir, '.compliance-rules', 'checks.json'),
    JSON.stringify([{ id: 'no-evil', severity: 'HIGH', pattern: 'EVIL', files: ['.js'] }]),
  );
  const ctx = ctxFor(dir);
  const bare = ['--- a/a.txt', '+++ b/a.txt', '@@', '+x', '--- a/.env', '+++ b/.env', '@@', '+FOO=bar'].join('\n');
  assert.match(beforeEdit(ctx, { patch: bare }).reason, /env-file in \.env/);
  const overCount = ['--- a/a.txt', '+++ b/a.txt', '@@ -1,3 +1,3 @@', ' ctx', '--- a/.env', '+++ b/.env', '+FOO=bar'].join('\n');
  assert.match(beforeEdit(ctx, { patch: overCount }).reason, /env-file in \.env/);
  const steered = ['--- a/n.txt', '+++ b/n.txt', '@@', '+a', '--- a/x.js', '+++ b/x.js', '@@', '+EVIL'].join('\n');
  assert.match(beforeEdit(ctx, { patch: steered }).reason, /no-evil in x\.js/);
  // An in-hunk +++ path that is not dev-null is scanned under that path.
  const named = ['--- a/a.txt', '+++ b/a.txt', '@@ -0,0 +1,3 @@', '--- a/x.txt', '+++ b/y.js', '+EVIL'].join('\n');
  assert.match(beforeEdit(ctx, { patch: named }).reason, /no-evil in y\.js/);
  const clean = ['--- a/a.txt', '+++ b/a.txt', '@@ -0,0 +1,3 @@', '--- a/x.txt', '+++ b/y.txt', '+EVIL'].join('\n');
  assert.equal(beforeEdit(ctx, { patch: clean }).action, 'allow', 'the same line under a path the rule does not cover');
  // A unified header in an apply_patch body, with or without a --- line, names its file.
  assert.match(beforeEdit(ctx, { patch: ['*** Begin Patch', '--- a/x', '+++ b/.env', '@@', '-a', '+A=1'].join('\n') }).reason, /env-file in \.env/);
  assert.match(beforeEdit(ctx, { patch: '+++ b/.env\n@@ -0,0 +1 @@\n+x' }).reason, /env-file in \.env/);
  // diff -u timestamps and git quoting do not hide the path.
  for (const header of ['+++ .env\t2024-01-01 00:00:00', '+++ "b/.env"']) {
    assert.match(beforeEdit(ctx, { patch: ['--- a/x', header, '@@ -0,0 +1 @@', '+A=1'].join('\n') }).reason, /env-file in \.env/, header);
  }
});

test('header-looking lines inside a hunk are content, not a new file (audit 3)', () => {
  const { dir } = repo();
  fs.mkdirSync(path.join(dir, '.compliance-rules'));
  fs.writeFileSync(
    path.join(dir, '.compliance-rules', 'checks.json'),
    JSON.stringify([{ id: 'no-evil', severity: 'HIGH', pattern: 'EVIL', files: ['.py'] }]),
  );
  const ctx = ctxFor(dir);
  const unified = ['--- a/x.py', '+++ b/x.py', '@@ -1,2 +1,3 @@', '--- c', '+++ c', '+EVIL'].join('\n');
  assert.match(beforeEdit(ctx, { patch: unified }).reason, /no-evil in x\.py/);
  // `+++ AKIA...` is an added line `++ AKIA...`, scanned like any other.
  const hidden = ['--- a/x.py', '+++ b/x.py', '@@ -1 +1 @@', '--- c', `+++ ${KEY}`].join('\n');
  assert.equal(beforeEdit(ctx, { patch: hidden }).action, 'block');
  const prefixed = ['junk', '*** Begin Patch', '*** Update File: x.py', '@@', '--- c', '+++ c', '+EVIL', '*** End Patch'].join('\n');
  assert.match(beforeEdit(ctx, { patchText: prefixed }).reason, /no-evil in x\.py/);
});

test('a file that is gone after the edit is not linted (audit 3)', () => {
  const linted = [];
  const spawn = (cmd) => (linted.push(cmd), { status: 0 });
  const patch = ['*** Begin Patch', '*** Update File: old.js', '*** Move to: new.js', '*** Delete File: dead.js', '*** End Patch'].join('\n');
  afterEdit(ctxFor(repo().dir, { DO_IT_LINT_CMD: 'lint {file}' }), { patchText: patch }, { spawn });
  assert.equal(linted.length, 1);
  assert.match(linted[0], /new\.js['"]$/);
});

test('an in-hunk dev-null pair cannot exempt a line from a scoped rule or an exception (R25)', () => {
  const rulesFor = (rule) => {
    const { dir } = repo();
    fs.mkdirSync(path.join(dir, '.compliance-rules'));
    fs.writeFileSync(path.join(dir, '.compliance-rules', 'checks.json'), JSON.stringify([{ id: 'no-evil', severity: 'HIGH', pattern: 'EVIL', ...rule }]));
    return ctxFor(dir);
  };
  const patch = (...lines) => ['--- a/a.txt', '+++ b/a.txt', '@@ -0,0 +1,3 @@', ...lines].join('\n');
  const scoped = rulesFor({ files: ['.py'], exceptFilePattern: '\\.txt$' });
  assert.match(beforeEdit(scoped, { patch: patch('--- a/x.py', '+++ /dev/null', '+EVIL') }).reason, /no-evil in x\.py/);
  // The old path is excepted too, so only the empty-path scan can catch it.
  const excepted = rulesFor({ exceptFilePattern: '\\.txt$' });
  assert.equal(beforeEdit(excepted, { patch: patch('--- a/y.txt', '+++ /dev/null', '+EVIL') }).action, 'block');
  assert.equal(beforeEdit(excepted, { patch: patch('--- /dev/null', '+++ /dev/null', '+EVIL') }).action, 'block');
  // The scan ends at the next file header.
  const later = ['--- a/a.txt', '+++ b/a.txt', '@@ -0,0 +1,2 @@', '--- a/y.txt', '+++ /dev/null', '+ok', '--- a/b.txt', '+++ b/b.txt', '@@ -0,0 +1 @@', '+EVIL'].join('\n');
  assert.equal(beforeEdit(excepted, { patch: later }).action, 'allow');
  const laterScoped = later.replace('a/y.txt', 'a/x.py');
  assert.equal(beforeEdit(scoped, { patch: laterScoped }).action, 'allow');
  // A pair with no old path keeps the file an earlier in-hunk pair named.
  const kept = patch('--- a/x.py', '+++ b/y.py', '--- /dev/null', '+++ /dev/null', '+EVIL').replace('+1,3', '+1,4');
  assert.match(beforeEdit(scoped, { patch: kept }).reason, /no-evil in y\.py/);

  // The same inside an apply_patch body: an embedded unified section cannot
  // exempt a line from a scoped rule, and the dev-null pair cannot steer it.
  const body = (...lines) => ['*** Begin Patch', '*** Update File: a.txt', '@@', ...lines, '*** End Patch'].join('\n');
  assert.match(beforeEdit(scoped, { patchText: body('--- a/x.py', '+++ b/x.py', '+EVIL') }).reason, /no-evil in x\.py/);
  const endOfBlock = ['*** Begin Patch', '*** Update File: a.txt', '--- a/x.py', '+++ b/x.py', '*** Update File: b.txt', '@@', '+EVIL', '*** End Patch'].join('\n');
  assert.equal(beforeEdit(scoped, { patchText: endOfBlock }).action, 'allow');
  const embeddedDelete = ['*** Begin Patch', '*** Update File: a.txt', '--- a/x.py', '+++ /dev/null', '+EVIL', '*** End Patch'].join('\n');
  assert.equal(beforeEdit(rulesFor({ files: ['.py'] }), { patchText: embeddedDelete }).action, 'block');
  assert.equal(beforeEdit(rulesFor({ exceptFilePattern: 'a\\.txt$' }), { patchText: embeddedDelete }).action, 'block');
});

test('lines added after a delete are also scanned past the deleted path (audit 5)', () => {
  const { dir } = repo();
  fs.mkdirSync(path.join(dir, '.compliance-rules'));
  fs.writeFileSync(
    path.join(dir, '.compliance-rules', 'checks.json'),
    JSON.stringify([{ id: 'no-evil', severity: 'HIGH', pattern: 'EVIL', exceptFilePattern: '\\.txt$' }]),
  );
  const ctx = ctxFor(dir);
  const forms = {
    'apply_patch delete': { patchText: ['*** Begin Patch', '*** Delete File: old.txt', '+EVIL', '*** End Patch'].join('\n') },
    'unified delete': { patch: ['--- a/old.txt', '+++ /dev/null', '@@ -1 +0,0 @@', '+EVIL'].join('\n') },
    'unified delete, no old path': { patch: ['+++ /dev/null', '@@', '+EVIL'].join('\n') },
  };
  for (const [name, input] of Object.entries(forms)) {
    const r = beforeEdit(ctx, input);
    assert.equal(r.action, 'block', name);
    assert.equal(r.reason.match(/^- \[HIGH\] no-evil/gm).length, 1, name);
  }
});

test('every built-in pattern stays fast on a long line of its own prefixes', () => {
  // Each unit repeats a pattern's start, the shape that makes a pattern
  // restart inside one run and rescan it.
  const units = ['y', 'a:', 'a://', 'a://b:', '1a://', '-sk', 'sk-', 'sk-ant-a-', '-eyJ', 'eyJaaaaaaaaaaaa.', 'xoxb-', 'ghp_', 'github_pat_', 'AIza', 'AKIA', 'password=', "password='", '-----BEGIN A', 'TODO insert '];
  for (const unit of units) {
    const start = Date.now();
    scan(unit.repeat(Math.ceil(1e6 / unit.length)), BUILTIN, 'big.min.js');
    assert.ok(Date.now() - start < 5000, `${JSON.stringify(unit)} took ${Date.now() - start} ms`);
  }
});

test('anchored patterns still match where the old ones did', () => {
  const ids = (t) => scan(t, BUILTIN, 'a.js').map((f) => f.id);
  // credential-in-url, mid-line, after another colon.
  assert.deepEqual(ids(['db = "postgres://admin', 'hunter22@db'].join(':')), ['credential-in-url']);
});

test('an unresolvable earlier git add may stage an untracked file: its secret blocks the commit', () => {
  const { dir } = repo();
  fs.writeFileSync(path.join(dir, 'n.js'), `k = "${KEY}"\n`);
  const ctx = ctxFor(dir);
  assert.equal(beforeShell(ctx, 'git add $(ls) && git commit -m x').action, 'block');
  assert.equal(beforeShell(ctx, 'X=. && cd $X && git add n.js && git commit -m x').action, 'block');
  // Nothing stages the file, so the commit records nothing of it.
  assert.equal(beforeShell(ctx, 'cd $X && git commit -m "t: x"').action, 'allow');
});

test('a new untracked file named on a git commit path line is scanned', () => {
  const { dir } = repo();
  fs.writeFileSync(path.join(dir, 'n.js'), `k = "${KEY}"\n`);
  fs.writeFileSync(path.join(dir, 'ok.js'), 'fine = 1\n');
  const ctx = ctxFor(dir);
  const res = beforeShell(ctx, 'git commit -m "t: x" n.js');
  assert.equal(res.action, 'block');
  assert.match(res.reason, /n\.js/);
  assert.equal(beforeShell(ctx, 'git commit -m "t: x" ok.js').action, 'allow');
});

test('a 3,000-file staged commit is scanned inside the hook timeout', () => {
  const { dir, git } = repo();
  for (let i = 0; i < 3000; i++) fs.writeFileSync(path.join(dir, `f${i}.js`), i === 2990 ? `k = "${KEY}"\n` : `line ${i}\n`);
  git('add', '-A');
  const start = Date.now();
  const res = beforeShell(ctxFor(dir), 'git commit -m x');
  assert.ok(Date.now() - start < 10000, `took ${Date.now() - start} ms`);
  assert.equal(res.action, 'block');
  assert.match(res.reason, /f2990\.js/);
});

test('path rules match a backslash path (T87)', () => {
  const ctx = ctxFor(repo().dir);
  const r = beforeEdit(ctx, { file_path: 'app\\.env', content: '' });
  assert.equal(r.action, 'block');
  assert.match(r.reason, /env-file in app[\\/]\.env/);
  assert.equal(beforeEdit(ctx, { file_path: 'app\\.env.example', content: '' }).action, 'allow');
});

test('hooks.json event names and commands match the events claude.mjs handles', () => {
  const handled = { ...Object.fromEntries(Object.entries(EVENTS).map(([arg, [, name]]) => [arg, name])), stop: 'Stop', 'subagent-stop': 'SubagentStop' };
  const { hooks } = JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks/hooks.json'), 'utf8'));
  const wired = {};
  for (const [name, groups] of Object.entries(hooks)) {
    for (const { hooks: list } of groups) {
      for (const { command } of list) {
        const arg = command.match(/claude\.mjs"? (\S+)$/)?.[1];
        assert.equal(handled[arg], name, `${name} runs "${command}"`);
        wired[arg] = name;
      }
    }
  }
  assert.deepEqual(wired, handled);
});

