import './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { sumTranscript, record, prune, readAll, trackUsage, subagentTranscript, importTranscripts, clearLimit, localDay, localized, projectWeek, readSnapshots, readUtilization, autoSnapshot, refreshUtilization } from '../skills/usage-it/scripts/ledger.mjs';
import { baselineSizes, descriptionSizes } from '../skills/usage-it/scripts/baseline.mjs';
import { contextOutliers } from '../skills/usage-it/scripts/outliers.mjs';
import { handle } from '../hooks/claude.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-usage-'));
// Keep these tests off the real ~/.claude.json: its cached /usage numbers would leak into the temp ledgers.
process.env.CLAUDE_CONFIG_DIR = tmp();
process.env.DO_IT_USAGE_REFRESH = '0'; // never start a real claude from a test

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
    ctx0: 112,
    peak: 112,
  });
});

test('sumTranscript reports first-turn and peak context, each message once', () => {
  const big = (id, cr) =>
    JSON.stringify({ type: 'assistant', message: { id, role: 'assistant', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: cr, cache_creation_input_tokens: 4 } } });
  const s = sumTranscript([big('a', 100), big('a', 100), big('b', 900), big('c', 300)].join('\n'));
  assert.equal(s.ctx0, 105);
  assert.equal(s.peak, 905);
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
  assert.match(html, /No per-session rows/); // no session ids recorded yet
  record(dir, { id: 'c', kind: 'session', session: 'c'.repeat(12), agent: 'main', model: 'claude-opus-5-5', project: 'big', day: today, turns: 9, in: 1, out: 1, cr: 9000, cc: 0 });
  record(dir, { id: 'd', kind: 'subagent', session: 'c'.repeat(12), agent: 'Explore', model: 'claude-haiku-5-5', project: 'big', day: today, turns: 1, in: 1, out: 1, cr: 10, cc: 0 });
  run(dir);
  assert.match(fs.readFileSync(out, 'utf8'), /Top sessions<\/h2><table>.*<code>cccccccc<\/code><\/td><td>big<\/td><td>[\d-]+<\/td><td class="n">2<\/td>/s);
  assert.match(html, /Main sessions on Opus/);
  assert.match(html, /unpinned agent types \(general-purpose\)/);
  assert.ok(!/https?:\/\//.test(html.replace('http://www.w3.org', '')), 'no network references');
});

test('trackUsage returns prevPeak from the earlier stop without storing it, and old rows still read', () => {
  const work = tmp();
  const dir = path.join(work, 'usage');
  const main = path.join(work, 's2.jsonl');
  fs.writeFileSync(main, line('m1', 10));
  const opts = { dir, days: 7, now: new Date('2026-10-21T12:00:00Z') };
  const input = { session_id: 's2', transcript_path: main };
  record(dir, { id: 'old', kind: 'session', agent: 'main', day: '2026-10-21', out: 1 });

  const first = trackUsage('session', input, opts);
  assert.equal(first.prevPeak, null);
  assert.equal(first.peak, 112);
  fs.appendFileSync(main, `\n${JSON.stringify({ type: 'assistant', message: { id: 'm2', role: 'assistant', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 500, cache_creation_input_tokens: 0 } } })}`);
  const second = trackUsage('session', input, opts);
  assert.equal(second.prevPeak, 112);
  assert.equal(second.peak, 501);

  const rows = readAll(dir);
  assert.equal('prevPeak' in rows.find((r) => r.id === 's2'), false);
  assert.equal(rows.find((r) => r.id === 'old').peak, undefined);
});

test('contextOutliers flags peaks above twice the median and skips rows without a peak', () => {
  const s = (id, peak, ctx0 = 50) => ({ id, kind: 'session', session: id, peak, ctx0 });
  const o = contextOutliers([s('a', 100), s('b', 110), s('c', 120), s('d', 130), s('e', 900), { id: 'old', kind: 'session' }, { id: 'sub', kind: 'subagent', peak: 5000 }]);
  assert.equal(o.sessions, 5);
  assert.equal(o.medianPeak, 120);
  assert.equal(o.medianStart, 50);
  assert.equal(o.flagged, 1);
  assert.equal(o.top[0].id, 'e');
  assert.equal(o.top[0].flagged, true);
  assert.equal(o.top[1].flagged, false);
  assert.equal(contextOutliers([]).sessions, 0);
});

