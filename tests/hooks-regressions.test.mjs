// Regression tests for bugs found in the hooks and the OpenCode plugin.

import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { BUILTIN, scan, loadChecks, editParts } from '../hooks/lib/checks.mjs';
import { beforeEdit, afterEdit, beforeShell } from '../hooks/lib/guard.mjs';
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
});

test('commit detection: global options, no false hits on strings or commit-tree', () => {
  const { dir, git } = repo();
  fs.writeFileSync(path.join(dir, 'a.js'), `k = "${KEY}"\n`);
  git('add', 'a.js');
  const ctx = ctxFor(os.tmpdir());
  assert.equal(beforeShell(ctx, `git -C ${dir} commit -m wip`).action, 'block');
  const here = ctxFor(dir);
  assert.equal(beforeShell(here, 'git -c user.name=x commit -m wip').action, 'block');
  assert.equal(beforeShell(here, "echo 'later: git commit'").action, 'allow');
  assert.equal(beforeShell(here, 'git commit-tree HEAD^{tree} -m x').action, 'allow');
});

test('staged non-ASCII paths are scanned', () => {
  const { dir, git } = repo();
  fs.writeFileSync(path.join(dir, 'café.py'), `k = "${KEY}"\n`);
  git('add', 'café.py');
  assert.equal(beforeShell(ctxFor(dir), 'git commit -m x').action, 'block');
});

test('lint command quotes paths so $ and backticks are not expanded', () => {
  const { dir } = repo();
  const file = path.join(dir, 'app/routes/$id.tsx');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x');
  assert.equal(afterEdit(ctxFor(dir, { DO_IT_LINT_CMD: 'ls {file}' }), { file_path: file }).action, 'allow');
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
  const { DoItPlugin: plugin } = await import('../.opencode/plugins/do-it.mjs');
  const hooks = await plugin({ directory: dir });
  const before = (tool, args) => hooks['tool.execute.before']({ tool }, { args });
  await assert.rejects(
    before('apply_patch', { patchText: `*** Begin Patch\n*** Update File: a.js\n@@\n+k = "${KEY}"\n*** End Patch` }),
    /aws-access-key/,
  );
  await before('patch', { patchText: `*** Begin Patch\n*** Update File: a.js\n@@\n-k = "${KEY}"\n*** End Patch` });
  await assert.rejects(before('patch', { patchText: '*** Begin Patch\n*** Add File: .env\n+A=1\n*** End Patch' }), /env-file/);
});

test('claude post-tool reports lint failures as additionalContext', () => {
  const { dir } = repo();
  const r = spawnSync('node', [path.join(ROOT, 'hooks/claude.mjs'), 'post-tool'], {
    input: JSON.stringify({ cwd: dir, tool_name: 'Edit', tool_input: { file_path: 'a.js', new_string: 'x' } }),
    encoding: 'utf8',
    env: { ...process.env, DO_IT_LINT_CMD: 'echo bad; exit 1' },
  });
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(out.hookSpecificOutput.additionalContext, /lint failed[\s\S]*bad/);
});

