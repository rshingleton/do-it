import { cleanEnv, tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { BUILTIN, scan, loadChecks } from '../hooks/lib/checks.mjs';
import { parseGitCommit, parseGitCommits, beforeShell } from '../hooks/lib/guard.mjs';
import { DEFAULTS, loadConfig, trust } from '../skills/track-it/scripts/config.mjs';
import { run } from '../skills/track-it/scripts/tracker.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// A path as a bash command line spells it: forward slashes, as Git Bash takes them.
const sh = (p) => p.replaceAll('\\', '/');

// Fake secrets are assembled at runtime so this file never holds one literally.
const FAKE_AWS = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');

function repo() {
  const dir = tmpDir('do-it-trust-');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
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
});

test('OpenCode plugin allows an edit when the rules file is malformed, still blocks secrets', async () => {
  const root = repo();
  writeChecks(root, MALFORMED);
  const { DoItPlugin: plugin } = await import('../.opencode/do-it-plugin/do-it.mjs');
  const hooks = await plugin({ directory: root });
  await hooks['tool.execute.before']({ tool: 'write' }, { args: { filePath: path.join(root, 'b.ts'), content: 'bar' } });
  await assert.rejects(
    hooks['tool.execute.before']({ tool: 'write' }, { args: { filePath: path.join(root, 'b.ts'), content: FAKE_AWS } }),
    /aws-access-key/,
  );
  // A read is not guarded.
  await hooks['tool.execute.before']({ tool: 'read' }, { args: { filePath: path.join(root, '.env') } });
  const out = { system: [] };
  await hooks['experimental.chat.system.transform']({}, out);
  assert.match(out.system.join('\n'), /do-it: .*checks\.json/);
});

test('OpenCode plugin only translates: tool kinds in, throw, append and stderr out', async () => {
  const root = repo();
  const answers = { session: { context: 'ctx' }, before: { block: 'no' }, after: { context: 'lint', notice: 'warned' } };
  const decide = (event) => answers[event];
  const { DoItPlugin: plugin } = await import('../.opencode/do-it-plugin/do-it.mjs');
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
    await assert.rejects(hooks['tool.execute.before']({ tool: 'shell' }, { args: {} }), /no/);
    await assert.rejects(hooks['tool.execute.before']({ tool: 'read' }, { args: {} }), /no/);
    const out = { output: 'done' };
    await hooks['tool.execute.after']({ tool: 'edit', args: {} }, out);
    assert.equal(out.output, 'done\n\nlint');
  } finally {
    process.stderr.write = write;
  }
  assert.match(errors.join(''), /warned/);
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
  assert.equal(beforeShell(ctx, 'git commit -m "t: x" b.js').action, 'allow');
  assert.equal(beforeShell(ctx, 'git commit -m "t: x"').action, 'allow');
});