test('report.mjs lists context outliers and says so when no session has a peak', () => {
  const dir = tmp();
  const out = path.join(tmp(), 'r.html');
  const run = () => execFileSync('node', [path.join(ROOT, 'skills', 'usage-it', 'scripts', 'report.mjs'), '--days', '30', '--out', out], { env: { ...process.env, DO_IT_USAGE_DIR: dir }, encoding: 'utf8' });
  const today = new Date().toISOString().slice(0, 10);
  const base = { kind: 'session', agent: 'main', model: 'claude-sonnet-5-5', project: 'p', day: today, turns: 3, in: 1, out: 1, cr: 10, cc: 1 };
  record(dir, { ...base, id: 'x', session: 'x'.repeat(12) });
  run();
  assert.match(fs.readFileSync(out, 'utf8'), /Context outliers<\/h2><p class="muted">No session/);
  for (const [id, peak] of [['a', 100], ['b', 110], ['c', 120], ['z', 900]]) record(dir, { ...base, id, session: id.repeat(12), ctx0: 50, peak });
  run();
  const html = fs.readFileSync(out, 'utf8');
  assert.match(html, /Context outliers<\/h2>.*<code>zzzzzzzz<\/code>.*over 2x median/s);
  assert.match(html, /1 of 4 session\(s\) peaked above 2x/);
});

test('report.mjs counts a session row as main whatever its agent, and rollup keeps the kind', () => {
  const dir = tmp();
  const out = path.join(tmp(), 'r.html');
  const today = new Date().toISOString().slice(0, 10);
  const row = { model: 'claude-sonnet-5-5', project: 'p', day: today, turns: 3, in: 1, out: 1, cr: 10, cc: 1 };
  record(dir, { ...row, id: 'o', kind: 'session', agent: 'build', session: 'o'.repeat(12) });
  record(dir, { ...row, id: 's', kind: 'subagent', agent: 'it-scout', session: 'o'.repeat(12) });
  execFileSync('node', [path.join(ROOT, 'skills', 'usage-it', 'scripts', 'report.mjs'), '--days', '30', '--out', out], { env: { ...process.env, DO_IT_USAGE_DIR: dir }, encoding: 'utf8' });
  assert.match(fs.readFileSync(out, 'utf8'), /1 main, 1 subagent/);
  const old = tmp();
  record(old, { ...row, id: 'o', kind: 'session', agent: 'build', day: '2026-09-01' });
  record(old, { ...row, id: 'm', kind: 'session', agent: 'main', day: '2026-09-01' });
  prune(old, 30, new Date('2026-10-21T12:00:00Z'), 365);
  const rolled = readAll(old).filter((r) => r.runs);
  assert.deepEqual(rolled.map((r) => [r.agent, r.kind]).sort(), [['build', 'session'], ['main', 'session']]);
});

test('clearLimit reads DO_IT_CLEAR_AT, with 0 meaning off and junk falling back', () => {
  assert.equal(clearLimit({}), 300000);
  assert.equal(clearLimit({ DO_IT_CLEAR_AT: '150000' }), 150000);
  assert.equal(clearLimit({ DO_IT_CLEAR_AT: '0' }), 0);
  assert.equal(clearLimit({ DO_IT_CLEAR_AT: 'lots' }), 300000);
  assert.equal(clearLimit({ DO_IT_CLEAR_AT: '' }), 300000);
});

