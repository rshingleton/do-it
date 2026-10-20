import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { BUILTIN, scan, loadChecks } from '../hooks/lib/checks.mjs';
import { parseGitCommit, beforeShell } from '../hooks/lib/guard.mjs';
import { DEFAULTS, loadConfig, trust } from '../skills/track-it/scripts/config.mjs';
import { run } from '../skills/track-it/scripts/tracker.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Fake secrets are assembled at runtime so this file never holds one literally.
const FAKE_AWS = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-trust-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

// The developer's own do-it config and DO_IT_* variables must not leak in.
function cleanEnv(extra = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-home-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(DO_IT_|JIRA_|GITHUB_)/.test(k)));
  return { ...env, HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), ...extra };
}


function writeChecks(root, value) {
  fs.mkdirSync(path.join(root, '.compliance-rules'), { recursive: true });
  fs.writeFileSync(path.join(root, '.compliance-rules', 'checks.json'), typeof value === 'string' ? value : JSON.stringify(value));
}

const MALFORMED = [
  null,
  'nope',
  { id: 'a', severity: 'MEDIUM', pattern: 'TICKET', files: '.ts' },
  { id: 'b', severity: 3, pattern: 'y' },
  { pattern: 'no-id' },
  { id: 'c' },
  { disabled: true },
];

test('loadChecks skips malformed entries, names them, keeps the rest', () => {
  const root = repo();
  writeChecks(root, MALFORMED);
  const { rules, error } = loadChecks(root);
  for (const r of BUILTIN) assert.ok(rules.some((x) => x.id === r.id), r.id);
  assert.deepEqual(scan('TICKET', rules, 'x.ts').map((f) => f.id), ['a']);
  assert.deepEqual(scan('TICKET', rules, 'x.js'), []);
  assert.ok(!rules.some((r) => r.id === 'b' || r.id === 'c' || r.pattern === 'no-id'));
  assert.match(error, /checks\.json/);
  assert.match(error, /entry 4 \(b\)/);
  assert.match(error, /entry 5/);
  assert.match(error, /entry 6 \(c\)/);
  assert.match(error, /entry 1/);
});

test('OpenCode plugin allows an edit when the rules file is malformed, still blocks secrets', async () => {
  const root = repo();
  writeChecks(root, MALFORMED);
  const { default: plugin } = await import('../.opencode/plugins/do-it.mjs');
  const hooks = await plugin({ directory: root });
  await hooks['tool.execute.before']({ tool: 'write' }, { args: { filePath: path.join(root, 'b.ts'), content: 'bar' } });
  await assert.rejects(
    hooks['tool.execute.before']({ tool: 'write' }, { args: { filePath: path.join(root, 'b.ts'), content: FAKE_AWS } }),
    /aws-access-key/,
  );
  const out = { system: [] };
  await hooks['experimental.chat.system.transform']({}, out);
  assert.match(out.system.join('\n'), /do-it: .*checks\.json/);
});

test('OpenCode plugin fails open when decide itself throws', async () => {
  const root = repo();
  const boom = () => {
    throw new Error('boom');
  };
  const { default: plugin } = await import('../.opencode/plugins/do-it.mjs');
  const hooks = await plugin({ directory: root }, { decide: boom });
  const errors = [];
  const write = process.stderr.write;
  process.stderr.write = (s) => (errors.push(String(s)), true);
  try {
    await hooks['tool.execute.before']({ tool: 'write' }, { args: { filePath: 'a.js', content: FAKE_AWS } });
    await hooks['tool.execute.after']({ tool: 'write', args: { filePath: 'a.js' } }, { output: '' });
    const out = { system: [] };
    await hooks['experimental.chat.system.transform']({}, out);
    assert.deepEqual(out.system, []);
  } finally {
    process.stderr.write = write;
  }
  assert.match(errors.join(''), /failed open: boom/);
});