test('claude.mjs can be imported when argv[1] is not a file (bug 10)', () => {
  const url = new URL('../hooks/claude.mjs', import.meta.url).href;
  const r = spawnSync('node', ['--input-type=module', '-e', `await import(${JSON.stringify(url)}); console.log('imported')`, 'no-such-file'], {
    encoding: 'utf8',
    input: '',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /imported/);
});

test('the it-core header is stripped from a CRLF file (bug 10)', async () => {
  const { coreText } = await import('../hooks/lib/context.mjs');
  const file = path.join(tmpDir('do-it-crlf-'), 'SKILL.md');
  fs.writeFileSync(file, '---\r\nname: it-core\r\ndescription: x\r\n---\r\n# Posture\r\nbody\r\n');
  const text = coreText(file);
  assert.doesNotMatch(text, /name: it-core/);
  assert.match(text, /^# Posture/);
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

test('lint results for several files come back in edit order (audit 1)', () => {
  const { dir } = repo();
  const spawn = (cmd) => (cmd.includes('a.js') ? { signal: 'SIGTERM' } : { status: 1, stdout: 'bad' });
  const r = afterEdit(ctxFor(dir, { DO_IT_LINT_CMD: 'lint {file}' }), { patchText: twoFilePatch('x = 1') }, { spawn });
  assert.equal(r.action, 'feedback');
  assert.match(r.message, /^do-it lint timed out[^\n]*a\.js'\n\ndo-it lint failed for b\.py/);
});

test('every file in a patch is linted', () => {
  const { dir } = repo();
  const ctx = ctxFor(dir, { DO_IT_LINT_CMD: 'case {file} in *.py) echo bad {file}; exit 1;; esac' });
  const r = afterEdit(ctx, { patchText: twoFilePatch('x = 1') });
  assert.equal(r.action, 'feedback');
  assert.match(r.message, /lint failed for b\.py/);
  assert.doesNotMatch(r.message, /a\.js/);
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

test('a unified header in an apply_patch body still gets path rules (audit 2)', () => {
  const patch = ['*** Begin Patch', '--- a/x', '+++ b/.env', '@@', '-a', '+A=1'].join('\n');
  assert.match(beforeEdit(ctxFor(repo().dir), { patch }).reason, /env-file in \.env/);
});

test('a unified file header needs no --- line before it (audit 3)', () => {
  assert.match(beforeEdit(ctxFor(repo().dir), { patch: '+++ b/.env\n@@ -0,0 +1 @@\n+x' }).reason, /env-file in \.env/);
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
  assert.match(linted[0], /new\.js'$/);
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
});

test('an embedded unified section cannot exempt a line from a scoped rule (audit 5)', () => {
  const { dir } = repo();
  fs.mkdirSync(path.join(dir, '.compliance-rules'));
  fs.writeFileSync(
    path.join(dir, '.compliance-rules', 'checks.json'),
    JSON.stringify([{ id: 'no-evil', severity: 'HIGH', pattern: 'EVIL', files: ['.py'], exceptFilePattern: '\\.txt$' }]),
  );
  const ctx = ctxFor(dir);
  const patch = (...lines) => ['*** Begin Patch', '*** Update File: a.txt', '@@', ...lines, '*** End Patch'].join('\n');
  assert.match(beforeEdit(ctx, { patchText: patch('--- a/x.py', '+++ b/x.py', '+EVIL') }).reason, /no-evil in x\.py/);
  // The scope ends at the next block, so a later file is not scanned as x.py.
  const later = ['*** Begin Patch', '*** Update File: a.txt', '--- a/x.py', '+++ b/x.py', '*** Update File: b.txt', '@@', '+EVIL', '*** End Patch'].join('\n');
  assert.equal(beforeEdit(ctx, { patchText: later }).action, 'allow');
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
});

test('diff -u timestamps and git quoting do not hide a header path (audit 4)', () => {
  const ctx = ctxFor(repo().dir);
  for (const header of ['+++ .env\t2024-01-01 00:00:00', '+++ "b/.env"']) {
    const patch = ['--- a/x', header, '@@ -0,0 +1 @@', '+A=1'].join('\n');
    assert.match(beforeEdit(ctx, { patch }).reason, /env-file in \.env/, header);
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
  // credential-in-url, mid-line, after another colon, and after a scheme
  // run that starts with a flag letter, a digit, + or .
  for (const prefix of ['db = "postgres://admin', 'jdbc:postgresql://admin', '-dpostgres://admin', '1mysql://root', '+mongodb+srv://u', '.redis://u']) {
    assert.deepEqual(ids([prefix, 'hunter22@db'].join(':')), ['credential-in-url'], prefix);
  }
  const key = ['sk', 'proj', 'Ab1'.repeat(12)].join('-');
  const jwt = ['eyJ' + 'a'.repeat(12), 'eyJ' + 'b'.repeat(12), 'c'.repeat(12)].join('.');
  for (const before of ['', ' ', '"', '=', ':']) {
    assert.deepEqual(ids(`${before}${key}`), ['openai-anthropic-key'], `key after ${JSON.stringify(before)}`);
    assert.deepEqual(ids(`${before}${jwt}`), ['jwt'], `jwt after ${JSON.stringify(before)}`);
  }
});

// A textconv driver that decodes a base64 file, so a token can hide in it.
function b64Driver(dir, git) {
  fs.writeFileSync(path.join(dir, 'dec.mjs'), "import fs from 'node:fs';\nprocess.stdout.write(Buffer.from(fs.readFileSync(process.argv[2], 'utf8').trim(), 'base64'));\n");
  fs.writeFileSync(path.join(dir, '.gitattributes'), '*.b64 diff=b64\n');
  git('config', 'diff.b64.textconv', `node ${path.join(dir, 'dec.mjs')}`);
}

test('an unresolvable earlier git add may stage an untracked file: its secret blocks the commit', () => {
  const { dir } = repo();
  fs.writeFileSync(path.join(dir, 'n.js'), `k = "${KEY}"\n`);
  const ctx = ctxFor(dir);
  assert.equal(beforeShell(ctx, 'git add $(ls) && git commit -m x').action, 'block');
  assert.equal(beforeShell(ctx, 'X=. && cd $X && git add n.js && git commit -m x').action, 'block');
  // Nothing stages the file, so the commit records nothing of it.
  assert.equal(beforeShell(ctx, 'cd $X && git commit -m "t: x"').action, 'allow');
});

test('an untracked file named by an earlier git add is read through its textconv driver', () => {
  const { dir, git } = repo();
  b64Driver(dir, git);
  fs.writeFileSync(path.join(dir, 's.b64'), Buffer.from(`k = "${KEY}"\n`).toString('base64'));
  const ctx = ctxFor(dir);
  assert.equal(beforeShell(ctx, 'git add s.b64 && git commit -m x').action, 'block');
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

// An apply_patch whose first block is a.txt and which embeds a unified delete of x.py.
const embeddedDelete = ['*** Begin Patch', '*** Update File: a.txt', '--- a/x.py', '+++ /dev/null', '+EVIL', '*** End Patch'].join('\n');

function repoWithRules(rules) {
  const { dir } = repo();
  fs.mkdirSync(path.join(dir, '.compliance-rules'));
  fs.writeFileSync(path.join(dir, '.compliance-rules', 'checks.json'), JSON.stringify(rules));
  return ctxFor(dir);
}

test('an embedded dev-null pair scans its added lines under the old path and the empty path', () => {
  const parts = editParts({ patchText: embeddedDelete });
  const under = (file) => parts.find((p) => p.file === file);
  assert.match(under('a.txt').added, /EVIL/);
  assert.match(under('x.py').added, /EVIL/);
  assert.equal(under('x.py').gone, true);
  assert.match(under('').added, /EVIL/);
});

test('an embedded dev-null pair cannot steer a line past a scoped rule', () => {
  const rule = { id: 'no-evil', severity: 'HIGH', pattern: 'EVIL' };
  const scoped = repoWithRules([{ ...rule, files: ['.py'] }]);
  assert.equal(beforeEdit(scoped, { patchText: embeddedDelete }).action, 'block');
  const excepted = repoWithRules([{ ...rule, exceptFilePattern: 'a\\.txt$' }]);
  assert.equal(beforeEdit(excepted, { patchText: embeddedDelete }).action, 'block');
});

test('the embedded dev-null scan ends at the next block', () => {
  const patch = ['*** Begin Patch', '*** Update File: a.txt', '--- a/x.py', '+++ /dev/null', '+one', '*** Update File: b.txt', '+two', '*** End Patch'].join('\n');
  const parts = editParts({ patchText: patch });
  assert.doesNotMatch(parts.find((p) => p.file === 'x.py').added, /two/);
  assert.doesNotMatch(parts.find((p) => p.file === '').added, /two/);
});

test('an old path the patch also updates stays an existing file', () => {
  const patch = ['*** Begin Patch', '*** Update File: x.py', '*** Update File: a.txt', '--- a/x.py', '+++ /dev/null', '+EVIL', '*** End Patch'].join('\n');
  assert.equal(editParts({ patchText: patch }).find((p) => p.file === 'x.py').gone, undefined);
});

test('path rules match a backslash path (T87)', () => {
  const ctx = ctxFor(repo().dir);
  const r = beforeEdit(ctx, { file_path: 'app\\.env', content: '' });
  assert.equal(r.action, 'block');
  assert.match(r.reason, /env-file in app\\\.env/);
  assert.equal(beforeEdit(ctx, { file_path: 'app\\.env.example', content: '' }).action, 'allow');
});

test('carriesVoice is true only for an agent file that holds the voice marker, and false on a read error', async () => {
  const { carriesVoice } = await import('../hooks/claude.mjs');
  const { START } = await import('../scripts/lib/voice.mjs');
  const dir = tmpDir('do-it-voice-');
  fs.writeFileSync(path.join(dir, 'with.md'), `body\n\n${START}\nV\n<!-- voice:end -->\n`);
  fs.writeFileSync(path.join(dir, 'without.md'), 'body\n');
  fs.mkdirSync(path.join(dir, 'dir.md'));
  assert.equal(carriesVoice('with', dir), true);
  assert.equal(carriesVoice('without', dir), false);
  assert.equal(carriesVoice('missing', dir), false);
  assert.equal(carriesVoice('dir', dir), false);
});