test('the stop hook tells the user once when the context first passes the limit, never for subagents', async () => {
  const work = tmp();
  const main = path.join(work, 's3.jsonl');
  const turn = (id, cr) => JSON.stringify({ type: 'assistant', message: { id, role: 'assistant', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: cr, cache_creation_input_tokens: 0 } } });
  const input = { session_id: 's3', transcript_path: main, cwd: '/repo/p' };
  const saved = { dir: process.env.DO_IT_USAGE_DIR, at: process.env.DO_IT_CLEAR_AT };
  process.env.DO_IT_USAGE_DIR = path.join(work, 'usage');
  process.env.DO_IT_CLEAR_AT = '1000';
  try {
    fs.writeFileSync(main, turn('a', 200));
    assert.deepEqual(await handle('stop', input), { exit: 0 }); // below the limit
    fs.appendFileSync(main, `\n${turn('b', 2000)}`);
    const crossed = await handle('stop', input);
    assert.match(crossed.stdout.systemMessage, /reached 2k tokens.*\/clear/);
    assert.equal(crossed.exit, 0);
    fs.appendFileSync(main, `\n${turn('c', 3000)}`);
    assert.deepEqual(await handle('stop', input), { exit: 0 }); // already told
    const sub = path.join(work, 's3', 'subagents');
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, 'agent-q.jsonl'), turn('q', 9000));
    assert.deepEqual(await handle('subagent-stop', { ...input, agent_id: 'q', agent_type: 'Explore' }), { exit: 0 });
    process.env.DO_IT_CLEAR_AT = '0';
    fs.writeFileSync(path.join(work, 's4.jsonl'), turn('z', 9000));
    assert.deepEqual(await handle('stop', { session_id: 's4', transcript_path: path.join(work, 's4.jsonl') }), { exit: 0 }); // off
  } finally {
    for (const [k, v] of [['DO_IT_USAGE_DIR', saved.dir], ['DO_IT_CLEAR_AT', saved.at]]) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
});

test('usage.mjs --from/--to keeps runs that ended inside the window, bounds inclusive', () => {
  const dir = tmp();
  const base = { kind: 'subagent', day: '2026-10-21', turns: 1, in: 1, cr: 0, cc: 0, out: 5, model: 'haiku' };
  record(dir, { ...base, id: 'a', agent: 'before', at: '2026-10-21T08:59:59Z' });
  record(dir, { ...base, id: 'b', agent: 'start', at: '2026-10-21T09:00:00Z' });
  record(dir, { ...base, id: 'c', agent: 'end', at: '2026-10-21T10:00:00Z' });
  record(dir, { ...base, id: 'd', agent: 'after', at: '2026-10-21T10:00:01Z' });
  const run = (...a) => execFileSync('node', [path.join(ROOT, 'skills', 'usage-it', 'scripts', 'usage.mjs'), '--json', '--days', '90', ...a], { env: { ...process.env, DO_IT_USAGE_DIR: dir }, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(run('--from', '2026-10-21T09:00:00Z', '--to', '2026-10-21T10:00:00Z')).map((r) => r.agent).sort(), ['end', 'start']);
  assert.equal(JSON.parse(run('--from', '2026-10-21T09:30:00Z')).length, 2);
  assert.throws(() => run('--from', 'yesterday'), /ISO timestamps/);
  // The ledger's own timestamps carry milliseconds: a bound written without them must still be inclusive.
  record(dir, { ...base, id: 'e', agent: 'ms-start', at: '2026-10-21T09:00:00.000Z' });
  record(dir, { ...base, id: 'f', agent: 'ms-end', at: '2026-10-21T10:00:00.000Z' });
  assert.deepEqual(JSON.parse(run('--from', '2026-10-21T09:00:00Z', '--to', '2026-10-21T10:00:00Z')).map((r) => r.agent).sort(), ['end', 'ms-end', 'ms-start', 'start']);
});

test('baselineSizes measures the invocable descriptions and tolerates a missing project', async () => {
  const skills = tmp();
  const mk = (name, body) => {
    fs.mkdirSync(path.join(skills, name));
    fs.writeFileSync(path.join(skills, name, 'SKILL.md'), body);
  };
  mk('auto', '---\nname: auto\ndescription: Does a thing.\n---\n');
  mk('typed', '---\nname: typed\ndescription: Hidden.\ndisable-model-invocation: true\n---\n');
  assert.deepEqual(descriptionSizes(skills), [{ name: 'auto', chars: 'Does a thing.'.length }]);
  const rows = await baselineSizes(tmp(), { skillsDir: skills });
  assert.equal(rows.at(-1).chars, 'Does a thing.'.length);
  assert.equal(rows.find((r) => /CLAUDE/.test(r.label)).chars, 0);
  const out = execFileSync('node', [path.join(ROOT, 'skills', 'usage-it', 'scripts', 'usage.mjs'), '--baseline'], { env: { ...process.env, DO_IT_USAGE_DIR: tmp() }, encoding: 'utf8', cwd: ROOT });
  assert.match(out, /session-start block.*~[\d,]+\)/);
  assert.match(out, /No session has a recorded start context/);
});

