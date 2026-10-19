import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseEnv, loadConfig, redact } from '../skills/track-it/scripts/config.mjs';
import { parseRef, slugify } from '../skills/track-it/scripts/refs.mjs';
import { markdownToWiki } from '../skills/track-it/scripts/wiki.mjs';
import { localTracker } from '../skills/track-it/scripts/adapters/local.mjs';
import { githubTracker } from '../skills/track-it/scripts/adapters/github.mjs';
import { jiraTracker } from '../skills/track-it/scripts/adapters/jira.mjs';
import { run } from '../skills/track-it/scripts/tracker.mjs';
import { DEFAULTS, resolveDocs } from '../skills/track-it/scripts/config.mjs';

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-'));
  fs.mkdirSync(path.join(dir, '.git'));
  return dir;
}

test('parseEnv handles comments, export, quotes', () => {
  const env = parseEnv(`# c\nexport A=1\nB = "two words"\nC='x # y'\nD=plain # trailing\nbad line\n`);
  assert.deepEqual(env, { A: '1', B: 'two words', C: 'x # y', D: 'plain' });
});

test('loadConfig layers user < project < local < env and warns on committed secrets', () => {
  const root = tmpRepo();
  const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-xdg-'));
  fs.mkdirSync(path.join(xdg, 'do-it'));
  fs.writeFileSync(path.join(xdg, 'do-it', 'config.env'), 'DO_IT_TRACKER=github\nJIRA_PROJECT_KEY=USR\n');
  fs.mkdirSync(path.join(root, '.do-it'));
  fs.writeFileSync(path.join(root, '.do-it', 'config.env'), 'DO_IT_TRACKER=jira\nJIRA_API_TOKEN=oops\n');
  fs.writeFileSync(path.join(root, '.do-it', 'local.env'), 'JIRA_PROJECT_KEY=LOC\n');

  const cfg = loadConfig({ cwd: root, env: { XDG_CONFIG_HOME: xdg, DO_IT_COMMIT: 'never', PATH: '/bin' } });
  assert.equal(cfg.values.DO_IT_TRACKER, 'jira');
  assert.equal(cfg.values.JIRA_PROJECT_KEY, 'LOC');
  assert.equal(cfg.values.DO_IT_COMMIT, 'never');
  assert.equal(cfg.sources.DO_IT_COMMIT, 'env');
  assert.equal(cfg.values.PATH, undefined);
  assert.equal(cfg.warnings.length, 1);
  assert.equal(redact(cfg.values).JIRA_API_TOKEN, '***');
});

test('resolveDocs: config wins, then first existing candidate, then default', () => {
  const root = tmpRepo();
  let docs = resolveDocs(root, DEFAULTS);
  assert.deepEqual(docs.glossary, { path: 'GLOSSARY.md', exists: false, source: 'default' });
  assert.deepEqual(docs.changelog, { path: null, exists: false, source: 'default' });

  fs.writeFileSync(path.join(root, 'CONTEXT.md'), '# terms');
  fs.mkdirSync(path.join(root, 'docs/decisions'), { recursive: true });
  fs.mkdirSync(path.join(root, '.changeset'));
  docs = resolveDocs(root, DEFAULTS);
  assert.deepEqual(docs.glossary, { path: 'CONTEXT.md', exists: true, source: 'detected' });
  assert.equal(docs.adrDir.path, 'docs/decisions');
  assert.equal(docs.changelog.path, '.changeset');

  docs = resolveDocs(root, { ...DEFAULTS, DO_IT_GLOSSARY: 'docs/terms.md' });
  assert.deepEqual(docs.glossary, { path: 'docs/terms.md', exists: false, source: 'config' });
});

test('parseRef routes by shape', () => {
  assert.deepEqual(parseRef('#42'), { kind: 'github', number: 42 });
  assert.deepEqual(parseRef('https://github.com/o/r/issues/7'), { kind: 'github', repo: 'o/r', number: 7 });
  assert.deepEqual(parseRef('ABC-123'), { kind: 'jira', key: 'ABC-123' });
  assert.deepEqual(parseRef('https://jira.x.org/browse/CDS-9'), { kind: 'jira', key: 'CDS-9' });
  assert.deepEqual(parseRef('docs/issues/a.md'), { kind: 'local', path: 'docs/issues/a.md' });
  assert.equal(parseRef('whatever'), null);
  assert.equal(slugify('Fix: the 504 on /orders!'), 'fix-the-504-on-orders');
});

test('markdownToWiki converts the subset do-it writes', () => {
  const wiki = markdownToWiki('## Goal\n- **bold** and `code`\n  - nested [link](http://x)\n1. one\n```js\nconst a = 1;\n```');
  assert.equal(wiki, 'h2. Goal\n* *bold* and {{code}}\n** nested [link|http://x]\n# one\n{code:js}\nconst a = 1;\n{code}');
});