test('a file an earlier git add in the same command stages is scanned', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'a.js'), 'ok\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  const ctx = ctxFor(root);
  // A tracked file edited and added in the same command.
  fs.writeFileSync(path.join(root, 'a.js'), `const t = "${FAKE_SLACK}";\n`);
  assert.equal(beforeShell(ctx, 'git add a.js && git commit -m x').action, 'block');
  assert.equal(beforeShell(ctx, 'git commit -m a && git stage a.js && git commit -m b').action, 'block');
  assert.equal(beforeShell(ctx, 'git add -u && git commit -m x').action, 'block');
  // A new untracked file named by the add.
  git(root, 'checkout', '-q', 'a.js');
  fs.writeFileSync(path.join(root, 'new.js'), `const t = "${FAKE_SLACK}";\n`);
  const r = beforeShell(ctx, 'git add new.js && git commit -m x');
  assert.equal(r.action, 'block');
  assert.match(r.reason, /slack-token in new\.js/);
  assert.equal(beforeShell(ctx, 'git add -A && git commit -m x').action, 'block');
  assert.equal(beforeShell(ctx, 'git add . && git commit -m x').action, 'block');
  // Another path, or no add at all, is not blocked by new.js.
  fs.writeFileSync(path.join(root, 'ok.js'), 'fine\n');
  assert.equal(beforeShell(ctx, 'git add ok.js && git commit -m "t: x"').action, 'allow');
  assert.equal(beforeShell(ctx, 'git commit -m "t: x"').action, 'allow');
  // An add in a subshell keeps its last path whole.
  fs.mkdirSync(path.join(root, 'sub'));
  fs.writeFileSync(path.join(root, 'sub/n.js'), `const t = "${FAKE_SLACK}";\n`);
  assert.equal(beforeShell(ctx, '(cd sub && git add n.js); git commit -m x').action, 'block');
  fs.rmSync(path.join(root, 'sub'), { recursive: true });
  // git add -f stages an ignored file; a plain add of a directory does not.
  fs.writeFileSync(path.join(root, '.gitignore'), 'ignored/\n');
  fs.mkdirSync(path.join(root, 'ignored'));
  fs.writeFileSync(path.join(root, 'ignored/k.js'), `const t = "${FAKE_SLACK}";\n`);
  fs.rmSync(path.join(root, 'new.js'));
  assert.equal(beforeShell(ctx, 'git add -f ignored/k.js && git commit -m x').action, 'block');
  assert.equal(beforeShell(ctx, 'git add --force ignored && git commit -m x').action, 'block');
  assert.equal(beforeShell(ctx, 'git add ignored/k.js && git commit -m "t: x"').action, 'allow');
  // git rm adds no lines and does not widen the scan.
  assert.equal(beforeShell(ctx, 'git rm -q a.js && git commit -m "t: x"').action, 'allow');
  // A subdirectory, a glob or a directory named by the add is scanned too.
  fs.mkdirSync(path.join(root, 'sub/deep'), { recursive: true });
  fs.writeFileSync(path.join(root, 'sub/deep/n.js'), `const t = "${FAKE_SLACK}";\n`);
  fs.writeFileSync(path.join(root, 'sub/ok.js'), 'fine\n');
  assert.equal(beforeShell(ctx, 'git add sub/deep/n.js && git commit -m "t: x"').action, 'block');
  assert.equal(beforeShell(ctx, 'git add sub/deep/*.js && git commit -m "t: x"').action, 'block');
  assert.equal(beforeShell(ctx, 'git add sub && git commit -m "t: x"').action, 'block');
  assert.equal(beforeShell(ctx, 'git add sub/ok.js && git commit -m "t: x"').action, 'allow');
});