test('days are local calendar days: a run that starts at 9:30pm New York time belongs to that day, not the next UTC day', () => {
  const dir = tmp();
  record(dir, { id: 'late', kind: 'session', agent: 'main', model: 'm', project: 'p', day: '2026-10-22', start: '2026-10-22T01:30:00.000Z', at: '2026-10-22T02:10:00.000Z', turns: 1, in: 1, out: 1, cr: 1, cc: 1 });
  const run = (tz) => JSON.parse(execFileSync('node', [path.join(ROOT, 'skills', 'usage-it', 'scripts', 'usage.mjs'), '--json', '--days', '365', '--by', 'day'], { env: { ...process.env, DO_IT_USAGE_DIR: dir, TZ: tz }, encoding: 'utf8' })).map((r) => r.day);
  assert.deepEqual(run('America/New_York'), ['2026-10-21']);
  assert.deepEqual(run('UTC'), ['2026-10-22']);
  assert.equal(localized({ id: 'old', day: '2026-10-22', at: '2026-10-22T01:30:00.000Z' }).day, localDay('2026-10-22T01:30:00.000Z'));
  assert.equal(localized({ day: '2026-09-01', runs: 3 }).day, '2026-09-01'); // rollup rows keep their stored day
});

test('projectWeek turns readings of the plan meter into an exhaustion date', () => {
  const resetsAt = '2026-10-28T06:59:00.000Z'; // week starts 2026-10-21T06:59Z at 0%
  assert.equal(projectWeek([]), null);
  const one = projectWeek([{ at: '2026-10-22T06:59:00Z', weekPct: 20, resetsAt }]); // 20% after exactly one day
  assert.equal(one.average.perDay, 20);
  assert.equal(one.average.exhaustsAt, '2026-10-26T06:59:00.000Z'); // 80% more at 20%/day = 4 days
  assert.equal(one.average.beforeReset, true);
  assert.equal(one.recent, null);
  const two = projectWeek([{ at: '2026-10-22T06:59:00Z', weekPct: 20, resetsAt }, { at: '2026-10-23T06:59:00Z', weekPct: 24, resetsAt }, { at: '2026-10-20T00:00:00Z', weekPct: 90, resetsAt: '2026-10-21T06:59:00.000Z' }]);
  assert.equal(two.readings, 2); // the earlier week's reading is left out
  assert.equal(Math.round(two.recent.perDay), 4);
  assert.equal(two.recent.beforeReset, false); // 76% more at 4%/day runs past the reset
  assert.equal(projectWeek([{ at: '2026-10-22T06:59:00Z', weekPct: 0, resetsAt }]).average, null);
});

test('--snapshot records a reading outside the usage rows and prints the pace; the report shows it', () => {
  const dir = tmp();
  const run = (script, ...a) => execFileSync('node', [path.join(ROOT, 'skills', 'usage-it', 'scripts', script), ...a], { env: { ...process.env, DO_IT_USAGE_DIR: dir }, encoding: 'utf8' });
  record(dir, { id: 'r1', kind: 'session', agent: 'main', model: 'claude-opus-5-5', project: 'p', day: '2026-10-22', at: '2026-10-22T01:00:00.000Z', turns: 1, in: 1, out: 7, cr: 100, cc: 5 });
  const out = run('usage.mjs', '--snapshot', '--week', '15', '--session', '18', '--resets', '2026-10-28T02:59:00-04:00', '--at', '2026-10-22T01:50:00Z');
  assert.match(out, /recorded 15% of the week/);
  assert.match(out, /average pace since the reset: .*before the reset/);
  const [s] = readSnapshots(dir);
  assert.equal(s.weekPct, 15);
  assert.equal(s.sessionPct, 18);
  assert.deepEqual(s.tokens.opus, { runs: 1, in: 1, out: 7, cr: 100, cc: 5 });
  assert.equal(readAll(dir).length, 1, 'a reading is not a usage row');
  assert.match(run('report.mjs', '--days', '30', '--out', path.join(dir, 'r.html')), /r\.html/);
  assert.match(fs.readFileSync(path.join(dir, 'r.html'), 'utf8'), /Plan meter<\/h2>.*Latest reading 15%/s);
  assert.throws(() => run('usage.mjs', '--snapshot', '--week', '150', '--resets', '2026-10-28T02:59:00-04:00'), /usage: usage.mjs --snapshot/);
});