test('OpenCode plugin only translates: tool kinds in, throw, append and stderr out', async () => {
  const root = repo();
  const calls = [];
  const answers = { session: { context: 'ctx' }, before: { block: 'no' }, after: { context: 'lint', notice: 'warned' } };
  const decide = (event, input) => (calls.push([event, input.kind, input.cwd]), answers[event]);
  const { default: plugin } = await import('../.opencode/plugins/do-it.mjs');
  const hooks = await plugin({ directory: root }, { decide });
  const errors = [];
  const write = process.stderr.write;
  process.stderr.write = (s) => (errors.push(String(s)), true);
  try {
    const sys = { system: [] };
    await hooks['experimental.chat.system.transform']({}, sys);
    assert.deepEqual(sys.system, ['ctx']);
    await assert.rejects(hooks['tool.execute.before']({ tool: 'apply_patch' }, { args: {} }), /^Error: no$/);
    await assert.rejects(hooks['tool.execute.before']({ tool: 'Bash' }, { args: {} }), /no/);
    await assert.rejects(hooks['tool.execute.before']({ tool: 'read' }, { args: {} }), /no/);
    const out = { output: 'done' };
    await hooks['tool.execute.after']({ tool: 'edit', args: {} }, out);
    assert.equal(out.output, 'done\n\nlint');
  } finally {
    process.stderr.write = write;
  }
  assert.deepEqual(calls, [
    ['session', undefined, root],
    ['before', 'edit', root],
    ['before', 'shell', root],
    ['before', null, root],
    ['after', 'edit', root],
  ]);
  assert.match(errors.join(''), /warned/);
});

test('OpenCode plugin puts lint failures before compliance notes', async () => {
  const root = repo();
  const env = process.env.DO_IT_LINT_CMD;
  process.env.DO_IT_LINT_CMD = 'echo lint says no; exit 1';
  try {
    const { default: plugin } = await import('../.opencode/plugins/do-it.mjs');
    const hooks = await plugin({ directory: root });
    const out = { output: 'done' };
    await hooks['tool.execute.after']({ tool: 'write', args: { filePath: 'a.js', content: ['// TODO: insert', 'API key here'].join(' ') } }, out); // do-it: allow (fixture)
    assert.match(out.output, /^done\n\ndo-it lint failed[\s\S]*\n\ndo-it compliance notes:/);
  } finally {
    if (env === undefined) delete process.env.DO_IT_LINT_CMD;
    else process.env.DO_IT_LINT_CMD = env;
  }
});

test('claude session-start still injects context and names skipped rules', () => {
  const root = repo();
  writeChecks(root, MALFORMED);
  const r = spawnSync('node', [path.join(ROOT, 'hooks', 'claude.mjs'), 'session-start'], {
    input: JSON.stringify({ cwd: root }),
    encoding: 'utf8',
    env: cleanEnv(),
  });
  assert.equal(r.status, 0);
  const text = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(text, /Core posture/);
  assert.match(text, /do-it: .*entry 4 \(b\)/);
});

// The commit scan sees what git commit will record.

const FAKE_SLACK = ['xox', 'b-1234567890-abcdef'].join('');
const ctxFor = (root) => ({ root, cfg: { ...DEFAULTS }, enabled: true, rules: loadChecks(root).rules });
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd });

test('parseGitCommit finds pathspecs and skips option values', () => {
  const paths = (cmd) => parseGitCommit(cmd).paths;
  assert.deepEqual(paths('git commit -m "a b" x.js'), ['x.js']);
  assert.deepEqual(paths('git commit -am msg'), []);
  assert.equal(parseGitCommit('git commit -am msg').all, true);
  assert.deepEqual(paths('git commit -m x -- a.js b.js'), ['a.js', 'b.js']);
  assert.deepEqual(paths('git commit --author "A <a@b>" -m x f.js'), ['f.js']);
  assert.deepEqual(paths("git commit --message='it works' -i 'my file.js'"), ['my file.js']);
  assert.deepEqual(paths('git commit -m x'), []);
  assert.deepEqual(paths('git commit -mfoo -F msg.txt a.js && git push'), ['a.js']);
  assert.deepEqual(paths('git commit --fixup HEAD~1 -- -odd.js'), ['-odd.js']);
  assert.equal(parseGitCommit('git commit --pathspec-from-file=list.txt -m x').all, true);
});

