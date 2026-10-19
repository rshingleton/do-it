import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { BUILTIN, scan, loadChecks, addedText } from '../hooks/lib/checks.mjs';
import { beforeEdit, afterEdit, beforeShell } from '../hooks/lib/guard.mjs';
import { DEFAULTS } from '../skills/track-it/scripts/config.mjs';
import { sessionContext } from '../hooks/lib/context.mjs';
import { mergeClaude, mergeOpencode } from '../scripts/install-hooks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-hooks-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

// Fake secrets are assembled at runtime so this file never holds one literally:
// the do-it commit hook and GitHub push protection both scan it.
const FAKE_AWS = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');
const FAKE_SLACK = ['xox', 'b-1234567890-abcdef'].join('');
const PLACEHOLDER = ['// TODO: insert', 'API key here'].join(' '); // do-it: allow (fixture)

const ctxFor = (root, cfg = {}) => ({ root, cfg: { ...DEFAULTS, ...cfg }, enabled: true, rules: loadChecks(root).rules });

test('secrets are HIGH; placeholders MEDIUM; do-it: allow skips a line', () => {
  const ids = (text, file = 'a.js') => scan(text, BUILTIN, file).map((f) => `${f.id}:${f.severity}`);
  assert.deepEqual(ids(`const k = "${FAKE_AWS}"`), ['aws-access-key:HIGH']);
  assert.deepEqual(ids(PLACEHOLDER), ['credential-placeholder:MEDIUM']);
  assert.deepEqual(ids('password = "correcthorsebattery" // do-it: allow test fixture'), []);
  assert.deepEqual(ids('password = process.env.PW'), []);
  assert.deepEqual(ids('', 'config/.env'), ['env-file:HIGH']);
  assert.deepEqual(ids('', '.env.example'), []);
});

test('checks.json adds rules, scopes by extension, disables built-ins', () => {
  const root = repo();
  fs.mkdirSync(path.join(root, '.compliance-rules'));
  fs.writeFileSync(
    path.join(root, '.compliance-rules', 'checks.json'),
    JSON.stringify([
      { id: 'no-console', severity: 'MEDIUM', pattern: 'console\\.log\\(', files: ['.ts'] },
      { id: 'env-file', disabled: true },
    ]),
  );
  const { rules, error } = loadChecks(root);
  assert.equal(error, null);
  assert.deepEqual(scan('console.log(1)', rules, 'a.ts').map((f) => f.id), ['no-console']);
  assert.deepEqual(scan('console.log(1)', rules, 'a.js'), []);
  assert.deepEqual(scan('', rules, '.env'), []);
});

test('a broken checks.json is reported, built-ins still apply', () => {
  const root = repo();
  fs.mkdirSync(path.join(root, '.compliance-rules'));
  fs.writeFileSync(path.join(root, '.compliance-rules', 'checks.json'), '{ nope');
  const { rules, error } = loadChecks(root);
  assert.match(error, /checks\.json/);
  assert.equal(rules.length, BUILTIN.length);
});

test('addedText reads Claude Code and OpenCode edit shapes', () => {
  assert.equal(addedText({ content: 'a' }), 'a');
  assert.equal(addedText({ old_string: 'x', new_string: 'b' }), 'b');
  assert.equal(addedText({ edits: [{ new_string: 'c' }, { newString: 'd' }] }), 'c\nd');
});

test('beforeEdit blocks HIGH, warns on MEDIUM, allows clean', () => {
  const ctx = ctxFor(repo());
  assert.equal(beforeEdit(ctx, { file_path: 'a.js', content: 'x = "ghp_' + 'a'.repeat(36) + '"' }).action, 'block');
  assert.equal(beforeEdit(ctx, { file_path: 'a.js', content: PLACEHOLDER }).action, 'warn');
  assert.equal(beforeEdit(ctx, { file_path: 'a.js', content: 'const a = 1' }).action, 'allow');
  assert.equal(beforeEdit({ ...ctx, enabled: false }, { file_path: '.env', content: '' }).action, 'allow');
});

test('afterEdit runs the lint command with {file} and feeds failures back', () => {
  const root = repo();
  const ctx = ctxFor(root, { DO_IT_LINT_CMD: 'echo checking {file}; exit 3' });
  const r = afterEdit(ctx, { file_path: 'src/a.js' });
  assert.equal(r.action, 'feedback');
  assert.match(r.message, /checking .*src\/a\.js/);
  assert.equal(afterEdit(ctxFor(root, { DO_IT_LINT_CMD: 'true {file}' }), { file_path: 'a.js' }).action, 'allow');
  assert.equal(afterEdit(ctxFor(root), { file_path: 'a.js' }).action, 'allow');
});