test('local tracker: create, start, comment, close round trip', () => {
  const root = tmpRepo();
  const t = localTracker(DEFAULTS, { root });
  const { ref } = t.create({ title: 'Orders 504', type: 'bug', body: '## Problem\n\nSlow.\n', source: 'user' });
  assert.equal(ref, 'docs/issues/orders-504.md');
  assert.equal(t.create({ title: 'Orders 504' }).ref, 'docs/issues/orders-504-2.md');
  t.start(ref);
  t.comment(ref, 'note one');
  t.close(ref, 'shipped');
  const got = t.get(ref);
  assert.equal(got.status, 'closed');
  assert.equal(got.type, 'bug');
  assert.match(got.body, /## Log\n\n- \d{4}-\d\d-\d\d: started\n- .*note one\n- .*closed: shipped/);
});

test('github tracker builds gh calls and retries create without labels', () => {
  const calls = [];
  const runner = (args, input) => {
    calls.push({ args, input });
    if (args[1] === 'create' && args.includes('--label')) throw new Error('label not found');
    if (args[1] === 'create') return 'https://github.com/o/r/issues/12\n';
    if (args[1] === 'view') return JSON.stringify({ number: 12, title: 'T', body: 'B', state: 'OPEN', url: 'u', labels: [], comments: [] });
    return '';
  };
  const t = githubTracker({ ...DEFAULTS, DO_IT_GITHUB_REPO: 'o/r' }, { run: runner });
  assert.deepEqual(t.create({ title: 'T', type: 'bug', body: 'B' }), {
    ref: 'o/r#12',
    number: 12,
    url: 'https://github.com/o/r/issues/12',
    labelsDropped: ['bug'],
  });
  assert.equal(calls.length, 2);
  assert.equal(t.get('#12').status, 'OPEN');
  t.close('#12', 'done');
  assert.deepEqual(calls.at(-1).args, ['issue', 'close', '12', '-R', 'o/r', '--comment', 'done']);
  assert.deepEqual(t.start('#12'), { ref: '#12', skipped: 'no DO_IT_GITHUB_START_LABEL' });
});

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.Authorization });
    const key = `${init.method} ${url.replace(/^.*\/rest\/api\/2/, '')}`;
    const body = routes[key];
    if (body === undefined) return { ok: false, status: 404, text: async () => 'not found' };
    return { ok: true, status: 200, text: async () => (body === '' ? '' : JSON.stringify(body)) };
  };
  fn.calls = calls;
  return fn;
}

const JIRA = { ...DEFAULTS, JIRA_BASE_URL: 'https://jira.x.org/', JIRA_API_TOKEN: 'pat', JIRA_PROJECT_KEY: 'CDS' };

test('jira tracker: bearer auth, wiki body, transition by name', async () => {
  const fetch = fakeFetch({
    'POST /issue': { key: 'CDS-1' },
    'GET /issue/CDS-1/transitions': { transitions: [{ id: '31', name: 'Start', to: { name: 'In Progress' } }] },
    'POST /issue/CDS-1/transitions': '',
  });
  const t = jiraTracker(JIRA, { fetch });
  assert.deepEqual(await t.create({ title: 'T', type: 'bug', body: '## H' }), { ref: 'CDS-1', url: 'https://jira.x.org/browse/CDS-1' });
  const created = fetch.calls[0];
  assert.equal(created.auth, 'Bearer pat');
  assert.equal(created.body.fields.description, 'h2. H');
  assert.equal(created.body.fields.issuetype.name, 'Bug');
  assert.deepEqual(await t.start('CDS-1'), { ref: 'CDS-1', status: 'In Progress' });
  assert.deepEqual(fetch.calls.at(-1).body, { transition: { id: '31' } });
});

test('jira tracker: missing transition is skipped, not guessed', async () => {
  const fetch = fakeFetch({ 'GET /issue/CDS-2/transitions': { transitions: [{ id: '1', name: 'Close' }] } });
  const r = await jiraTracker(JIRA, { fetch }).start('CDS-2');
  assert.match(r.skipped, /no transition "In Progress"; available: Close/);
});

test('jira publish: epic link field on Data Center, default epic skips epic creation', async () => {
  let n = 10;
  const fetch = async (url, init) => ({ ok: true, status: 201, text: async () => JSON.stringify({ key: `CDS-${n++}` }) });
  const calls = [];
  const spy = async (url, init) => (calls.push(JSON.parse(init.body)), fetch(url, init));
  const t = jiraTracker({ ...JIRA, JIRA_DEFAULT_EPIC: 'CDS-5', JIRA_EPIC_LINK_FIELD: 'customfield_10008' }, { fetch: spy });
  const r = await t.publish({ title: 'Plan', phases: [{ n: 1, title: 'A' }, { n: 2, title: 'B' }] });
  assert.equal(r.parent, 'CDS-5');
  assert.deepEqual(r.phases, { 1: 'CDS-10', 2: 'CDS-11' });
  assert.equal(calls[0].fields.customfield_10008, 'CDS-5');
});

test('jira basic auth when JIRA_EMAIL is set', async () => {
  const fetch = fakeFetch({ 'GET /issue/CDS-3?fields=summary,description,status,issuetype,assignee,comment': { fields: { summary: 'S' } } });
  await jiraTracker({ ...JIRA, JIRA_EMAIL: 'a@b.c' }, { fetch }).get('CDS-3');
  assert.equal(fetch.calls[0].auth, `Basic ${Buffer.from('a@b.c:pat').toString('base64')}`);
});

test('CLI: config redacts, create uses the default tracker, refs route by shape', async () => {
  const root = tmpRepo();
  const config = { root, values: { ...DEFAULTS, JIRA_API_TOKEN: 'secret' }, sources: {}, warnings: [] };
  const out = await run(['config'], { config });
  assert.equal(out.values.JIRA_API_TOKEN, '***');
  const created = await run(['create', '--title', 'A thing', '--type', 'todo', '--body', 'x'], { config });
  assert.equal(created.ref, 'docs/issues/a-thing.md');
  await assert.rejects(run(['get', 'nonsense'], { config }), /cannot tell which tracker/);
  await assert.rejects(run(['create'], { config }), /needs --title/);
});