test('git commit <path> scans the unstaged working-tree version of that path', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'a.js'), 'ok\n');
  fs.writeFileSync(path.join(root, 'b.js'), 'ok\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  fs.writeFileSync(path.join(root, 'a.js'), `const t = "${FAKE_SLACK}";\n`);
  const ctx = ctxFor(root);
  const r = beforeShell(ctx, 'git commit -m x a.js');
  assert.equal(r.action, 'block');
  assert.match(r.reason, /slack-token in a\.js/);
  // A clean change to another path is not blocked by a.js.
  fs.writeFileSync(path.join(root, 'b.js'), 'ok2\n');
  assert.equal(beforeShell(ctx, 'git commit -m x b.js').action, 'allow');
  assert.equal(beforeShell(ctx, 'git commit -m x').action, 'allow');
});

test('commit -a before the first commit is scanned', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'a.js'), `const t = "${FAKE_SLACK}";\n`);
  git(root, 'add', 'a.js');
  const r = beforeShell(ctxFor(root), 'git commit -am init');
  assert.equal(r.action, 'block');
  assert.match(r.reason, /slack-token in a\.js/);
});

// A repo's own files cannot set a command or an endpoint until trusted.

function trustSetup(projectEnv, { local = '', user = '' } = {}) {
  const root = repo();
  const env = cleanEnv();
  fs.mkdirSync(path.join(root, '.do-it'));
  fs.writeFileSync(path.join(root, '.do-it', 'config.env'), projectEnv);
  if (local) fs.writeFileSync(path.join(root, '.do-it', 'local.env'), local);
  if (user) {
    fs.mkdirSync(path.join(env.XDG_CONFIG_HOME, 'do-it'), { recursive: true });
    fs.writeFileSync(path.join(env.XDG_CONFIG_HOME, 'do-it', 'config.env'), user);
  }
  return { root, env };
}

test('untrusted repo values for guarded keys are dropped with a warning; trust pins them', () => {
  const { root, env } = trustSetup('DO_IT_LINT_CMD=touch pwned\nJIRA_BASE_URL=https://evil.example\nDO_IT_TRACKER=jira\n', {
    user: 'JIRA_BASE_URL=https://jira.mine.example\n',
  });
  let cfg = loadConfig({ cwd: root, env });
  assert.equal(cfg.values.DO_IT_LINT_CMD, '');
  assert.equal(cfg.values.JIRA_BASE_URL, 'https://jira.mine.example');
  assert.equal(cfg.values.DO_IT_TRACKER, 'jira');
  assert.deepEqual(cfg.untrusted, ['DO_IT_LINT_CMD', 'JIRA_BASE_URL']);
  assert.match(cfg.warnings.join('\n'), /DO_IT_LINT_CMD.*not trusted[\s\S]*tracker\.mjs trust/);

  trust(cfg);
  cfg = loadConfig({ cwd: root, env });
  assert.equal(cfg.values.DO_IT_LINT_CMD, 'touch pwned');
  assert.equal(cfg.values.JIRA_BASE_URL, 'https://evil.example');
  assert.deepEqual(cfg.untrusted, []);

  // A changed value (a pull, a teammate's commit) needs trusting again.
  fs.writeFileSync(path.join(root, '.do-it', 'config.env'), 'DO_IT_LINT_CMD=touch pwned2\n');
  cfg = loadConfig({ cwd: root, env });
  assert.equal(cfg.values.DO_IT_LINT_CMD, '');
  assert.deepEqual(cfg.untrusted, ['DO_IT_LINT_CMD']);
});

test('local.env counts as a repo file; environment values always apply', () => {
  const { root, env } = trustSetup('', { local: 'DO_IT_LINT_CMD=touch x\n' });
  assert.equal(loadConfig({ cwd: root, env }).values.DO_IT_LINT_CMD, '');
  const cfg = loadConfig({ cwd: root, env: { ...env, DO_IT_LINT_CMD: 'eslint {file}' } });
  assert.equal(cfg.values.DO_IT_LINT_CMD, 'eslint {file}');
  assert.deepEqual(cfg.untrusted, []);
});

test('one trust covers every clone or worktree with the same values', () => {
  const a = trustSetup('DO_IT_LINT_CMD=eslint {file}\n');
  trust(loadConfig({ cwd: a.root, env: a.env }));
  const other = repo();
  fs.mkdirSync(path.join(other, '.do-it'));
  fs.writeFileSync(path.join(other, '.do-it', 'config.env'), 'DO_IT_LINT_CMD=eslint {file}\n');
  assert.equal(loadConfig({ cwd: other, env: a.env }).values.DO_IT_LINT_CMD, 'eslint {file}');
});

