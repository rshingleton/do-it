import './env.mjs'; // first: isolates the developer's environment
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
  assert.deepEqual(docs.context, { path: 'CONTEXT.md', exists: false, source: 'default' });
  assert.deepEqual(docs.contextMap, { path: 'CONTEXT-MAP.md', exists: false, source: 'default' });
  assert.deepEqual(docs.changelog, { path: null, exists: false, source: 'default' });

  fs.writeFileSync(path.join(root, 'GLOSSARY.md'), '# terms');
  fs.writeFileSync(path.join(root, 'GLOSSARY-MAP.md'), '# map');
  fs.mkdirSync(path.join(root, 'docs/decisions'), { recursive: true });
  fs.mkdirSync(path.join(root, '.changeset'));
  docs = resolveDocs(root, DEFAULTS);
  assert.deepEqual(docs.context, { path: 'GLOSSARY.md', exists: true, source: 'detected' });
  assert.deepEqual(docs.contextMap, { path: 'GLOSSARY-MAP.md', exists: true, source: 'detected' });
  assert.equal(docs.adrDir.path, 'docs/decisions');
  assert.equal(docs.changelog.path, '.changeset');

  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'CONTEXT.md'), '# area');
  fs.writeFileSync(path.join(root, 'docs', 'CONTEXT-MAP.md'), '# map');
  docs = resolveDocs(root, DEFAULTS);
  assert.deepEqual(docs.context, { path: 'docs/CONTEXT.md', exists: true, source: 'detected' });
  assert.deepEqual(docs.contextMap, { path: 'docs/CONTEXT-MAP.md', exists: true, source: 'detected' });

  fs.writeFileSync(path.join(root, 'CONTEXT.md'), '# area');
  fs.writeFileSync(path.join(root, 'CONTEXT-MAP.md'), '# map');
  docs = resolveDocs(root, DEFAULTS);
  assert.deepEqual(docs.context, { path: 'CONTEXT.md', exists: true, source: 'detected' });
  assert.deepEqual(docs.contextMap, { path: 'CONTEXT-MAP.md', exists: true, source: 'detected' });

  docs = resolveDocs(root, { ...DEFAULTS, DO_IT_CONTEXT: 'docs/terms.md', DO_IT_CONTEXT_MAP: 'docs/areas.md' });
  assert.deepEqual(docs.context, { path: 'docs/terms.md', exists: false, source: 'config' });
  assert.deepEqual(docs.contextMap, { path: 'docs/areas.md', exists: false, source: 'config' });
});