test('a commit with no earlier index-changing command makes the same git calls as before', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'a.js'), 'ok\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  fs.writeFileSync(path.join(root, 'a.js'), 'ok2\n');
  const bin = tmpDir('do-it-shim-');
  const log = path.join(bin, 'log');
  // Count git processes: a shim on PATH where it can run, git's own trace on Windows,
  // where PATH cannot hold a script named git.
  if (process.platform !== 'win32') {
    const real = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\necho x >> '${log}'\nexec '${real}' "$@"\n`, { mode: 0o755 });
  }
  const calls = (cmd) => {
    fs.rmSync(log, { force: true });
    const old = process.env.PATH;
    if (process.platform === 'win32') process.env.GIT_TRACE2_EVENT = log;
    else process.env.PATH = `${bin}${path.delimiter}${old}`;
    try {
      beforeShell(ctxFor(root), cmd);
    } finally {
      process.env.PATH = old;
      delete process.env.GIT_TRACE2_EVENT;
    }
    const lines = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
    return process.platform === 'win32' ? lines.filter((l) => l.includes('"event":"version"')).length : lines.length;
  };
  // Counts measured on the guard before index-changing commands were read,
  // plus the one lookup for textconv drivers when a listing has files.
  assert.equal(calls('git commit -m x'), 2);
  assert.equal(calls('git commit -am x'), 7);
  // A named path adds one ls-files call, so a new untracked file named on the line is scanned (R1).
  assert.equal(calls('git commit -m x a.js'), 8);
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
  writeChecks(root, MALFORMED);
  const hookRun = (event, input) =>
    spawnSync('node', [path.join(ROOT, 'hooks', 'claude.mjs'), event], { input: JSON.stringify({ cwd: root, ...input }), encoding: 'utf8', env });
  hookRun('post-tool', { tool_name: 'Edit', tool_input: { file_path: path.join(root, 'a.js'), new_string: 'x' } });
  assert.equal(fs.existsSync(path.join(root, 'pwned')), false);
  const text = JSON.parse(hookRun('session-start', {}).stdout).hookSpecificOutput.additionalContext;
  assert.match(text, /do-it: .*DO_IT_LINT_CMD.*not trusted/);
  assert.match(text, /checks\.json/);
  assert.match(text, /Core posture/);
});

test('substitutions, nested quotes and heredocs in the message keep the pathspec', () => {
  const parse = (cmd) => parseGitCommit(cmd);
  assert.deepEqual(parse('git commit -m "a; b" a.js').paths, ['a.js']);
  assert.deepEqual(parse("git commit -m 'x | y & z' a.js && git push").paths, ['a.js']);
  assert.deepEqual(parse('git commit -m "a $(echo "x;y") b" a.js').paths, ['a.js']);
  assert.deepEqual(parse("git commit -m \"$(cat <<'EOF'\nDon't break (it); ok\nEOF\n)\" a.js").paths, ['a.js']);
  assert.deepEqual(parse('git commit -m "`date`; x" a.js').paths, ['a.js']);
  assert.deepEqual(parse('git commit -m "a\\"; b" a.js').paths, ['a.js']);
  // Redirect targets and a heredoc body are not paths; the paths around them are.
  assert.deepEqual(parse('git commit -m x >>log a.js 2>/dev/null b.js').paths, ['a.js', 'b.js']);
  assert.deepEqual(parse("git commit -F - <<'EOF' a.js\nfix; don't\nEOF").paths, ['a.js']);
  assert.deepEqual(parse("git commit -m $'a\\'b;c' a.js").paths, ['a.js']);
  // Unbalanced quoting cannot be parsed: scan the whole working tree instead.
  const odd = parse('git commit -m "unclosed a.js');
  assert.equal(odd.all, true);
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
  assert.equal(beforeShell(ctx, 'git -C sub commit -m x b.js').action, 'block', 'a named path under git -C');
  assert.equal(beforeShell(ctx, 'git -C sub commit -am x').action, 'block', '-am under git -C scans the whole tree');
  // The agent's shell sits in sub/: its paths are relative to there.
  const inSub = { ...ctx, cwd: path.join(root, 'sub') };
  assert.equal(beforeShell(inSub, 'git commit -m x b.js').action, 'block', 'the shell cwd moves its paths');
  git(root, 'add', 'sub/b.js');
  assert.equal(beforeShell(ctx, 'git -C sub commit -m x').action, 'block', 'a staged change under git -C scans the whole tree');
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
  assert.equal(beforeShell(ctx, 'git commit -m "t: x"').action, 'allow');
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
  assert.equal(beforeShell(ctx, 'git commit -m "t: x" x.js').action, 'allow');

  // A cd that may not persist cannot hide the root copy either.
  fs.writeFileSync(path.join(root, 'x.js'), `const t = "${FAKE_SLACK}";\n`);
  for (const cmd of [
    '(cd sub && make); git commit -m x x.js',
    'echo "x; cd sub; y" && git commit -m x x.js',
    'echo hi | cd sub; git commit -m x x.js',
  ]) {
    assert.equal(beforeShell(ctx, cmd).action, 'block', cmd);
  }
  fs.writeFileSync(path.join(root, 'x.js'), 'ok2\n');

  const other = repo();
  fs.writeFileSync(path.join(other, 'o.js'), 'ok\n');
  git(other, 'add', '.');
  git(other, 'commit', '-qm', 'init');
  fs.writeFileSync(path.join(other, 'o.js'), `const t = "${FAKE_SLACK}";\n`);
  assert.equal(beforeShell(ctx, `cd ${sh(other)} && git commit -am x`).action, 'block');
  // A cd the hook cannot follow scans every tracked change from the root.
  assert.equal(beforeShell(ctx, 'cd "$DIR" && git commit -m x x.js').action, 'block');

  // Every step of a chain is scanned, and a cd after { then do is seen.
  const b = repo();
  const c = repo();
  for (const dir of [b, c]) {
    fs.writeFileSync(path.join(dir, 'f.js'), 'ok\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'init');
  }
  fs.writeFileSync(path.join(b, 'f.js'), `const t = "${FAKE_SLACK}";\n`);
  git(b, 'add', 'f.js');
  for (const cmd of [
    `cd ${sh(b)} && (cd ${sh(c)}); git commit -m x`,
    `cd ${sh(b)}; (cd ${sh(c)}) && git commit -m x`,
    `{ cd ${sh(b)}; }; git commit -m x`,
    `if true; then cd ${sh(b)}; fi; git commit -m x`,
    `builtin cd ${sh(b)} && git commit -m x`,
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

  // A textconv driver from the repo's config cannot replace the scanned text.
  fs.writeFileSync(path.join(root, '.gitattributes'), '*.js diff=hide\n');
  git(root, 'config', 'diff.hide.textconv', 'sh -c "echo hidden"');
  fs.appendFileSync(path.join(root, 'a.js'), `const u = "${FAKE_SLACK}";\n`);
  git(root, 'add', 'a.js');
  assert.equal(beforeShell(ctx, 'git commit -m x').action, 'block');
  git(root, 'reset', '-q', '--hard');
  fs.rmSync(path.join(root, '.gitattributes'));
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
  // Binaries are read as text under a shared budget, well inside the 15 s hook timeout.
  assert.ok(Date.now() - start < 10000, `took ${Date.now() - start} ms`);

  // A staged file too large to read does not stop the rest.
  const huge = repo();
  git(huge, 'commit', '-q', '--allow-empty', '-m', 'init');
  fs.writeFileSync(path.join(huge, 'huge.bin'), crypto.randomBytes(40 * 1024 * 1024));
  fs.writeFileSync(path.join(huge, 'z.js'), `const t = "${FAKE_SLACK}";\n`);
  git(huge, 'add', '.');
  const hugeStart = Date.now();
  assert.match(beforeShell(ctxFor(huge), 'git commit -am x').reason, /slack-token in z\.js:1:/);
  assert.ok(Date.now() - hugeStart < 5000, `took ${Date.now() - hugeStart} ms`);

  // Nor does a tracked file it cannot read.
  const locked = repo();
  fs.mkdirSync(path.join(locked, 'locked'));
  fs.writeFileSync(path.join(locked, 'locked/z.txt'), 'z\n');
  git(locked, 'add', '.');
  git(locked, 'commit', '-qm', 'init');
  fs.writeFileSync(path.join(locked, 'locked/z.txt'), 'z\nmore\n');
  fs.chmodSync(path.join(locked, 'locked/z.txt'), 0o000);
  fs.writeFileSync(path.join(locked, 'a.js'), `const t = "${FAKE_SLACK}";\n`);
  git(locked, 'add', 'a.js');
  try {
    for (const cmd of ['git commit -a -m x', 'cd "$(git rev-parse --show-toplevel)" && git commit -m x']) {
      assert.match(beforeShell(ctxFor(locked), cmd).reason ?? '', /slack-token in a\.js:1:/, cmd);
    }
  } finally {
    fs.chmodSync(path.join(locked, 'locked/z.txt'), 0o644);
  }
});

test('commit guard blocks a staged secret in files git treats as binary', () => {
  const line = `const t = "${FAKE_SLACK}";\n`;
  const cases = {
    'a -diff attribute': (root) => {
      fs.writeFileSync(path.join(root, '.gitattributes'), '*.js -diff\n');
      fs.writeFileSync(path.join(root, 's.js'), line);
    },
    'a binary attribute': (root) => {
      fs.writeFileSync(path.join(root, '.gitattributes'), '*.js binary\n');
      fs.writeFileSync(path.join(root, 's.js'), line);
    },
    'a NUL byte': (root) => fs.writeFileSync(path.join(root, 's.js'), `\0\n${line}`),
    'core.bigFileThreshold': (root) => {
      git(root, 'config', 'core.bigFileThreshold', '10');
      fs.writeFileSync(path.join(root, 's.js'), line);
    },
  };
  for (const [name, make] of Object.entries(cases)) {
    const root = repo();
    make(root);
    git(root, 'add', '.');
    const r = beforeShell(ctxFor(root), 'git commit -m x');
    assert.equal(r.action, 'block', name);
    assert.match(r.reason, /slack-token in s\.js/, name);
  }
});

test('commit guard blocks a secret a textconv driver reveals, and ignores a noisy driver', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, '.gitattributes'), '*.b64 diff=b64\n');
  git(root, 'config', 'diff.b64.textconv', 'base64 -d <');
  fs.writeFileSync(path.join(root, 's.b64'), Buffer.from(`const t = "${FAKE_SLACK}";\n`).toString('base64') + '\n');
  git(root, 'add', '.');
  assert.match(beforeShell(ctxFor(root), 'git commit -m x').reason ?? '', /slack-token in s\.b64/);
  // A driver writing 2 MB to stderr first does not change what is read.
  git(root, 'config', 'diff.b64.textconv', 'sh -c \'head -c 2000000 /dev/zero >&2; base64 -d < "$0"\'');
  assert.match(beforeShell(ctxFor(root), 'git commit -m x').reason ?? '', /slack-token in s\.b64/);

  // An untracked file an earlier git add stages is read through its driver too.
  const staged = repo();
  git(staged, 'commit', '-q', '--allow-empty', '-m', 'base');
  fs.writeFileSync(path.join(staged, '.gitattributes'), '*.b64 diff=b64\n');
  git(staged, 'config', 'diff.b64.textconv', 'base64 -d <');
  fs.writeFileSync(path.join(staged, 's.b64'), Buffer.from(`const t = "${FAKE_SLACK}";\n`).toString('base64'));
  assert.equal(beforeShell(ctxFor(staged), 'git add s.b64 && git commit -m x').action, 'block');
});

test('a secret in the second commit of a chain blocks the command', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'a.js'), 'ok\n');
  fs.writeFileSync(path.join(root, 'b.js'), 'ok\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  fs.writeFileSync(path.join(root, 'a.js'), 'ok2\n');
  fs.writeFileSync(path.join(root, 'b.js'), `const t = "${FAKE_SLACK}";\n`);
  const ctx = ctxFor(root);
  assert.deepEqual(parseGitCommits('git commit -m a a.js && git commit -m b b.js').map((c) => c.paths), [['a.js'], ['b.js']]);
  assert.equal(parseGitCommits('git status; git commit -am x || git commit y.js').length, 2);
  for (const sep of [' && ', '; ', ' || ', '\n']) {
    const r = beforeShell(ctx, `git commit -m a a.js${sep}git commit -m b b.js`);
    assert.equal(r.action, 'block', JSON.stringify(sep));
    assert.match(r.reason, /slack-token in b\.js/);
  }
  assert.equal(beforeShell(ctx, 'git commit -m "t: a" a.js && git commit -m "t: c" a.js').action, 'allow');
});

test('a prefixed or nested commit is scanned', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'a.js'), 'ok\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  fs.writeFileSync(path.join(root, 'a.js'), `const t = "${FAKE_SLACK}";\n`);
  const ctx = ctxFor(root);
  for (const cmd of ['FOO=1 git commit -m x a.js', 'sudo -u me git commit -m x a.js', 'echo x\ngit commit -m x a.js', "git -c k='a b' commit -m x a.js"]) {
    assert.equal(beforeShell(ctx, cmd).action, 'block', cmd);
  }
});

test('commit scan allows bad input without throwing', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'a.js'), 'ok\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'init');
  const ctx = ctxFor(root);
  assert.equal(beforeShell(ctx, "git commit -m 'a a.js && git commit -m \"b b.js").action, 'allow');
  assert.equal(beforeShell(ctx, '\0\0 git commit \0 && git commit -m $(').action, 'allow');
  assert.equal(beforeShell(ctx, null).action, 'allow');
  assert.equal(beforeShell(ctx, '\0'.repeat(1e5)).action, 'allow');
  const big = `${'cd sub && '.repeat(20)}${'git commit -m "t: x"; '.repeat(50)}echo "${'x'.repeat(95000)}`;
  const start = Date.now();
  assert.equal(beforeShell(ctx, big).action, 'allow');
  assert.ok(Date.now() - start < 3000, `took ${Date.now() - start} ms`);
  const t2 = Date.now();
  assert.equal(beforeShell(ctx, ';$('.repeat(33000)).action, 'allow');
  assert.ok(Date.now() - t2 < 3000, `took ${Date.now() - t2} ms`);
});