test('tracker.mjs trust records the values; config shows what is untrusted', async () => {
  const { root, env } = trustSetup('DO_IT_LINT_CMD=eslint {file}\n');
  const shown = await run(['config'], { config: loadConfig({ cwd: root, env }) });
  assert.deepEqual(shown.untrusted, { DO_IT_LINT_CMD: 'eslint {file}' });
  const out = await run(['trust'], { config: loadConfig({ cwd: root, env }) });
  assert.deepEqual(out.trusted, { DO_IT_LINT_CMD: 'eslint {file}' });
  assert.deepEqual((await run(['config'], { config: loadConfig({ cwd: root, env }) })).untrusted, {});
  const none = trustSetup('DO_IT_TRACKER=local\n');
  assert.deepEqual((await run(['trust'], { config: loadConfig({ cwd: none.root, env: none.env }) })).trusted, {});
});

test('an untrusted lint command never runs, and the session says why', () => {
  const { root, env } = trustSetup('DO_IT_LINT_CMD=touch pwned\n');
  const hookRun = (event, input) =>
    spawnSync('node', [path.join(ROOT, 'hooks', 'claude.mjs'), event], { input: JSON.stringify({ cwd: root, ...input }), encoding: 'utf8', env });
  hookRun('post-tool', { tool_name: 'Edit', tool_input: { file_path: path.join(root, 'a.js'), new_string: 'x' } });
  assert.equal(fs.existsSync(path.join(root, 'pwned')), false);
  const text = JSON.parse(hookRun('session-start', {}).stdout).hookSpecificOutput.additionalContext;
  assert.match(text, /do-it: .*DO_IT_LINT_CMD.*not trusted/);
});

test('audit 1: shell punctuation inside a quoted message does not hide the pathspec', () => {
  const paths = (cmd) => parseGitCommit(cmd).paths;
  assert.deepEqual(paths('git commit -m "a; b" a.js'), ['a.js']);
  assert.deepEqual(paths("git commit -m 'x | y & z' a.js && git push"), ['a.js']);
  assert.deepEqual(paths(`git commit -m "$(cat <<'EOF'\nfix; it\nEOF\n)" a.js`), ['a.js']);
  const root = repo();
  fs.writeFileSync(path.join(root, 'a.js'), 'ok\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  fs.writeFileSync(path.join(root, 'a.js'), `const t = "${FAKE_SLACK}";\n`);
  assert.equal(beforeShell(ctxFor(root), 'git commit -m "a; b" a.js').action, 'block');
});

test('audit 2: an empty guarded value in a repo file turns the setting off without trust', () => {
  const { root, env } = trustSetup('', { local: 'DO_IT_LINT_CMD=\n', user: 'DO_IT_LINT_CMD=mine\n' });
  const cfg = loadConfig({ cwd: root, env });
  assert.equal(cfg.values.DO_IT_LINT_CMD, '');
  assert.deepEqual(cfg.untrusted, []);
});

test('substitutions, nested quotes and heredocs in the message keep the pathspec', () => {
  const parse = (cmd) => parseGitCommit(cmd);
  assert.deepEqual(parse('git commit -m "a $(echo "x;y") b" a.js').paths, ['a.js']);
  assert.deepEqual(parse("git commit -m \"$(cat <<'EOF'\nDon't break (it); ok\nEOF\n)\" a.js").paths, ['a.js']);
  assert.deepEqual(parse('git commit -m "`date`; x" a.js').paths, ['a.js']);
  assert.deepEqual(parse('git commit -m "a\\"; b" a.js').paths, ['a.js']);
  // Unbalanced quoting cannot be parsed: scan the whole working tree instead.
  const odd = parse('git commit -m "unclosed a.js');
  assert.equal(odd.all, true);
});

test('redirects anywhere in the command keep the paths and are not scanned as paths', () => {
  const paths = (cmd) => parseGitCommit(cmd).paths;
  assert.deepEqual(paths('git commit -m x a.js > /tmp/out.txt'), ['a.js']);
  assert.deepEqual(paths('git commit -m x 2>&1 a.js'), ['a.js']);
  assert.deepEqual(paths('git commit -m x >>log a.js 2>/dev/null b.js'), ['a.js', 'b.js']);
  assert.deepEqual(paths("git commit -m $'a\\'b;c' a.js"), ['a.js']);
  assert.deepEqual(paths('git commit -m x &>out a.js'), ['a.js']);
  assert.deepEqual(paths("git commit -F - <<'EOF' a.js\nfix; don't\nEOF"), ['a.js']);
});

test('a path scan git cannot run falls back to every tracked change', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'a.js'), 'ok\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  fs.writeFileSync(path.join(root, 'a.js'), `const t = "${FAKE_SLACK}";\n`);
  const ctx = ctxFor(root);
  assert.equal(beforeShell(ctx, 'git commit -m x a.js > /tmp/out.txt').action, 'block');
  assert.equal(beforeShell(ctx, "git commit -m $'a\\'b;c' a.js").action, 'block');
  // A path outside the repo makes git diff fail: scan everything instead.
  assert.equal(beforeShell(ctx, 'git commit -m x a.js /outside/x').action, 'block');
});

