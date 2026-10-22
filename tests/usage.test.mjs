import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { sumTranscript, record, prune, readAll, trackUsage, subagentTranscript, importTranscripts } from '../skills/usage-it/scripts/ledger.mjs';
import { handle } from '../hooks/claude.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-usage-'));

const line = (id, out, extra = {}) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-10-21T10:00:00.000Z',
    message: {
      id,
      role: 'assistant',
      model: 'claude-sonnet-5-5',
      usage: { input_tokens: 2, output_tokens: out, cache_read_input_tokens: 100, cache_creation_input_tokens: 10 },
    },
    ...extra,
  });

test('sumTranscript counts a message once however many blocks repeat it', () => {
  const text = [line('m1', 5), line('m1', 50), line('m2', 7), JSON.stringify({ type: 'user' }), 'not json'].join('\n');
  assert.deepEqual(sumTranscript(text), {
    turns: 2,
    in: 4,
    out: 57,
    cr: 200,
    cc: 20,
    model: 'claude-sonnet-5-5',
    first: '2026-10-21T10:00:00.000Z',
    last: '2026-10-21T10:00:00.000Z',
    cwd: null,
  });
});

test('sumTranscript of an empty transcript has no turns', () => {
  assert.equal(sumTranscript('').turns, 0);
});

test('record replaces the line with the same id and keeps the others', () => {
  const dir = tmp();
  const base = { kind: 'subagent', day: '2026-10-21', out: 1 };
  record(dir, { ...base, id: 'a' });
  record(dir, { ...base, id: 'b' });
  record(dir, { ...base, id: 'a', out: 9 });
  const recs = readAll(dir);
  assert.equal(recs.length, 2);
  assert.equal(recs.find((r) => r.id === 'a').out, 9);
});

test('prune rolls old days into daily rows, keeps recent files, and ages out the rollup', () => {
  const dir = tmp();
  const now = new Date('2026-10-21T12:00:00Z');
  const rec = (id, day, out, agent = 'it-scout') => ({ id, kind: 'subagent', agent, model: 'haiku', project: 'p', day, turns: 1, in: 1, out, cr: 10, cc: 5 });
  record(dir, rec('a', '2026-09-01', 5));
  record(dir, rec('b', '2026-09-01', 7));
  record(dir, rec('c', '2026-09-01', 1, 'it-reviewer'));
  record(dir, rec('d', '2026-10-15', 2));
  record(dir, rec('old', '2025-01-01', 9));
  fs.writeFileSync(path.join(dir, 'notes.txt'), '');
  prune(dir, 30, now, 365);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['2026-10-15.jsonl', 'notes.txt', 'rollup.jsonl']);
  const rows = readAll(dir).filter((r) => r.runs).sort((a, b) => a.agent.localeCompare(b.agent));
  assert.deepEqual(
    rows.map((r) => [r.day, r.agent, r.runs, r.out, r.cr]),
    [['2026-09-01', 'it-reviewer', 1, 1, 10], ['2026-09-01', 'it-scout', 2, 12, 20]],
  );
  // a second pass changes nothing: rolling up is idempotent
  prune(dir, 30, now, 365);
  assert.deepEqual(readAll(dir).filter((r) => r.runs).map((r) => r.runs).sort(), [1, 2]);
});

test('trackUsage drops a run whose day is already past the raw window', () => {
  const work = tmp();
  const main = path.join(work, 's.jsonl');
  fs.writeFileSync(main, line('m1', 3, { timestamp: '2026-01-01T00:00:00.000Z' }));
  const dir = path.join(work, 'usage');
  assert.equal(trackUsage('session', { session_id: 's', transcript_path: main }, { dir, days: 30, now: new Date('2026-10-21T12:00:00Z') }), null);
  assert.deepEqual(readAll(dir), []);
});

test('subagentTranscript prefers the hook path, else derives the subagents path', () => {
  assert.equal(subagentTranscript({ agent_transcript_path: '/x/a.jsonl' }), '/x/a.jsonl');
  assert.equal(
    subagentTranscript({ transcript_path: '/p/s1.jsonl', agent_id: 'abc' }),
    '/p/s1/subagents/agent-abc.jsonl',
  );
  assert.equal(subagentTranscript({}), null);
});

test('trackUsage writes a subagent record and a session record, upserting on repeat stops', () => {
  const work = tmp();
  const dir = path.join(work, 'usage');
  const main = path.join(work, 's1.jsonl');
  fs.mkdirSync(path.join(work, 's1', 'subagents'), { recursive: true });
  fs.writeFileSync(main, line('m1', 10));
  fs.writeFileSync(path.join(work, 's1', 'subagents', 'agent-abc.jsonl'), line('x1', 3));
  const opts = { dir, days: 7, now: new Date('2026-10-21T12:00:00Z') };
  const input = { session_id: 's1', transcript_path: main, cwd: '/repo/do-it' };

  trackUsage('subagent', { ...input, agent_id: 'abc', agent_type: 'do-it:it-scout' }, opts);
  trackUsage('session', input, opts);
  fs.appendFileSync(main, `\n${line('m2', 20)}`);
  trackUsage('session', input, opts);

  const recs = readAll(dir);
  assert.equal(recs.length, 2);
  const sub = recs.find((r) => r.kind === 'subagent');
  assert.equal(sub.agent, 'it-scout');
  assert.equal(sub.out, 3);
  assert.equal(sub.project, 'do-it');
  const sess = recs.find((r) => r.kind === 'session');
  assert.equal(sess.agent, 'main');
  assert.equal(sess.out, 30);
  assert.equal(sess.turns, 2);
});

