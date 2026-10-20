// Regression tests for bugs found in the track-it scripts. Each test reproduces
// the reported failure; see the commit that added this file for the hunt.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseEnv, resolveDocs, redact, DEFAULTS } from '../skills/track-it/scripts/config.mjs';
import { parseRef } from '../skills/track-it/scripts/refs.mjs';
import { markdownToWiki } from '../skills/track-it/scripts/wiki.mjs';
import { localTracker } from '../skills/track-it/scripts/adapters/local.mjs';
import { githubTracker } from '../skills/track-it/scripts/adapters/github.mjs';
import { jiraTracker } from '../skills/track-it/scripts/adapters/jira.mjs';
import { parseArgs } from '../skills/track-it/scripts/tracker.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-reg-'));
  fs.mkdirSync(path.join(dir, '.git'));
  return dir;
}

test('quoted dotenv value with an inline comment loses its quotes', () => {
  assert.deepEqual(parseEnv(`A="quoted" # note\nB='x y' # c\n`), { A: 'quoted', B: 'x y' });
});

test('absolute doc and issue paths are used as given', () => {
  const root = tmpRepo();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-abs-'));
  fs.writeFileSync(path.join(outside, 'gloss.md'), '# g');
  assert.equal(resolveDocs(root, { ...DEFAULTS, DO_IT_CONTEXT: path.join(outside, 'gloss.md') }).context.exists, true);

  const t = localTracker({ ...DEFAULTS, DO_IT_ISSUES_DIR: outside }, { root });
  t.create({ title: 'Abs' });
  assert.ok(fs.existsSync(path.join(outside, 'abs.md')));
});

test('parseArgs accepts values that start with dashes', () => {
  assert.equal(parseArgs(['create', '--title', 'Plan', '--body', '---']).body, '---');
  assert.equal(parseArgs(['comment', 'x.md', '--body', '-- signed']).body, '-- signed');
  assert.equal(parseArgs(['create', '--title=Eq form']).title, 'Eq form');
  assert.throws(() => parseArgs(['create', '--title']), /--title needs a value/);
});

test('local frontmatter round-trips awkward titles unchanged', () => {
  const root = tmpRepo();
  const t = localTracker(DEFAULTS, { root });
  for (const title of ['Fix "login": broken', "Fix the users'", '"Quoted" thing', 'Has # hash', 'Plain']) {
    const { ref } = t.create({ title });
    t.start(ref);
    t.comment(ref, 'one');
    t.comment(ref, 'two');
    assert.equal(t.get(ref).title, title);
  }
});

test('comment lands inside the Log section, not after a later section', () => {
  const root = tmpRepo();
  const file = path.join(root, 'docs/issues/x.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '---\ntitle: X\nstatus: open\n---\n\nIntro\n\n## Log\n\n- old\n\n## Notes\n\nnotes here\n');
  localTracker(DEFAULTS, { root }).comment('docs/issues/x.md', 'new');
  const body = fs.readFileSync(file, 'utf8');
  assert.ok(body.indexOf(': new') < body.indexOf('## Notes'), body);
  assert.match(body, /notes here\n$/);
});

test('CRLF issue files keep their frontmatter', () => {
  const root = tmpRepo();
  const file = path.join(root, 'docs/issues/win.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '---\r\ntitle: Win\r\nstatus: open\r\n---\r\n\r\nBody\r\n');
  const t = localTracker(DEFAULTS, { root });
  t.start('docs/issues/win.md');
  const got = t.get('docs/issues/win.md');
  assert.equal(got.title, 'Win');
  assert.equal(got.status, 'in-progress');
  assert.equal(fs.readFileSync(file, 'utf8').match(/^---/gm).length, 2);
});

function capture() {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization });
    return { ok: true, status: 200, text: async () => JSON.stringify({ fields: {} }) };
  };
  fetch.calls = calls;
  return fetch;
}

const JIRA = { ...DEFAULTS, JIRA_BASE_URL: 'https://j.x', JIRA_API_TOKEN: 'SECRET', JIRA_PROJECT_KEY: 'P' };

test('JIRA_AUTH is case-insensitive and basic auth requires JIRA_EMAIL', async () => {
  const f = capture();
  await jiraTracker({ ...JIRA, JIRA_AUTH: 'Basic', JIRA_EMAIL: 'a@b.c' }, { fetch: f }).get('PR-1');
  assert.match(f.calls[0].auth, /^Basic /);
  await assert.rejects(jiraTracker({ ...JIRA, JIRA_AUTH: 'basic' }, { fetch: capture() }).get('PR-1'), /JIRA_EMAIL/);
});

test('credentials in JIRA_BASE_URL never reach output', async () => {
  const cfg = { ...JIRA, JIRA_BASE_URL: 'https://user:pw@j.x' };
  assert.doesNotMatch(JSON.stringify(redact(cfg)), /pw@/);
  await assert.rejects(jiraTracker(cfg, { fetch: capture() }).get('PR-1'), (e) => /must not contain credentials/.test(e.message) && !/pw/.test(e.message));
});

test('importing tracker.mjs from stdin does not crash the main-module check', () => {
  const r = spawnSync('node', ['--input-type=module', '-'], {
    input: `await import(${JSON.stringify(path.join(ROOT, 'skills/track-it/scripts/tracker.mjs'))}); console.log('ok');`,
    encoding: 'utf8',
  });
  assert.equal(r.stdout.trim(), 'ok', r.stderr);
});

test('parseRef accepts lowercase Jira keys, GitHub Enterprise URLs and .MD paths', () => {
  assert.deepEqual(parseRef('abc-123'), { kind: 'jira', key: 'ABC-123' });
  assert.deepEqual(parseRef('https://jira.x/browse/abc-1'), { kind: 'jira', key: 'ABC-1' });
  assert.deepEqual(parseRef('https://ghe.corp.com/o/r/issues/5'), { kind: 'github', repo: 'o/r', number: 5 });
  assert.deepEqual(parseRef('docs/issues/A.MD'), { kind: 'local', path: 'docs/issues/A.MD' });
});

test('GitHub refs keep their repo, bad output throws, only label errors drop labels', () => {
  const calls = [];
  const run = (args) => {
    calls.push(args);
    if (args[1] === 'view') return JSON.stringify({ number: 3, title: 't', body: '', state: 'OPEN', url: 'u' });
    return '';
  };
  const t = githubTracker(DEFAULTS, { run });
  assert.equal(t.get('https://github.com/other/r/issues/3').ref, 'other/r#3');
  t.comment('other/r#3', 'hi');
  assert.deepEqual(calls.at(-1).slice(0, 5), ['issue', 'comment', '3', '-R', 'other/r']);

  assert.throws(() => githubTracker(DEFAULTS, { run: () => 'no url here' }).create({ title: 't' }), /no issue URL/);

  const auth = githubTracker(DEFAULTS, {
    run: () => {
      throw new Error('HTTP 401: Bad credentials');
    },
  });
  assert.throws(() => auth.create({ title: 't', type: 'bug' }), /401/);

  let n = 0;
  const label = githubTracker(DEFAULTS, {
    run: (args) => {
      if (n++ === 0) throw new Error("could not add label: 'bug' not found");
      return 'https://github.com/o/r/issues/9';
    },
  });
  assert.deepEqual(label.create({ title: 't', type: 'bug' }).labelsDropped, ['bug']);
});

test('wiki: four-space nesting is level 2, inline code with braces stays valid', () => {
  assert.equal(markdownToWiki('- a\n    - b'), '* a\n** b');
  assert.equal(markdownToWiki('use `{x}` here'), 'use {{\\{x\\}}} here');
});