test('resolveDocs: DO_IT_GLOSSARY still names the context when DO_IT_CONTEXT is unset', () => {
  const root = tmpRepo();
  fs.writeFileSync(path.join(root, 'CONTEXT.md'), '# area');
  assert.equal(resolveDocs(root, { ...DEFAULTS, DO_IT_GLOSSARY: 'docs/old.md' }).context.path, 'docs/old.md');
  assert.equal(resolveDocs(root, { ...DEFAULTS, DO_IT_GLOSSARY: 'docs/old.md', DO_IT_CONTEXT: 'docs/new.md' }).context.path, 'docs/new.md');
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
  assert.match(t.get(ref).body, /## Log\n\n- \d{4}-\d\d-\d\d: started\n- .*note one/);
  assert.deepEqual(t.close(ref, 'shipped'), { ref, status: 'closed', removed: true });
  assert.equal(fs.existsSync(path.join(root, ref)), false);
  assert.throws(() => t.close(ref));
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
const PROJECT = { key: 'CDS', components: [{ name: 'Core' }, { name: 'UI' }] };

test('jira tracker: bearer auth, wiki body, transition by name', async () => {
  const fetch = fakeFetch({
    'GET /project/CDS': PROJECT,
    'POST /issue': { key: 'CDS-1' },
    'GET /issue/CDS-1/transitions': { transitions: [{ id: '31', name: 'Start', to: { name: 'In Progress' } }] },
    'POST /issue/CDS-1/transitions': '',
  });
  const t = jiraTracker(JIRA, { fetch });
  assert.deepEqual(await t.create({ title: 'T', type: 'bug', body: '## H', components: ['none'], epic: 'none' }), { ref: 'CDS-1', url: 'https://jira.x.org/browse/CDS-1' });
  const created = fetch.calls.find((c) => c.method === 'POST');
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
  const spy = async (url, init) => (calls.push(init.body && JSON.parse(init.body)), fetch(url, init));
  const t = jiraTracker({ ...JIRA, JIRA_DEFAULT_EPIC: 'CDS-5', JIRA_EPIC_LINK_FIELD: 'customfield_10008' }, { fetch: spy });
  const r = await t.publish({ title: 'Plan', components: ['none'], phases: [{ n: 1, title: 'A' }, { n: 2, title: 'B' }] });
  assert.equal(r.parent, 'CDS-5');
  assert.deepEqual(r.phases, { 1: 'CDS-11', 2: 'CDS-12' });
  assert.equal(calls.find((c) => c?.fields).fields.customfield_10008, 'CDS-5');
});

test('jira create: components and epic from flags or config, sent as Jira spells them', async () => {
  const fetch = fakeFetch({ 'GET /project/CDS': PROJECT, 'POST /issue': { key: 'CDS-7' } });
  const dc = jiraTracker({ ...JIRA, JIRA_EPIC_LINK_FIELD: 'customfield_10008' }, { fetch });
  await dc.create({ title: 'T', components: ['core'], epic: 'CDS-5' });
  const sent = fetch.calls.find((c) => c.method === 'POST').body.fields;
  assert.deepEqual(sent.components, [{ name: 'Core' }]);
  assert.equal(sent.customfield_10008, 'CDS-5');

  const fetch2 = fakeFetch({ 'GET /project/CDS': PROJECT, 'POST /issue': { key: 'CDS-8' } });
  await jiraTracker({ ...JIRA, JIRA_COMPONENTS: 'Core, UI', JIRA_DEFAULT_EPIC: 'CDS-5' }, { fetch: fetch2 }).create({ title: 'T' });
  const cloud = fetch2.calls.find((c) => c.method === 'POST').body.fields;
  assert.deepEqual(cloud.components, [{ name: 'Core' }, { name: 'UI' }]);
  assert.deepEqual(cloud.parent, { key: 'CDS-5' });
});

test('jira create: --parent makes a sub-task and --project overrides the default', async () => {
  const fetch = fakeFetch({ 'GET /project/OPS': { key: 'OPS', components: [{ name: 'Ops' }] }, 'POST /issue': { key: 'OPS-2' } });
  await jiraTracker(JIRA, { fetch }).create({ title: 'T', project: 'OPS', components: ['Ops'], parent: 'OPS-1' });
  const sent = fetch.calls.find((c) => c.method === 'POST').body.fields;
  assert.deepEqual(sent.project, { key: 'OPS' });
  assert.deepEqual(sent.parent, { key: 'OPS-1' });
  assert.equal(sent.issuetype.name, 'Sub-task');
});

test('jira create: refuses before creating when the project, a component or the epic is not settled', async () => {
  const refuses = async (cfg, args, pattern) => {
    const fetch = fakeFetch({ 'GET /project/CDS': PROJECT, 'POST /issue': { key: 'CDS-9' } });
    await assert.rejects(jiraTracker({ ...JIRA, ...cfg }, { fetch }).create({ title: 'T', ...args }), pattern);
    assert.ok(!fetch.calls.some((c) => c.method === 'POST'), `no issue created for ${JSON.stringify(args)}`);
  };
  await refuses({}, { epic: 'CDS-5' }, /component.*--component.*none/s);
  await refuses({}, { components: ['Core'] }, /epic or parent.*--epic.*none/s);
  await refuses({}, { components: ['Nope'], epic: 'CDS-5' }, /unknown component "Nope".*Core, UI/s);
  await refuses({}, { components: ['none', 'Core'], epic: 'CDS-5' }, /cannot be mixed/);
  await refuses({}, { components: ['Core'], epic: 'CDS-5', parent: 'CDS-6' }, /--epic or --parent, not both/);
  await refuses({}, { project: 'ZZZ', components: ['Core'], epic: 'CDS-5' }, /project ZZZ/);
});

test('jira create: none skips the component and epic checks', async () => {
  const fetch = fakeFetch({ 'GET /project/CDS': PROJECT, 'POST /issue': { key: 'CDS-9' } });
  await jiraTracker({ ...JIRA, JIRA_COMPONENTS: 'none', JIRA_DEFAULT_EPIC: 'none' }, { fetch }).create({ title: 'T' });
  const sent = fetch.calls.find((c) => c.method === 'POST').body.fields;
  assert.equal(sent.components, undefined);
  assert.equal(sent.parent, undefined);
});

test('jira publish: the epic it creates and every child carry the components', async () => {
  let n = 20;
  const bodies = [];
  const fetch = async (url, init) => {
    if (url.endsWith('/project/CDS')) return { ok: true, status: 200, text: async () => JSON.stringify(PROJECT) };
    bodies.push(JSON.parse(init.body));
    return { ok: true, status: 201, text: async () => JSON.stringify({ key: `CDS-${n++}` }) };
  };
  const r = await jiraTracker(JIRA, { fetch }).publish({ title: 'Plan', components: ['UI'], phases: [{ n: 1, title: 'A' }] });
  assert.equal(r.parent, 'CDS-20');
  assert.equal(bodies[0].fields.issuetype.name, 'Epic');
  assert.deepEqual(bodies[0].fields.components, [{ name: 'UI' }]);
  assert.equal(bodies[0].fields.parent, undefined);
  assert.deepEqual(bodies[1].fields.components, [{ name: 'UI' }]);
  assert.deepEqual(bodies[1].fields.parent, { key: 'CDS-20' });
});

test('jira publish that fails partway returns the refs it made', async () => {
  let n = 20;
  const post = (fail) => async (url, init) => {
    if (url.endsWith('/project/CDS')) return { ok: true, status: 200, text: async () => JSON.stringify(PROJECT) };
    if (fail(n)) return { ok: false, status: 500, text: async () => JSON.stringify({ errorMessages: ['boom'] }) };
    return { ok: true, status: 201, text: async () => JSON.stringify({ key: `CDS-${n++}` }) };
  };
  const spec = { title: 'Plan', components: ['UI'], phases: [{ n: 1, title: 'A' }, { n: 2, title: 'B' }] };
  const child = await jiraTracker(JIRA, { fetch: post((k) => k === 22) }).publish(spec);
  assert.equal(child.parent, 'CDS-20');
  assert.deepEqual(child.phases, { 1: 'CDS-21' });
  assert.match(child.error, /500/);
  n = 20;
  const epic = await jiraTracker(JIRA, { fetch: post(() => true) }).publish(spec);
  assert.deepEqual({ parent: epic.parent, phases: epic.phases }, { parent: null, phases: {} });
  assert.match(epic.error, /500/);
});

test('CLI: create passes project, components, epic and parent to Jira', async () => {
  const root = tmpRepo();
  const fetch = fakeFetch({ 'GET /project/CDS': PROJECT, 'POST /issue': { key: 'CDS-3' } });
  const config = { root, values: { ...JIRA }, sources: {}, warnings: [] };
  await run(['create', '--tracker', 'jira', '--title', 'T', '--project', 'CDS', '--component', 'Core', '--component', 'UI', '--epic', 'CDS-5'], { config, deps: { fetch } });
  const sent = fetch.calls.find((c) => c.method === 'POST').body.fields;
  assert.deepEqual(sent.components, [{ name: 'Core' }, { name: 'UI' }]);
  assert.deepEqual(sent.parent, { key: 'CDS-5' });
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

test('jira: --parent none and an epic of none file with no parent; publish with none makes no epic', async () => {
  const fetch = fakeFetch({ 'GET /project/CDS': PROJECT, 'POST /issue': { key: 'CDS-9' } });
  await jiraTracker(JIRA, { fetch }).create({ title: 'T', components: ['Core'], parent: 'none' });
  const sent = fetch.calls.find((c) => c.method === 'POST').body.fields;
  assert.equal(sent.parent, undefined);
  assert.equal(sent.issuetype.name, 'Task');

  let n = 30;
  const bodies = [];
  const pub = async (url, init) => {
    if (url.endsWith('/project/CDS')) return { ok: true, status: 200, text: async () => JSON.stringify(PROJECT) };
    bodies.push(JSON.parse(init.body));
    return { ok: true, status: 201, text: async () => JSON.stringify({ key: `CDS-${n++}` }) };
  };
  const r = await jiraTracker({ ...JIRA, JIRA_DEFAULT_EPIC: 'none' }, { fetch: pub }).publish({ title: 'Plan', components: ['UI'], phases: [{ n: 1, title: 'A' }] });
  assert.equal(r.parent, null);
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].fields.issuetype.name, 'Task');
  assert.equal(bodies[0].fields.parent, undefined);
});

test('jira: an error page that echoes the auth header does not leak the token', async () => {
  const token = ['pa', 't-SECRET-123'].join('');
  const fetch = async (url, init) => ({ ok: false, status: 403, text: async () => `denied for ${init.headers.Authorization}` });
  const err = await jiraTracker({ ...JIRA, JIRA_API_TOKEN: token }, { fetch }).get('CDS-1').catch((e) => e);
  assert.doesNotMatch(err.message, /SECRET-123/);
  const basic = await jiraTracker({ ...JIRA, JIRA_API_TOKEN: token, JIRA_EMAIL: 'a@b.c' }, { fetch }).get('CDS-1').catch((e) => e);
  assert.doesNotMatch(basic.message, new RegExp(Buffer.from(`a@b.c:${token}`).toString('base64')));
});

test('jira: a token inside the basic value, or a non-JSON 2xx body, does not leak', async () => {
  // base64("a@b.c:YUBi") starts with "YUBi", so masking the token first would
  // break the base64 value and leave the rest of it printed.
  const echo = async (url, init) => ({ ok: false, status: 401, text: async () => `got ${init.headers.Authorization}` });
  const err = await jiraTracker({ ...JIRA, JIRA_API_TOKEN: 'YUBi', JIRA_EMAIL: 'a@b.c' }, { fetch: echo }).get('CDS-1').catch((e) => e);
  assert.doesNotMatch(err.message, /LmM6/);
  const page = async () => ({ ok: true, status: 200, text: async () => '<html>sso for a@b.c token=abc123</html>' });
  const bad = await jiraTracker(JIRA, { fetch: page }).get('CDS-1').catch((e) => e);
  assert.match(bad.message, /not JSON/);
  assert.doesNotMatch(bad.message, /abc123/);
});

test('jira create: a blank epic, parent or project counts as unset', async () => {
  for (const args of [{ epic: ' ' }, { parent: '  ' }]) {
    const fetch = fakeFetch({ 'GET /project/CDS': PROJECT, 'POST /issue': { key: 'CDS-9' } });
    await assert.rejects(jiraTracker(JIRA, { fetch }).create({ title: 'T', components: ['Core'], ...args }), /epic or parent/);
    assert.ok(!fetch.calls.some((c) => c.method === 'POST'));
  }
  const fetch = fakeFetch({ 'GET /project/CDS': PROJECT, 'POST /issue': { key: 'CDS-9' } });
  await jiraTracker(JIRA, { fetch }).create({ title: 'T', project: ' ', components: ['Core'], epic: 'CDS-5' });
  assert.deepEqual(fetch.calls.find((c) => c.method === 'POST').body.fields.project, { key: 'CDS' });
});

test('jira: a blank JIRA_DEFAULT_EPIC is unset for create and publish', async () => {
  const fetch = fakeFetch({ 'GET /project/CDS': PROJECT, 'POST /issue': { key: 'CDS-9' } });
  const t = jiraTracker({ ...JIRA, JIRA_DEFAULT_EPIC: '  ' }, { fetch });
  await assert.rejects(t.create({ title: 'T', components: ['none'] }), /epic or parent/);
  assert.ok(!fetch.calls.some((c) => c.method === 'POST'));

  let n = 40;
  const bodies = [];
  const pub = async (url, init) => {
    if (url.endsWith('/project/CDS')) return { ok: true, status: 200, text: async () => JSON.stringify(PROJECT) };
    bodies.push(JSON.parse(init.body));
    return { ok: true, status: 201, text: async () => JSON.stringify({ key: `CDS-${n++}` }) };
  };
  const r = await jiraTracker({ ...JIRA, JIRA_DEFAULT_EPIC: '  ' }, { fetch: pub }).publish({ title: 'Plan', parent: ' ', components: ['UI'], phases: [{ n: 1, title: 'A' }] });
  assert.equal(bodies[0].fields.issuetype.name, 'Epic');
  assert.equal(r.parent, 'CDS-40');
});

test('jira: a fetch that throws quoting the auth header does not leak the token', async () => {
  const token = ['fa', 'ke\nmid'].join('');
  const fetch = async (url, init) => {
    throw new TypeError(`Headers.append: "${init.headers.Authorization}" is an invalid header value.`);
  };
  const err = await jiraTracker({ ...JIRA, JIRA_API_TOKEN: token }, { fetch }).get('CDS-1').catch((e) => e);
  assert.match(err.message, /request failed/);
  assert.doesNotMatch(err.message, /mid/);
});

test('jira create: a null component in a spec is refused like a missing one', async () => {
  const fetch = fakeFetch({ 'GET /project/CDS': PROJECT, 'POST /issue': { key: 'CDS-9' } });
  await assert.rejects(jiraTracker(JIRA, { fetch }).create({ title: 'T', components: [null], epic: 'CDS-5' }), /needs a component/);
});

test('CLI: list shows open local issues, a closed one is gone, a remote tracker adds a note', async () => {
  const root = tmpRepo();
  const config = { root, values: { ...DEFAULTS }, sources: {}, warnings: [] };
  await run(['create', '--title', 'Export fails on Safari', '--type', 'bug'], { config });
  await run(['create', '--title', 'Replace CSV importer', '--type', 'feature'], { config });
  await run(['close', 'docs/issues/replace-csv-importer.md'], { config });

  const open = await run(['list'], { config });
  assert.deepEqual(open.issues, [
    { ref: 'docs/issues/export-fails-on-safari.md', title: 'Export fails on Safari', type: 'bug', status: 'open' },
  ]);
  assert.equal(open.note, undefined);

  const all = await run(['list', '--status', 'all'], { config });
  assert.deepEqual(all.issues.map((i) => i.status), ['open']);
  assert.deepEqual((await run(['list', '--status', 'closed'], { config })).issues, []);
  await assert.rejects(run(['list', '--status', 'done'], { config }), /open, closed or all/);

  const remote = await run(['list'], { config: { ...config, values: { ...DEFAULTS, DO_IT_TRACKER: 'github' } } });
  assert.equal(remote.issues.length, 1);
  assert.match(remote.note, /github issues live in the tracker/);
});