// A Claude Code global-state file holding its cached /usage reading.
const utilFile = (dir, { fetched = '2026-10-22T02:00:00.000Z', week = 15, five = 20, resets = '2026-10-28T07:00:00.487663+00:00' } = {}) => {
  fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ cachedUsageUtilization: { fetchedAtMs: Date.parse(fetched), utilization: { five_hour: { utilization: five, resets_at: '2026-10-22T03:10:00+00:00' }, seven_day: { utilization: week, resets_at: resets } } } }));
  return path.join(dir, '.claude.json');
};

test('readUtilization reads Claude Code\'s cached /usage numbers and tolerates anything else', () => {
  const cfg = tmp();
  assert.deepEqual(readUtilization(utilFile(cfg)), { fetchedAt: '2026-10-22T02:00:00.000Z', weekPct: 15, resetsAt: '2026-10-28T07:00:00.487Z', sessionPct: 20 });
  assert.equal(readUtilization(path.join(cfg, 'missing.json')), null);
  fs.writeFileSync(path.join(cfg, 'odd.json'), '{"cachedUsageUtilization":{"fetchedAtMs":1,"utilization":{"seven_day":null}}}');
  assert.equal(readUtilization(path.join(cfg, 'odd.json')), null);
  fs.writeFileSync(path.join(cfg, 'bad.json'), 'not json');
  assert.equal(readUtilization(path.join(cfg, 'bad.json')), null);
});

test('autoSnapshot records a new reading once, again when it moves or an hour passes, with the host tokens', () => {
  const dir = tmp();
  const cfg = tmp();
  record(dir, { id: 'r', kind: 'session', agent: 'main', model: 'claude-sonnet-5-5', project: 'p', day: '2026-10-22', at: '2026-10-22T01:00:00.000Z', turns: 1, in: 1, out: 2, cr: 3, cc: 4 });
  const take = (o) => autoSnapshot(dir, { util: readUtilization(utilFile(cfg, o)) });
  const first = take();
  assert.equal(first.auto, true);
  assert.deepEqual(first.tokens.sonnet, { runs: 1, in: 1, out: 2, cr: 3, cc: 4 });
  assert.equal(take(), null, 'the same fetch is not recorded twice');
  assert.equal(take({ fetched: '2026-10-22T02:10:00.000Z' }), null, 'unchanged numbers minutes later are noise');
  assert.equal(take({ fetched: '2026-10-22T02:20:00.000Z', week: 16 }).weekPct, 16);
  assert.ok(take({ fetched: '2026-10-22T03:30:00.000Z', week: 16 }), 'unchanged numbers an hour later are kept');
  assert.equal(readSnapshots(dir).length, 3);
  assert.equal(autoSnapshot(dir, { util: null }), null);
});