// The v2 entry: a fake context records the hooks `setup` registers.
function fakeCtx() {
  const hooks = {};
  const domain = () => ({ hook: (name, fn) => (hooks[name] = fn) });
  return { hooks, ctx: { session: domain(), tool: domain(), location: { directory: '/x' } } };
}

test('OpenCode plugin setup without hook domains registers nothing and leaves v1 live', async () => {
  const { createPlugin } = await import('../.opencode/do-it-plugin/do-it.mjs');
  const p = createPlugin({ decide: () => ({}) });
  await p.setup({ options: {}, agent: {} });
  assert.ok(Object.keys(await p.server({ directory: '/x' })).length > 0);
});

test('OpenCode plugin setup hooks translate over decide, and v1 then stays empty', async () => {
  const { createPlugin } = await import('../.opencode/do-it-plugin/do-it.mjs');
  const answers = { session: { context: 'ctx' }, before: { block: 'no' }, after: { context: 'lint' } };
  const p = createPlugin({ decide: (event) => answers[event] });
  const { hooks, ctx } = fakeCtx();
  await p.setup(ctx);
  assert.deepEqual(Object.keys(hooks).sort(), ['context', 'execute.after', 'execute.before']);

  const ev = { system: [] };
  await hooks.context(ev);
  assert.deepEqual(ev.system, [{ type: 'text', text: 'ctx' }]);
  await assert.rejects(hooks['execute.before']({ tool: 'bash', input: { command: 'x' } }), /no/);
  const done = { status: 'completed', tool: 'edit', input: {}, result: { content: 'ok' } };
  await hooks['execute.after'](done);
  assert.equal(done.result.content, 'ok\n\nlint');
  assert.deepEqual(await p.server({ directory: '/x' }), {});
});