test('commits run from a subdirectory scan the right files', () => {
  const root = repo();
  fs.mkdirSync(path.join(root, 'sub'));
  fs.writeFileSync(path.join(root, 'sub', 'b.js'), 'ok\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  fs.writeFileSync(path.join(root, 'sub', 'b.js'), `const t = "${FAKE_SLACK}";\n`);
  const ctx = ctxFor(root);
  assert.equal(beforeShell(ctx, 'git -C sub commit -m x b.js').action, 'block');
  assert.equal(beforeShell(ctx, 'git -C sub commit -am x').action, 'block');
  // The agent's shell sits in sub/: its paths are relative to there.
  const inSub = { ...ctx, cwd: path.join(root, 'sub') };
  assert.equal(beforeShell(inSub, 'git commit -m x b.js').action, 'block');
  git(root, 'add', 'sub/b.js');
  assert.equal(beforeShell(ctx, 'git -C sub commit -m x').action, 'block');
});

test('a commit the scan cannot resolve for sure scans every tracked change from the root', () => {
  const root = repo();
  fs.mkdirSync(path.join(root, 'sub'));
  fs.writeFileSync(path.join(root, 'sub', 'a.js'), 'ok\n');
  fs.writeFileSync(path.join(root, 'b.js'), 'ok\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  fs.writeFileSync(path.join(root, 'sub', 'a.js'), `const t = "${FAKE_SLACK}";\n`);
  const ctx = ctxFor(root);
  assert.equal(beforeShell(ctx, 'git commit -m x $PWD/sub/a.js').action, 'block');
  assert.equal(beforeShell(ctx, 'git commit -m x "$(echo sub/a.js)"').action, 'block');
  assert.equal(beforeShell(ctx, 'git commit -m x ~/sub/a.js').action, 'block');
  assert.equal(beforeShell(ctx, 'git -C "$PWD/sub" commit -m x a.js').action, 'block');
  // A path that matches nothing (b.js is unchanged) cannot be trusted either.
  assert.equal(beforeShell(ctx, 'git commit -m x b.js').action, 'block');
  // A plain commit of clean staged work is still allowed.
  git(root, 'add', 'b.js');
  assert.equal(beforeShell(ctx, 'git commit -m x').action, 'allow');
  // A staged secret behind an unexpanded -C is scanned too.
  fs.writeFileSync(path.join(root, 'sub', 'a.js'), `const t = "${FAKE_SLACK}";\n`);
  git(root, 'add', 'sub/a.js');
  assert.equal(beforeShell(ctx, 'git -C $(pwd) commit -m x').action, 'block');
});

test('a cd before the commit moves where its paths and repo are read', () => {
  const root = repo();
  fs.mkdirSync(path.join(root, 'sub'));
  fs.writeFileSync(path.join(root, 'x.js'), 'ok\n');
  fs.writeFileSync(path.join(root, 'sub', 'x.js'), 'ok\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  fs.writeFileSync(path.join(root, 'x.js'), 'ok2\n');
  fs.writeFileSync(path.join(root, 'sub', 'x.js'), `const t = "${FAKE_SLACK}";\n`);
  const ctx = ctxFor(root);
  assert.equal(beforeShell(ctx, 'cd sub && git commit -m x x.js').action, 'block');
  assert.equal(beforeShell(ctx, 'cd sub; git commit -m x x.js').action, 'block');
  assert.equal(beforeShell(ctx, 'git commit -m x x.js').action, 'allow');

  const other = repo();
  fs.writeFileSync(path.join(other, 'o.js'), 'ok\n');
  git(other, 'add', '.');
  git(other, 'commit', '-qm', 'init');
  fs.writeFileSync(path.join(other, 'o.js'), `const t = "${FAKE_SLACK}";\n`);
  assert.equal(beforeShell(ctx, `cd ${other} && git commit -am x`).action, 'block');
  // A cd the hook cannot follow scans every tracked change from the root.
  assert.equal(beforeShell(ctx, 'cd "$DIR" && git commit -m x x.js').action, 'block');
});

test('a cd that may not persist scans both directories', () => {
  const root = repo();
  fs.mkdirSync(path.join(root, 'sub'));
  fs.writeFileSync(path.join(root, 'x.js'), 'ok\n');
  fs.writeFileSync(path.join(root, 'sub', 'x.js'), 'ok\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  fs.writeFileSync(path.join(root, 'x.js'), `const t = "${FAKE_SLACK}";\n`);
  fs.writeFileSync(path.join(root, 'sub', 'x.js'), 'ok2\n');
  const ctx = ctxFor(root);
  for (const cmd of [
    '(cd sub && make); git commit -m x x.js',
    'echo "x; cd sub; y" && git commit -m x x.js',
    'echo hi | cd sub; git commit -m x x.js',
  ]) {
    assert.equal(beforeShell(ctx, cmd).action, 'block', cmd);
  }
});

test('every step of a cd chain is scanned, and cd after { then do is seen', () => {
  const start = repo();
  const b = repo();
  const c = repo();
  for (const dir of [b, c]) {
    fs.writeFileSync(path.join(dir, 'f.js'), 'ok\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'init');
  }
  fs.writeFileSync(path.join(b, 'f.js'), `const t = "${FAKE_SLACK}";\n`);
  git(b, 'add', 'f.js');
  const ctx = ctxFor(start);
  for (const cmd of [
    `cd ${b} && (cd ${c}); git commit -m x`,
    `cd ${b}; (cd ${c}) && git commit -m x`,
    `{ cd ${b}; }; git commit -m x`,
    `if true; then cd ${b}; fi; git commit -m x`,
    `builtin cd ${b} && git commit -m x`,
  ]) {
    assert.equal(beforeShell(ctx, cmd).action, 'block', cmd);
  }
});

test('commit guard reports the real line and reads what git would record', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'a.js'), '1\n2\n3\n4\n');
  fs.writeFileSync(path.join(root, 'old.js'), `const t = "${FAKE_SLACK}"; // do-it: allow\n`);
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  const ctx = ctxFor(root);

  fs.appendFileSync(path.join(root, 'a.js'), `const t = "${FAKE_SLACK}";\n`);
  git(root, 'add', 'a.js');
  assert.match(beforeShell(ctx, 'git commit -m x').reason, /slack-token in a\.js:5:/);
  git(root, 'reset', '-q');

  // An added line that starts with ++ is not mistaken for a +++ header.
  fs.writeFileSync(path.join(root, 'p.js'), `++ "${FAKE_SLACK}"\n`);
  git(root, 'add', 'p.js');
  assert.equal(beforeShell(ctx, 'git commit -m x').action, 'block');
  git(root, 'reset', '-q');
  fs.rmSync(path.join(root, 'p.js'));

  // A textconv driver from the repo's config cannot replace the scanned text.
  fs.writeFileSync(path.join(root, '.gitattributes'), '*.js diff=hide\n');
  git(root, 'config', 'diff.hide.textconv', 'sh -c "echo hidden"');
  fs.appendFileSync(path.join(root, 'a.js'), `const u = "${FAKE_SLACK}";\n`);
  git(root, 'add', 'a.js');
  assert.equal(beforeShell(ctx, 'git commit -m x').action, 'block');
  git(root, 'reset', '-q', '--hard');
  fs.rmSync(path.join(root, '.gitattributes'));
});

test('commit guard scans a renamed file whole', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'old.js'), `const t = "${FAKE_SLACK}";\n`);
  git(root, 'add', '.');
  git(root, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'init');
  git(root, 'mv', 'old.js', 'new.js');
  const r = beforeShell(ctxFor(root), 'git commit -m mv');
  assert.equal(r.action, 'block');
  assert.match(r.reason, /slack-token in new\.js:1:/);
});

