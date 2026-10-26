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

const WORK_ITEM = '---\nid: w\ntitle: W\nstatus: building\nphases:\n  - n: 1\n    status: done\naudit:\n  verdict: null\n---\n\n# Plan\n';

function seedFile(root, rel, text) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

test('a work-item file passed as a ref is refused and left unchanged', () => {
  const root = tmpRepo();
  const file = seedFile(root, 'docs/planning/w.md', WORK_ITEM);
  const t = localTracker(DEFAULTS, { root });
  for (const call of [() => t.comment('docs/planning/w.md', 'x'), () => t.start('docs/planning/w.md'), () => t.close('docs/planning/w.md')]) {
    assert.throws(call, /outside the issues dir/);
    assert.equal(fs.readFileSync(file, 'utf8'), WORK_ITEM);
  }
});

test('get refuses a ref outside the issues dir and a non-.md file inside it', () => {
  const root = tmpRepo();
  const outside = seedFile(root, 'x.md', '---\ntitle: X\n---\n');
  seedFile(root, 'docs/issues/notes.txt', 'hi');
  const t = localTracker(DEFAULTS, { root });
  assert.throws(() => t.get('../x.md'), /outside the issues dir/);
  assert.throws(() => t.get('x.md'), /outside the issues dir/);
  assert.throws(() => t.get(outside), /outside the issues dir/);
  assert.throws(() => t.get('docs/issues/notes.txt'), /outside the issues dir/);
});

test('a rewrite that would drop frontmatter lines is refused', () => {
  const root = tmpRepo();
  const nested = '---\ntitle: N\nstatus: open\nlabels:\n  - a\n---\n\nBody\n';
  const file = seedFile(root, 'docs/issues/n.md', nested);
  const t = localTracker(DEFAULTS, { root });
  for (const call of [() => t.comment('docs/issues/n.md', 'x'), () => t.start('docs/issues/n.md')]) {
    assert.throws(call, /docs\/issues\/n\.md.*  - a/);
    assert.equal(fs.readFileSync(file, 'utf8'), nested);
  }
  const bare = seedFile(root, 'docs/issues/bare.md', 'Just text\n');
  assert.throws(() => t.comment('docs/issues/bare.md', 'x'), /no frontmatter/);
  assert.equal(fs.readFileSync(bare, 'utf8'), 'Just text\n');
});

test('two creates of one title keep both files, and a dotted name is not mistaken for a climb', () => {
  const root = tmpRepo();
  const t = localTracker(DEFAULTS, { root });
  assert.deepEqual([t.create({ title: 'Same' }).ref, t.create({ title: 'Same' }).ref], ['docs/issues/same.md', 'docs/issues/same-2.md']);
  seedFile(root, 'docs/issues/..notes.md', '---\ntitle: D\n---\n');
  assert.equal(t.get('docs/issues/..notes.md').title, 'D');
});

test('create never overwrites an existing slug file, and leaves no temp file after a rewrite', () => {
  const root = tmpRepo();
  const same = seedFile(root, 'docs/issues/same.md', 'keep me\n');
  const t = localTracker(DEFAULTS, { root });
  assert.equal(t.create({ title: 'Same' }).ref, 'docs/issues/same-2.md');
  assert.equal(t.create({ title: 'Same' }).ref, 'docs/issues/same-3.md');
  assert.equal(fs.readFileSync(same, 'utf8'), 'keep me\n');
  t.comment('docs/issues/same-2.md', 'note');
  assert.deepEqual(fs.readdirSync(path.join(root, 'docs/issues')).filter((f) => !f.endsWith('.md')), []);
});

test('parseRef keeps a GitHub Enterprise host and drops github.com', () => {
  assert.deepEqual(parseRef('https://github.com/o/r/issues/7'), { kind: 'github', repo: 'o/r', number: 7 });
  assert.deepEqual(parseRef('https://WWW.GitHub.com/o/r/issues/7'), { kind: 'github', repo: 'o/r', number: 7 });
  assert.deepEqual(parseRef('https://ghe.example:8443/o/r/issues/7'), { kind: 'github', repo: 'ghe.example:8443/o/r', number: 7 });
  assert.deepEqual(parseRef('ghe.example/o/r#4'), { kind: 'github', repo: 'ghe.example/o/r', number: 4 });
  assert.deepEqual(parseRef('o/r#4'), { kind: 'github', repo: 'o/r', number: 4 });
  assert.equal(parseRef('docs/issues/x.md#3'), null);
});