test('the stop hook fails open on a missing transcript', async () => {
  assert.deepEqual(await handle('stop', { session_id: 's', transcript_path: '/nope/x.jsonl' }), { exit: 0 });
  assert.deepEqual(await handle('subagent-stop', {}), { exit: 0 });
});

test('usage.mjs reports by agent and by model from the recorded files', () => {
  const dir = tmp();
  const today = new Date().toISOString().slice(0, 10);
  const base = { kind: 'subagent', day: today, turns: 1, in: 1, cr: 0, cc: 0 };
  record(dir, { ...base, id: 'a', agent: 'it-scout', model: 'haiku', out: 5 });
  record(dir, { ...base, id: 'b', agent: 'it-scout', model: 'haiku', out: 7 });
  record(dir, { ...base, id: 'c', agent: 'main', model: 'sonnet', out: 100 });
  const run = (...a) =>
    JSON.parse(
      execFileSync('node', [path.join(ROOT, 'skills', 'usage-it', 'scripts', 'usage.mjs'), '--json', ...a], {
        env: { ...process.env, DO_IT_USAGE_DIR: dir },
        encoding: 'utf8',
      }),
    );
  const byAgent = run();
  assert.deepEqual(
    byAgent.map((r) => [r.agent, r.runs, r.out]),
    [['main', 1, 100], ['it-scout', 2, 12]],
  );
  assert.equal(run('--by', 'model').length, 2);
  assert.deepEqual(run('--by', 'month').map((r) => [r.month, r.runs]), [[today.slice(0, 7), 3]]);
});

test('--hours keeps only runs that ended inside the window', () => {
  const dir = tmp();
  const now = Date.now();
  const at = (h) => new Date(now - h * 3600000).toISOString();
  const base = { kind: 'subagent', day: at(0).slice(0, 10), turns: 1, in: 1, cr: 0, cc: 0, out: 5, model: 'haiku' };
  record(dir, { ...base, id: 'new', agent: 'it-scout', at: at(1) });
  record(dir, { ...base, id: 'old', agent: 'it-skeptic', at: at(20) });
  const out = execFileSync('node', [path.join(ROOT, 'skills', 'usage-it', 'scripts', 'usage.mjs'), '--json', '--hours', '12'], {
    env: { ...process.env, DO_IT_USAGE_DIR: dir },
    encoding: 'utf8',
  });
  assert.deepEqual(JSON.parse(out).map((r) => r.agent), ['it-scout']);
});

test('importTranscripts backfills sessions and subagents, and is safe to repeat', () => {
  const root = tmp();
  const dir = path.join(tmp(), 'usage');
  const pdir = path.join(root, '-repo-do-it');
  fs.mkdirSync(path.join(pdir, 's9', 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(pdir, 's9.jsonl'), line('m1', 10, { cwd: '/repo/do-it' }));
  fs.writeFileSync(path.join(pdir, 's9', 'subagents', 'agent-zz.jsonl'), line('x1', 4));
  fs.writeFileSync(path.join(pdir, 's9', 'subagents', 'agent-zz.meta.json'), JSON.stringify({ agentType: 'Explore' }));
  const opts = { dir, days: 7 };
  assert.equal(importTranscripts(root, opts), 2);
  assert.equal(importTranscripts(root, opts), 2);
  const recs = readAll(dir);
  assert.equal(recs.length, 2);
  assert.equal(recs.find((r) => r.kind === 'subagent').agent, 'Explore');
  assert.equal(recs.find((r) => r.kind === 'session').project, 'do-it');
});

test('report.mjs writes a self-contained page, escapes ledger strings, and handles an empty ledger', () => {
  const dir = tmp();
  const out = path.join(tmp(), 'r.html');
  const run = (d) =>
    execFileSync('node', [path.join(ROOT, 'skills', 'usage-it', 'scripts', 'report.mjs'), '--days', '30', '--out', out], {
      env: { ...process.env, DO_IT_USAGE_DIR: d },
      encoding: 'utf8',
    });
  assert.equal(run(dir).trim(), out); // empty ledger still renders
  assert.match(fs.readFileSync(out, 'utf8'), /Nothing stands out yet/);

  const today = new Date().toISOString().slice(0, 10);
  const evil = '<script>alert(1)</script>';
  record(dir, { id: 'a', kind: 'session', agent: 'main', model: 'claude-opus-5-5', project: evil, day: today, turns: 2, in: 5, out: 50, cr: 1000, cc: 20 });
  record(dir, { id: 'b', kind: 'subagent', agent: 'general-purpose', model: 'claude-opus-5-5', project: 'p', day: today, turns: 1, in: 1, out: 2, cr: 10, cc: 1 });
  run(dir);
  const html = fs.readFileSync(out, 'utf8');
  assert.ok(!html.includes(evil), 'project name must be escaped');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.match(html, /Main sessions on Opus/);
  assert.match(html, /unpinned agent types \(general-purpose\)/);
  assert.ok(!/https?:\/\//.test(html.replace('http://www.w3.org', '')), 'no network references');
});