test('commit guard still blocks beside a type change or an unmerged path', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'f'), 'f\n');
  fs.symlinkSync('f', path.join(root, 'l'));
  fs.writeFileSync(path.join(root, 'm.txt'), 'base\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  git(root, 'checkout', '-q', '-b', 'other');
  fs.writeFileSync(path.join(root, 'm.txt'), 'other\n');
  git(root, 'commit', '-qam', 'other');
  git(root, 'checkout', '-q', '-');
  fs.writeFileSync(path.join(root, 'm.txt'), 'mine\n');
  git(root, 'commit', '-qam', 'mine');
  fs.rmSync(path.join(root, 'l'));
  fs.writeFileSync(path.join(root, 'l'), 'now a file\n');
  fs.writeFileSync(path.join(root, 'z.js'), `const t = "${FAKE_SLACK}";\n`);
  git(root, 'add', 'l', 'z.js');
  assert.match(beforeShell(ctxFor(root), 'git commit -m x').reason, /slack-token in z\.js:1:/);
  spawnSync('git', ['merge', '-q', 'other'], { cwd: root });
  assert.match(beforeShell(ctxFor(root), 'git commit -am x').reason, /slack-token in z\.js:1:/);
});

test('commit guard still blocks beside a staged file too large to read', () => {
  const root = repo();
  git(root, 'commit', '-q', '--allow-empty', '-m', 'init');
  fs.writeFileSync(path.join(root, 'huge.bin'), crypto.randomBytes(40 * 1024 * 1024));
  fs.writeFileSync(path.join(root, 'z.js'), `const t = "${FAKE_SLACK}";\n`);
  git(root, 'add', '.');
  const start = Date.now();
  assert.match(beforeShell(ctxFor(root), 'git commit -am x').reason, /slack-token in z\.js:1:/);
  assert.ok(Date.now() - start < 5000, `took ${Date.now() - start} ms`);
});