test('GitHub calls for a GHE ref pass -R host/owner/repo and refs keep the host', () => {
  const calls = [];
  const run = (args) => {
    calls.push(args);
    if (args[1] === 'view') return JSON.stringify({ number: 5, title: 't', body: '', state: 'OPEN', url: 'https://ghe.example/o/r/issues/5' });
    if (args[1] === 'create') return 'https://ghe.example/o/r/issues/6\n';
    return '';
  };
  const t = githubTracker(DEFAULTS, { run });
  assert.equal(t.get('https://ghe.example/o/r/issues/5').ref, 'ghe.example/o/r#5');
  assert.deepEqual(calls.at(-1).slice(0, 5), ['issue', 'view', '5', '-R', 'ghe.example/o/r']);
  t.comment('ghe.example/o/r#5', 'hi');
  assert.deepEqual(calls.at(-1).slice(0, 5), ['issue', 'comment', '5', '-R', 'ghe.example/o/r']);
  t.close('https://ghe.example/o/r/issues/5');
  assert.deepEqual(calls.at(-1).slice(0, 5), ['issue', 'close', '5', '-R', 'ghe.example/o/r']);
  assert.equal(t.create({ title: 'T' }).ref, 'ghe.example/o/r#6');
});

test('GitHub publish that fails partway returns the refs it made', () => {
  let n = 0;
  const run = (args) => {
    if (++n === 2) throw new Error('HTTP 502');
    return `https://github.com/o/r/issues/${n}\n`;
  };
  const r = githubTracker({ ...DEFAULTS, DO_IT_GITHUB_REPO: 'o/r' }, { run }).publish({
    title: 'Plan',
    phases: [{ n: 1, title: 'A' }, { n: 2, title: 'B' }],
  });
  assert.deepEqual(r, { parent: null, phases: { 1: 'o/r#1' }, error: 'HTTP 502' });
});

test('CLI: a publish that fails partway prints the refs made and exits 1', () => {
  const root = tmpRepo();
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-gh-'));
  const gh = path.join(bin, 'gh');
  fs.writeFileSync(gh, `#!/bin/sh\nc="${bin}/count"\nn=$(cat "$c" 2>/dev/null || echo 0)\nn=$((n+1))\necho $n > "$c"\n[ "$n" = 2 ] && { echo boom >&2; exit 1; }\necho "https://github.com/o/r/issues/$n"\n`, { mode: 0o755 });
  const spec = path.join(bin, 'spec.json');
  fs.writeFileSync(spec, JSON.stringify({ title: 'Plan', phases: [{ n: 1, title: 'A' }, { n: 2, title: 'B' }] }));
  const r = spawnSync('node', [path.join(ROOT, 'skills/track-it/scripts/tracker.mjs'), 'publish', '--tracker', 'github', '--spec', spec], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, DO_IT_GITHUB_REPO: 'o/r', DO_IT_HOOKS: 'off' },
  });
  assert.equal(r.status, 1, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.phases, { 1: 'o/r#1' });
  assert.equal(out.parent, null);
  assert.match(out.error, /boom|Command failed/);
});

test('a hand-written double-quoted issue title decodes its escapes and rewrites as plain JSON quoting', () => {
  const root = tmpRepo();
  seedFile(root, 'docs/issues/q.md', '---\ntitle: "Tab\\there \\u00e9"\nstatus: open\n---\n\nBody\n');
  const t = localTracker(DEFAULTS, { root });
  assert.equal(t.get('docs/issues/q.md').title, 'Tab\there \u00e9');
  t.start('docs/issues/q.md');
  assert.equal(t.get('docs/issues/q.md').title, 'Tab\there \u00e9');
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
  assert.deepEqual(parseRef('https://ghe.corp.com/o/r/issues/5'), { kind: 'github', repo: 'ghe.corp.com/o/r', number: 5 });
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
