// Request building of the Jira and GitHub adapters: what goes on the wire for
// create, get, comment and close, against a recording fake fetch and a fake gh runner.

import './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fakeFetch, fakeGh } from './fakes.mjs';
import { DEFAULTS } from '../skills/track-it/scripts/config.mjs';
import { jiraTracker } from '../skills/track-it/scripts/adapters/jira.mjs';
import { githubTracker } from '../skills/track-it/scripts/adapters/github.mjs';

const JIRA = {
  ...DEFAULTS,
  JIRA_BASE_URL: 'https://j.example/',
  JIRA_API_TOKEN: 'tok-123',
  JIRA_EMAIL: 'me@example.com',
  JIRA_PROJECT_KEY: 'PR',
  JIRA_COMPONENTS: 'Core',
  JIRA_DEFAULT_EPIC: 'PR-1',
};
const BASIC = `Basic ${Buffer.from('me@example.com:tok-123').toString('base64')}`;

// A Jira that answers the calls an adapter makes and records each request.
function fakeJira({ transitions = [{ id: '31', name: 'Done', to: { name: 'Done' } }] } = {}) {
  const fetch = fakeFetch((url, init) => {
    const path = url.replace('https://j.example', '');
    if (init.method === 'GET' && path.startsWith('/rest/api/2/project/')) return { components: [{ name: 'Core' }] };
    if (init.method === 'POST' && path === '/rest/api/2/issue') return { key: 'PR-9' };
    if (init.method === 'GET' && path.endsWith('/transitions')) return { transitions };
    if (init.method === 'GET') {
      return { fields: { summary: 'S', description: 'D', status: { name: 'Open' }, issuetype: { name: 'Bug' }, assignee: null, comment: { comments: [] } } };
    }
    return {};
  });
  return { fetch, calls: fetch.calls };
}

test('Jira create posts one issue with the project, summary, type, component and epic parent', async () => {
  const { fetch, calls } = fakeJira();
  const r = await jiraTracker(JIRA, { fetch }).create({ title: 'Broken', type: 'bug', body: 'plain body' });
  assert.deepEqual(r, { ref: 'PR-9', url: 'https://j.example/browse/PR-9' });
  const post = calls.find((c) => c.method === 'POST');
  assert.equal(post.path, '/rest/api/2/issue');
  assert.equal(post.auth, BASIC);
  assert.deepEqual(post.body, {
    fields: {
      project: { key: 'PR' },
      summary: 'Broken',
      description: 'plain body',
      issuetype: { name: 'Bug' },
      components: [{ name: 'Core' }],
      parent: { key: 'PR-1' },
    },
  });
});

test('Jira get reads one issue by key and maps its fields', async () => {
  const { fetch, calls } = fakeJira();
  const got = await jiraTracker(JIRA, { fetch }).get('pr-4');
  assert.ok(calls.every((c) => c.auth === BASIC), 'every request carries the auth header');
  assert.deepEqual(calls.map((c) => [c.method, c.path]), [['GET', '/rest/api/2/issue/PR-4?fields=summary,description,status,issuetype,assignee,comment']]);
  assert.deepEqual(got, { ref: 'PR-4', url: 'https://j.example/browse/PR-4', title: 'S', status: 'Open', type: 'Bug', assignee: null, body: 'D', comments: [] });
});

test('Jira comment posts the text to the issue comment endpoint', async () => {
  const { fetch, calls } = fakeJira();
  await jiraTracker(JIRA, { fetch }).comment('PR-4', 'hello');
  assert.ok(calls.every((c) => c.auth === BASIC), 'every request carries the auth header');
  assert.deepEqual(calls.map((c) => [c.method, c.path, c.body]), [['POST', '/rest/api/2/issue/PR-4/comment', { body: 'hello' }]]);
});

test('Jira close comments first, then moves the issue by the transition id', async () => {
  const { fetch, calls } = fakeJira();
  const r = await jiraTracker(JIRA, { fetch }).close('PR-4', 'shipped');
  assert.ok(calls.every((c) => c.auth === BASIC), 'every request carries the auth header');
  assert.deepEqual(calls.map((c) => [c.method, c.path, c.body]), [
    ['POST', '/rest/api/2/issue/PR-4/comment', { body: 'shipped' }],
    ['GET', '/rest/api/2/issue/PR-4/transitions', undefined],
    ['POST', '/rest/api/2/issue/PR-4/transitions', { transition: { id: '31' } }],
  ]);
  assert.deepEqual(r, { ref: 'PR-4', status: 'Done' });
});

test('Jira close with no matching transition posts nothing and says which exist', async () => {
  const { fetch, calls } = fakeJira({ transitions: [{ id: '5', name: 'Resolve', to: { name: 'Resolved' } }] });
  const r = await jiraTracker(JIRA, { fetch }).close('PR-4');
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0);
  assert.match(r.skipped, /no transition "Done"; available: Resolve/);
});

const GH = { ...DEFAULTS, DO_IT_GITHUB_REPO: 'o/r' };

test('GitHub create passes the title, the body on stdin and one --label per label', () => {
  const { run, calls } = fakeGh(() => 'https://github.com/o/r/issues/12\n');
  const r = githubTracker(GH, { run }).create({ title: 'T', type: 'bug', body: 'the body', labels: ['x'] });
  assert.deepEqual(calls[0].args, ['issue', 'create', '-R', 'o/r', '--title', 'T', '--body-file', '-', '--label', 'x', '--label', 'bug']);
  assert.equal(calls[0].input, 'the body');
  assert.deepEqual(r, { ref: 'o/r#12', number: 12, url: 'https://github.com/o/r/issues/12' });
});

test('GitHub comment sends the text on stdin; close adds --comment only when there is text', () => {
  const { run, calls } = fakeGh();
  const t = githubTracker(GH, { run });
  t.comment('o/r#5', 'hello');
  assert.deepEqual(calls[0], { args: ['issue', 'comment', '5', '-R', 'o/r', '--body-file', '-'], input: 'hello' });
  t.close('o/r#5', 'done');
  assert.deepEqual(calls[1].args, ['issue', 'close', '5', '-R', 'o/r', '--comment', 'done']);
  t.close('o/r#5');
  assert.deepEqual(calls[2].args, ['issue', 'close', '5', '-R', 'o/r']);
});

test('GitHub get asks for the issue as JSON and maps it', () => {
  const data = { number: 5, title: 'T', body: 'B', state: 'OPEN', url: 'https://github.com/o/r/issues/5', labels: [{ name: 'bug' }], comments: [{ author: { login: 'a' }, body: 'c' }] };
  const { run, calls } = fakeGh(() => JSON.stringify(data));
  const got = githubTracker(GH, { run }).get('o/r#5');
  assert.deepEqual(calls[0].args, ['issue', 'view', '5', '-R', 'o/r', '--json', 'number,title,body,state,url,labels,comments']);
  assert.deepEqual(got, { ref: 'o/r#5', title: 'T', status: 'OPEN', url: data.url, body: 'B', labels: ['bug'], comments: [{ author: 'a', body: 'c' }] });
});