test('commit guard stays fast beside modified binaries in a cd chain', () => {
  const root = repo();
  fs.mkdirSync(path.join(root, 'sub'));
  const binary = () => '\0' + Array.from({ length: 250000 }, () => (Math.random() < 0.5 ? 'a' : 'b')).join('\n');
  for (const n of [1, 2, 3, 4]) fs.writeFileSync(path.join(root, `b${n}.bin`), binary());
  fs.writeFileSync(path.join(root, 'sub/.keep'), '');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  for (const n of [1, 2, 3, 4]) fs.writeFileSync(path.join(root, `b${n}.bin`), binary());
  fs.writeFileSync(path.join(root, 'z.js'), `const t = "${FAKE_SLACK}";\n`);
  git(root, 'add', '.');
  const start = Date.now();
  assert.match(beforeShell(ctxFor(root), 'cd sub && git commit -am x').reason, /slack-token in z\.js:1:/);
  assert.ok(Date.now() - start < 3000, `took ${Date.now() - start} ms`);
});

test('commit guard still blocks beside a tracked file it cannot read', () => {
  const root = repo();
  fs.mkdirSync(path.join(root, 'locked'));
  fs.writeFileSync(path.join(root, 'locked/z.txt'), 'z\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  fs.writeFileSync(path.join(root, 'locked/z.txt'), 'z\nmore\n');
  fs.chmodSync(path.join(root, 'locked/z.txt'), 0o000);
  fs.writeFileSync(path.join(root, 'a.js'), `const t = "${FAKE_SLACK}";\n`);
  git(root, 'add', 'a.js');
  try {
    for (const cmd of ['git commit -a -m x', 'cd "$(git rev-parse --show-toplevel)" && git commit -m x']) {
      assert.match(beforeShell(ctxFor(root), cmd).reason ?? '', /slack-token in a\.js:1:/, cmd);
    }
  } finally {
    fs.chmodSync(path.join(root, 'locked/z.txt'), 0o644);
  }
});