test('the stop hook and the report take Claude Code\'s cached reading, and the report charts the week', async () => {
  const work = tmp();
  const cfg = tmp();
  const dir = path.join(work, 'usage');
  const main = path.join(work, 's9.jsonl');
  fs.writeFileSync(main, line('m1', 10));
  const env = { ...process.env, DO_IT_USAGE_DIR: dir, CLAUDE_CONFIG_DIR: cfg, TZ: 'America/New_York' }; // report days are local; the two readings share one only here
  const saved = { dir: process.env.DO_IT_USAGE_DIR, cfg: process.env.CLAUDE_CONFIG_DIR };
  Object.assign(process.env, { DO_IT_USAGE_DIR: dir, CLAUDE_CONFIG_DIR: cfg });
  try {
    utilFile(cfg, { fetched: '2026-10-21T20:00:00.000Z', week: 5 });
    await handle('stop', { session_id: 's9', transcript_path: main, cwd: '/repo/p' });
    assert.equal(readSnapshots(dir).length, 1);
    utilFile(cfg, { fetched: '2026-10-22T02:00:00.000Z', week: 15 });
  } finally {
    for (const [k, v] of [['DO_IT_USAGE_DIR', saved.dir], ['CLAUDE_CONFIG_DIR', saved.cfg]]) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
  const out = path.join(work, 'r.html');
  execFileSync('node', [path.join(ROOT, 'skills', 'usage-it', 'scripts', 'report.mjs'), '--days', '90', '--out', out], { env, encoding: 'utf8' });
  const html = fs.readFileSync(out, 'utf8');
  assert.equal(readSnapshots(dir).length, 2, 'building the report took the newer reading');
  assert.match(html, /Plan meter<\/h2>.*Latest reading 15% \(2 reading/s);
  assert.match(html, /<polyline[^>]*stroke-dasharray/); // the projection
  assert.match(html, /<td class="n">15%<\/td><td class="n">\+15<\/td>/); // both readings fall on one local day: it ended at 15%, adding 15
  assert.match(execFileSync('node', [path.join(ROOT, 'skills', 'usage-it', 'scripts', 'usage.mjs'), '--snapshot'], { env, encoding: 'utf8' }), /no new reading/);
});

test('refreshUtilization runs `claude -p /usage` only when the cached reading is stale, and can be turned off', () => {
  const bin = tmp();
  const marker = path.join(bin, 'ran');
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\necho "$@" >> ${marker}\n`, { mode: 0o755 });
  const cfg = tmp();
  const base = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, CLAUDE_CONFIG_DIR: cfg };
  const env = { ...base, DO_IT_USAGE_REFRESH: '1' };
  const now = Date.parse('2026-10-22T02:00:00Z');

  utilFile(cfg, { fetched: '2026-10-22T01:58:00.000Z' }); // two minutes old
  assert.equal(refreshUtilization({ env, now }), false);
  assert.equal(fs.existsSync(marker), false);

  utilFile(cfg, { fetched: '2026-10-22T01:00:00.000Z' }); // an hour old
  assert.equal(refreshUtilization({ env: { ...base, DO_IT_USAGE_REFRESH: '0' }, now }), false, 'off switch');
  assert.equal(fs.existsSync(marker), false);
  assert.equal(refreshUtilization({ env, now }), true);
  assert.equal(fs.readFileSync(marker, 'utf8').trim(), '-p /usage');

  fs.rmSync(path.join(cfg, '.claude.json'));
  assert.equal(refreshUtilization({ env: { ...env, PATH: '/nonexistent' }, now }), false, 'no claude binary fails open');
});

test('a short import look-back does not roll older raw days up, and a rebuilt day is not counted twice', () => {
  const work = tmp();
  const dir = path.join(work, 'usage');
  const root = path.join(work, 'projects');
  const proj = path.join(root, 'p');
  fs.mkdirSync(proj, { recursive: true });
  const now = new Date('2026-10-21T12:00:00Z');
  const day = (n) => new Date(now.getTime() - n * 86400000).toISOString();
  const turn = (id, ts) => JSON.stringify({ type: 'assistant', timestamp: ts, message: { id, role: 'assistant', model: 'm', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 1, cache_creation_input_tokens: 1 } } });
  record(dir, { id: 'old', kind: 'session', agent: 'main', model: 'm', project: 'p', day: day(10).slice(0, 10), at: day(10), turns: 1, in: 1, out: 1, cr: 1, cc: 1 });
  fs.writeFileSync(path.join(proj, 'recent.jsonl'), turn('r', day(0)));
  fs.utimesSync(path.join(proj, 'recent.jsonl'), now, now);
  assert.equal(importTranscripts(root, { dir, days: 2, keep: 30, now }), 1);
  assert.ok(fs.existsSync(path.join(dir, `${day(10).slice(0, 10)}.jsonl`)), 'the 10-day-old raw file stays');
  assert.equal(fs.existsSync(path.join(dir, 'rollup.jsonl')), false);

  // A day rolled up earlier and then rebuilt: the raw file wins over its rollup rows.
  fs.writeFileSync(path.join(dir, 'rollup.jsonl'), `${JSON.stringify({ day: day(10).slice(0, 10), agent: 'main', model: 'm', project: 'p', runs: 1, turns: 1, in: 1, out: 1, cr: 1, cc: 1 })}\n${JSON.stringify({ day: '2026-09-01', agent: 'main', model: 'm', project: 'p', runs: 2, turns: 1, in: 1, out: 1, cr: 1, cc: 1 })}\n`);
  const rows = readAll(dir);
  assert.equal(rows.filter((r) => r.day === day(10).slice(0, 10)).length, 1);
  assert.equal(rows.filter((r) => r.day === '2026-09-01').length, 1, 'a rolled-up day with no raw file is kept');
});