test('beforeShell scans the staged diff on git commit only', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'a.js'), `const t = "${FAKE_SLACK}";\n`);
  execFileSync('git', ['add', 'a.js'], { cwd: root });
  const ctx = ctxFor(root);
  assert.equal(beforeShell(ctx, 'git status').action, 'allow');
  const r = beforeShell(ctx, 'npm test && git commit -m "x"');
  assert.equal(r.action, 'block');
  assert.match(r.reason, /slack-token in a\.js/);
});

test('session context carries the core posture and repo pointers', () => {
  const root = repo();
  fs.writeFileSync(path.join(root, 'CONTRIBUTING.md'), '# c');
  fs.mkdirSync(path.join(root, '.compliance-rules'));
  fs.writeFileSync(path.join(root, '.compliance-rules', 'security.md'), '# s');
  const text = sessionContext(root, { ...DEFAULTS, DO_IT_LINT_CMD: 'eslint {file}' });
  assert.match(text, /# Core posture/);
  assert.match(text, /`CONTRIBUTING\.md`/);
  assert.match(text, /`\.compliance-rules\/security\.md`/);
  assert.match(text, /eslint \{file\}/);
  assert.doesNotMatch(text, /^---/);
  assert.match(text, /- Glossary: `GLOSSARY\.md` \(not created yet/);
  assert.match(text, /- Changelog: none; skip/);

  fs.writeFileSync(path.join(root, 'CONTEXT.md'), '# terms');
  assert.match(sessionContext(root, DEFAULTS), /- Glossary: `CONTEXT\.md`\n/);
});

function hook(event, input, env = {}) {
  return spawnSync('node', [path.join(ROOT, 'hooks', 'claude.mjs'), event], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('claude hook protocol: exit 2 blocks, JSON context on start, fail open on junk', () => {
  const root = repo();
  const blocked = hook('pre-tool', { cwd: root, tool_name: 'Write', tool_input: { file_path: path.join(root, '.env'), content: 'A=1' } });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /env-file/);

  const start = hook('session-start', { cwd: root });
  assert.equal(start.status, 0);
  assert.equal(JSON.parse(start.stdout).hookSpecificOutput.hookEventName, 'SessionStart');

  const sub = hook('subagent-start', { cwd: root });
  assert.match(JSON.parse(sub.stdout).hookSpecificOutput.additionalContext, /Core posture/);

  const off = hook('pre-tool', { cwd: root, tool_name: 'Write', tool_input: { file_path: '.env', content: '' } }, { DO_IT_HOOKS: 'off' });
  assert.equal(off.status, 0);

  const junk = spawnSync('node', [path.join(ROOT, 'hooks', 'claude.mjs'), 'pre-tool'], { input: 'not json', encoding: 'utf8' });
  assert.equal(junk.status, 0);
});

test('install-hooks merges idempotently and removes only its own entries', () => {
  const other = { hooks: [{ type: 'command', command: '/x/other' }] };
  const settings = { model: 'opus', hooks: { PostToolUse: [other] } };
  const once = mergeClaude(settings, ROOT);
  const twice = mergeClaude(once, ROOT);
  assert.deepEqual(once, twice);
  assert.equal(twice.hooks.PostToolUse.length, 2);
  assert.ok(twice.hooks.SessionStart[0].hooks[0].command.includes(path.join(ROOT, 'hooks', 'claude.mjs')));
  assert.ok(!JSON.stringify(twice).includes('CLAUDE_PLUGIN_ROOT'));
  assert.deepEqual(mergeClaude(twice, ROOT, { strip: true }), settings);

  const oc = mergeOpencode({ plugin: ['x'] }, ROOT, { major: 1 });
  assert.deepEqual(mergeOpencode(oc, ROOT, { major: 1 }), oc);
  assert.deepEqual(mergeOpencode(oc, ROOT, { strip: true }), { plugin: ['x'] });
  assert.deepEqual(mergeOpencode({}, ROOT, { major: 2 }).plugins, [path.join(ROOT, '.opencode', 'plugins')]);
});

test('OpenCode plugin injects context and throws on HIGH edits', async () => {
  const root = repo();
  const { default: plugin } = await import('../.opencode/plugins/do-it.mjs');
  const hooks = await plugin({ directory: root });
  const out = { system: [] };
  await hooks['experimental.chat.system.transform']({}, out);
  assert.match(out.system[0], /Core posture/);
  await assert.rejects(hooks['tool.execute.before']({ tool: 'write' }, { args: { filePath: 'a.js', content: FAKE_AWS } }), /aws-access-key/);
  await hooks['tool.execute.before']({ tool: 'read' }, { args: { filePath: '.env' } });
});