test('OpenCode plugin setup stands down when the v1 hooks are already live', async () => {
  const { createPlugin } = await import('../.opencode/do-it-plugin/do-it.mjs');
  const p = createPlugin({ decide: () => ({}) });
  await p.server({ directory: '/x' });
  const { hooks, ctx } = fakeCtx();
  await p.setup(ctx);
  assert.deepEqual(hooks, {});
});

test('OpenCode plugin setup hooks fail open and skip an unexpected shape', async () => {
  const { createPlugin } = await import('../.opencode/do-it-plugin/do-it.mjs');
  const boom = () => {
    throw new Error('boom');
  };
  const p = createPlugin({ decide: boom });
  const { hooks, ctx } = fakeCtx();
  await p.setup(ctx);
  const errors = [];
  const write = process.stderr.write;
  process.stderr.write = (s) => (errors.push(String(s)), true);
  try {
    await hooks['execute.before']({ tool: 'bash', input: {} });
    await hooks.context({ system: 'not an array' });
  } finally {
    process.stderr.write = write;
  }
  assert.match(errors.join(''), /failed open: boom/);
  const q = createPlugin({ decide: () => ({ context: 'c' }) });
  const h = fakeCtx();
  await q.setup(h.ctx);
  const ev = { system: 'str' };
  await h.hooks.context(ev);
  assert.equal(ev.system, 'str');
  const odd = { status: 'completed', tool: 'edit', input: {}, result: { content: 42 } };
  await h.hooks['execute.after'](odd);
  assert.equal(odd.result.content, 42);
});

test('OpenCode plugin setup backgrounds subagent calls launched together, not a lone one', async () => {
  const { createPlugin } = await import('../.opencode/do-it-plugin/do-it.mjs');
  const p = createPlugin({ decide: () => ({}) });
  const { hooks, ctx } = fakeCtx();
  await p.setup(ctx);
  const call = (messageID, background = false) => ({ tool: 'subagent', messageID, input: { agent: 'it-scout', background } });
  const [a, b, lone, other] = [call('m1'), call('m1'), call('m2'), { tool: 'shell', messageID: 'm1', input: {} }];
  await Promise.all([a, b, other].map((e) => hooks['execute.before'](e)));
  assert.equal(a.input.background, true);
  assert.equal(b.input.background, true);
  assert.equal(other.input.background, undefined);
  await hooks['execute.before'](lone);
  assert.equal(lone.input.background, false);
});
