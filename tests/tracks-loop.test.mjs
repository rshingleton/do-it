// Phase 4 of tracks-mode: a run reads `--tracks` and DO_IT_TRACKS, `run tracks` pairs only disjoint
// slices and hands out a brief, the coordinator merges in contract order with the suite once on the
// merged tree, and a failed track parks its slice while the run goes on. At `tracks` 1 nothing here
// applies: no batch, no worktree.

import { tmpDir } from './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DEFAULTS } from '../skills/track-it/scripts/config.mjs';
import { nextSlice, trackWidth } from '../skills/do-it/scripts/run.mjs';
import { runTracks } from '../skills/do-it/scripts/runs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'skills/do-it/scripts/work.mjs');
const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
// A path as a bash check spells it: forward slashes.
const sh = (p) => p.replaceAll('\\', '/');
const posix = (p) => p.split(path.sep).join('/');

function work(dir, ...args) {
  const r = spawnSync('node', [WORK, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: dir } });
  return { status: r.status, out: JSON.parse(r.stdout) };
}
const ok = (r) => {
  assert.equal(r.status, 0, JSON.stringify(r.out));
  return r.out;
};
// One call with DO_IT_TRACKS set in the child's environment, the config's ceiling.
function withTracksEnv(n, dir, ...args) {
  const r = spawnSync('node', [WORK, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: dir, DO_IT_TRACKS: String(n) } });
  return { status: r.status, out: JSON.parse(r.stdout) };
}

function repo() {
  const dir = tmpDir('do-it-tracks-');
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.name', 't');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(dir, 'README.md'), 'one\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  return dir;
}

// A lane S plan for one roadmap slice, started so it holds a base ref. Each plan pins its own
// interface, so only the files decide a collision.
function plan(dir, id, slice, files) {
  ok(work(dir, 'new', id, '--lane', 's', '--title', id));
  ok(work(dir, 'set', id, 'roadmap', JSON.stringify(`docs/roadmap/r.md#${slice}`)));
  ok(work(dir, 'event', id, 'approve'));
  ok(work(dir, 'event', id, 'start'));
  fs.appendFileSync(path.join(dir, `docs/planning/${id}.md`), `\n## Files\n${files.join('\n')}\n\n## Interfaces\n\`${id}.run() -> ok\`\n`);
}

const row = (id, delivers) => `| ${id} | feat | ${delivers} | low | - | ready |`;
const table = (ids) => [
  '# R', '', '### M1', '',
  '| Slice | Kind | Delivers | Risk | Blocked by | Status |',
  '|-------|------|----------|------|------------|--------|',
  ...ids.map(([id, delivers]) => row(id, delivers)),
  '',
];

// R1 and R2 are disjoint; R3 shares src/bus.js with R2; R4 is a second disjoint slice; R5 has no
// plan at all. A run at 3 tracks pairs R1 and R2 and waits on R3 and R5.
function fixture(tracks = 3) {
  const dir = repo();
  fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true });
  const ids = [['R1', 'api'], ['R2', 'bus'], ['R3', 'ui'], ['R4', 'docs'], ['R5', 'later']];
  fs.writeFileSync(path.join(dir, 'docs/roadmap/r.md'), table(ids).join('\n'));
  plan(dir, 'api', 'R1', ['src/api.js']);
  plan(dir, 'bus', 'R2', ['src/bus.js']);
  plan(dir, 'ui', 'R3', ['src/bus.js', 'src/ui.js']);
  plan(dir, 'docs', 'R4', ['docs/site.md']);
  ok(work(dir, 'run', 'new', 'road', '--tracks', String(tracks)));
  for (const [slice, id] of [['R1', 'api'], ['R2', 'bus'], ['R3', 'ui'], ['R4', 'docs']]) {
    ok(work(dir, 'run', 'start', 'road', slice, '--work', id));
  }
  return dir;
}
const tracksOf = (dir) => ok(work(dir, 'run', 'tracks', 'road', 'docs/roadmap/r.md'));

test('tracks: DO_IT_TRACKS is a config default of 3; --tracks defaults to 1 and the ceiling caps it', () => {
  assert.equal(DEFAULTS.DO_IT_TRACKS, '3', 'DO_IT_TRACKS is in the config defaults');
  const dir = repo();
  assert.equal(ok(work(dir, 'run', 'new', 'plain')).tracks, 1, 'a run that does not ask holds one');
  assert.equal(ok(work(dir, 'run', 'new', 'asked', '--tracks', '2')).tracks, 2);
  assert.equal(ok(withTracksEnv(1, dir, 'run', 'new', 'capped', '--tracks', '3')).tracks, 1, 'DO_IT_TRACKS caps the ask');
  assert.equal(ok(withTracksEnv(9, dir, 'run', 'new', 'tall', '--tracks', '9')).tracks, 5, 'the hard ceiling is 5');
  assert.equal(ok(work(dir, 'run', 'set', 'plain', 'tracks', '3')).tracks, 3);
  const bad = work(dir, 'run', 'set', 'plain', 'tracks', '0');
  assert.equal(bad.status, 1);
  assert.match(bad.out.error, /positive whole number/);
});

test('width: min(ready slices, tracks), and a run at 1 starts no track', () => {
  assert.equal(trackWidth({ ready: 5, tracks: 5 }), 5);
  assert.equal(trackWidth({ ready: 2, tracks: 5 }), 2, 'two ready slices start two, never five');
  assert.equal(trackWidth({ ready: 4, tracks: 5 }), 4, 'four ready slices under five tracks start four');
  assert.equal(trackWidth({ ready: 4, tracks: 5, resource: 2 }), 4, 'no machine cap narrows the width: no caller produces one');
  assert.equal(trackWidth({ ready: 4, tracks: 1 }), 0, 'at 1 the run builds in place: no track');
  assert.equal(trackWidth({ ready: 9, tracks: 9 }), 5, 'never above the hard ceiling of 5');
  assert.equal(trackWidth({ ready: 0, tracks: 3 }), 0, 'nothing ready, nothing to start');
  assert.throws(() => trackWidth({ ready: 2, tracks: 0 }), /positive whole number/);
});

test('run contract prints a plan path once, against the repo root, from a subdirectory too', () => {
  const dir = fixture(2);
  const plans = (out) => Object.fromEntries(out.slices.filter((s) => s.plan).map((s) => [s.id, s.plan]));
  const atRoot = ok(work(dir, 'run', 'contract', 'road', 'docs/roadmap/r.md'));
  const below = ok(work(path.join(dir, 'docs'), 'run', 'contract', 'road', 'roadmap/r.md'));
  assert.deepEqual(plans(atRoot), {
    R1: 'docs/planning/api.md',
    R2: 'docs/planning/bus.md',
    R3: 'docs/planning/ui.md',
    R4: 'docs/planning/docs.md',
  });
  assert.deepEqual(plans(below), plans(atRoot), 'the same plan path from any directory');
});

test('run next --batch: every free in-flight slice leads the batch, and one id without it', () => {
  const road = {
    slices: [
      { id: 'R1', blocked_by: [], state: 'in flight' },
      { id: 'R2', blocked_by: [], state: 'in flight' },
      { id: 'R3', blocked_by: [], state: 'in flight' },
      { id: 'R4', blocked_by: [], state: 'ready' },
    ],
    ready: ['R4'],
  };
  const rec = { max_slices: null, slices: [] };
  assert.deepEqual(nextSlice(road, rec, { batch: 3 }).next, ['R1', 'R2', 'R3'], 'three scoped slices are three tracks, not one');
  assert.equal(nextSlice(road, rec).next, 'R1', 'without a batch one slice resumes, as before');
});

test('run tracks: the paired slices only, each with its worktree, plan, base ref and report shape', () => {
  const dir = fixture(3);
  const out = tracksOf(dir);
  assert.equal(out.width, 3);
  assert.deepEqual(out.tracks.map((t) => t.id), ['R1', 'R2', 'R4'], 'R3 shares src/bus.js with R2, and R5 has no contract');
  assert.deepEqual(out.waiting.map((w) => [w.id, w.reason]), [['R3', 'SHARED_FILE'], ['R5', 'NO_CONTRACT']]);
  assert.match(out.waiting[0].detail, /src\/bus\.js/, 'the colliding path is named');
  assert.match(out.waiting[1].detail, /R5 has no ## Files/, 'the missing section is named');
  const first = out.tracks[0];
  assert.equal(posix(first.plan), 'docs/planning/api.md');
  assert.match(posix(first.worktree), /\.do-it\/road\/R1$/);
  assert.equal(first.branch, 'do-it/road--R1');
  assert.equal(first.base, ok(work(dir, 'show', 'api')).base_ref, "the base ref is the slice's own");
  for (const want of ['worktree', posix(first.worktree), posix(first.plan), first.base, 'done | failed | blocked', 'commit id', '150 words']) {
    assert.ok(first.brief.includes(want), `the brief names ${want}`);
  }
  assert.equal(fs.existsSync(first.worktree), false, 'the coordinator creates the worktree, never this call');
});

test('a track brief sends the build, never the audit: the coordinator proves the slice', () => {
  const dir = fixture(2);
  const brief = tracksOf(dir).tracks[0].brief;
  assert.match(brief, /the coordinator audits this slice/, 'the brief names the coordinator as the auditor');
  assert.doesNotMatch(brief, /prove-it/, 'the track is not told to run prove-it');
  assert.match(brief, /Run no audit/, 'the brief says so outright');
  assert.match(brief, /sends back any Must/, 'a Must comes back to the same track');
});

test('run tracks at 1: no track, no batch, no worktree, so a run that does not ask is unchanged', () => {
  const dir = fixture(1);
  const out = tracksOf(dir);
  assert.deepEqual([out.width, out.tracks, out.waiting], [0, [], []]);
  assert.match(out.note, /builds one slice at a time in place/);
  assert.equal(fs.existsSync(path.join(path.dirname(dir), `${path.basename(dir)}.do-it`)), false, 'no worktree root is created');
});

test('run tracks: --tracks 5 with two ready slices starts two; the width leaves the rest waiting', () => {
  const two = repo();
  fs.mkdirSync(path.join(two, 'docs/roadmap'), { recursive: true });
  fs.writeFileSync(path.join(two, 'docs/roadmap/r.md'), table([['R1', 'api'], ['R2', 'bus']]).join('\n'));
  plan(two, 'api', 'R1', ['src/api.js']);
  plan(two, 'bus', 'R2', ['src/bus.js']);
  ok(work(two, 'run', 'new', 'road', '--tracks', '5'));
  for (const [slice, id] of [['R1', 'api'], ['R2', 'bus']]) ok(work(two, 'run', 'start', 'road', slice, '--work', id));
  assert.deepEqual(tracksOf(two).tracks.map((t) => t.id), ['R1', 'R2'], 'two ready slices start two');

  const one = repo();
  fs.mkdirSync(path.join(one, 'docs/roadmap'), { recursive: true });
  fs.writeFileSync(path.join(one, 'docs/roadmap/r.md'), table([['R1', 'api']]).join('\n'));
  plan(one, 'api', 'R1', ['src/api.js']);
  ok(work(one, 'run', 'new', 'road', '--tracks', '5'));
  ok(work(one, 'run', 'start', 'road', 'R1', '--work', 'api'));
  const single = tracksOf(one);
  assert.equal(single.tracks.length, 1, 'one ready slice starts one track, with no phase fan-out inside it');

  const wide = fixture(2);
  const capped = tracksOf(wide);
  assert.equal(capped.width, 2);
  assert.deepEqual(capped.tracks.map((t) => t.id), ['R1', 'R2'], 'the width caps the pair');
  assert.equal(capped.waiting.find((w) => w.id === 'R4')?.reason, 'WIDTH', 'a disjoint slice past the width waits for the next round');
});

test('a sixth free slice is named in waiting instead of vanishing past the ceiling', () => {
  const dir = repo();
  fs.mkdirSync(path.join(dir, 'docs/roadmap'), { recursive: true });
  const ids = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'].map((id) => [id, id.toLowerCase()]);
  fs.writeFileSync(path.join(dir, 'docs/roadmap/r.md'), table(ids).join('\n'));
  for (const [slice, id] of ids) plan(dir, id, slice, [`src/${id}.js`]);
  ok(withTracksEnv(5, dir, 'run', 'new', 'road', '--tracks', '5'));
  for (const [slice, id] of ids) ok(work(dir, 'run', 'start', 'road', slice, '--work', id));
  const out = tracksOf(dir);
  assert.equal(out.ready, 6, 'the free count is every free slice, not the ceiling');
  assert.equal(out.tracks.length, 5);
  assert.deepEqual(out.waiting.map((w) => [w.id, w.reason]), [['R6', 'WIDTH']], 'the sixth waits for the next round');
});

// runTracks reads each track's plan through its own `items.get` after runContract has read the same
// plans, so a path that fails in both hides the dispatcher's policy. The fake items stand in for the
// gate alone: a plan that is gone is a gap the dispatch reports, any other read error must throw.
test('run tracks itself reports a missing plan and throws any other read error', () => {
  const dir = repo();
  const planningDir = path.join(dir, 'docs/planning');
  const road = {
    slices: [{ id: 'R1', blocked_by: [], state: 'ready', plan: 'held', files: ['src/a.js'] }],
    ready: ['R1'],
    blocking: [],
  };
  const held = { path: path.join(planningDir, 'held.md'), state: { lane: 's', base_ref: 'base-1' }, body: '\n## Files\nsrc/a.js\n\n## Interfaces\n`a.run() -> ok`\n' };
  // The contract reads `held`; the track reads the gate's work id, which the fake answers for.
  const fakes = (id, error) => ({
    get: (want) => {
      if (want !== id) return held;
      throw error;
    },
  });

  ok(work(dir, 'run', 'new', 'broken', '--tracks', '2'));
  ok(work(dir, 'run', 'start', 'broken', 'R1', '--work', 'boom'));
  const unreadable = new Error('boom: no state block (YAML frontmatter)');
  assert.throws(() => runTracks({ planningDir, root: dir, slug: 'broken', road, items: fakes('boom', unreadable) }), /no state block/, 'a real read error is raised, as run contract raises it');

  ok(work(dir, 'run', 'new', 'gone', '--tracks', '2'));
  ok(work(dir, 'run', 'start', 'gone', 'R1', '--work', 'missing'));
  const out = runTracks({ planningDir, root: dir, slug: 'gone', road, items: fakes('missing', new Error('no plan for missing under docs/planning')) });
  assert.deepEqual(out.tracks.map((t) => [t.id, t.base]), [['R1', ok(work(dir, 'run', 'show', 'gone')).base]], 'a missing plan is a gap: that track starts on the record base');
});

test('a track brief names its plan\'s lane: a lane S plan is not called lane M', () => {
  const s = fixture(2);
  const brief = tracksOf(s).tracks[0].brief;
  assert.match(brief, /a lane S plan/, 'the lane S brief says lane S');
  assert.doesNotMatch(brief, /phase files beside it/, 'a lane S plan has no phase files beside it');

  // A lane M plan, whose files sit beside it, keeps that line.
  const m = repo();
  fs.mkdirSync(path.join(m, 'docs/roadmap'), { recursive: true });
  fs.writeFileSync(path.join(m, 'docs/roadmap/r.md'), table([['R1', 'api']]).join('\n'));
  ok(work(m, 'new', 'api', '--lane', 'm', '--title', 'api'));
  ok(work(m, 'set', 'api', 'roadmap', JSON.stringify('docs/roadmap/r.md#R1')));
  ok(work(m, 'event', 'api', 'approve'));
  ok(work(m, 'event', 'api', 'start'));
  fs.appendFileSync(path.join(m, 'docs/planning/api/README.md'), '\n## Files\nsrc/api.js\n\n## Interfaces\n`api.run() -> ok`\n');
  ok(work(m, 'run', 'new', 'road', '--tracks', '2'));
  ok(work(m, 'run', 'start', 'road', 'R1', '--work', 'api'));
  assert.match(tracksOf(m).tracks[0].brief, /a lane M plan: its phase files beside it/);
});

test('run tracks returns nextSlice\'s stop: a spent max_slices is a stop, not an empty frontier', () => {
  const dir = fixture(3);
  ok(work(dir, 'run', 'set', 'road', 'max_slices', '1'));
  ok(work(dir, 'run', 'slice', 'road', 'R1', 'shipped'));
  const out = tracksOf(dir);
  assert.deepEqual(out.tracks, []);
  assert.equal(out.stop?.reason, 'MAX_SLICES', 'the cap is named, not read as no next slice');
  assert.match(out.stop.detail, /1 shipped, cap 1/);
});

test('a failed track parks its slice with its reason and the run goes on with the others', () => {
  const dir = fixture(3);
  ok(work(dir, 'run', 'slice', 'road', 'R1', 'parked', '--needs', 'user', '--reason', 'npm test exits 1 on src/api.js'));
  const out = tracksOf(dir);
  assert.deepEqual(out.tracks.map((t) => t.id), ['R2', 'R4'], 'the other tracks still start');
  assert.deepEqual(ok(work(dir, 'run', 'next', 'road', 'docs/roadmap/r.md')).parked, ['R1']);
  const parked = ok(work(dir, 'run', 'show', 'road')).slices.find((s) => s.id === 'R1');
  assert.deepEqual([parked.status, parked.needs], ['parked', 'user']);
  assert.match(parked.reason, /npm test exits 1/);
  assert.match(fs.readFileSync(path.join(ROOT, 'skills/finish-it/TRACKS.md'), 'utf8'), /park its slice with the reason the report or the Must gives/);
});

test('a merged track: the suite runs once on the merged tree, the merged fingerprint is recorded, then ship', () => {
  const dir = fixture(2);
  const wt = path.join(path.dirname(dir), `${path.basename(dir)}-track-R1`);
  git(dir, 'worktree', 'add', '-q', wt, '-b', 'do-it/road--R1');
  fs.mkdirSync(path.join(wt, 'src'), { recursive: true });
  fs.writeFileSync(path.join(wt, 'src', 'api.js'), 'export const ok = 1;\n');
  git(wt, 'add', '-A');
  git(wt, 'commit', '-qm', 'road R1 (track)');
  ok(work(dir, 'run', 'verify', 'road', 'R1', '--in', wt, '--', 'true'));
  git(dir, 'merge', '-q', '--no-ff', '-m', 'road R1 (track)', 'do-it/road--R1');
  const count = path.join(dir, 'merged-runs.txt');
  const merged = ok(work(dir, 'run', 'verify', 'road', 'R1', '--merged', '.', '--', `echo x >> ${sh(count)}`));
  const g = merged.gates.find((x) => x.id === 'R1');
  assert.ok(g.merged_fingerprint, 'the merged tree has a fingerprint of its own');
  assert.equal(fs.readFileSync(count, 'utf8').trim().split('\n').length, 1, 'the suite ran once on the merged tree');
  assert.deepEqual(ok(work(dir, 'run', 'gate', 'road', 'R1')).allow, true, 'the gate allows the ship');
  ok(work(dir, 'run', 'slice', 'road', 'R1', 'shipped'));
  assert.equal(fs.readFileSync(count, 'utf8').trim().split('\n').length, 1, 'the ship runs no second suite');
});

// The loop is text an agent follows, so its rules are pinned where they are written.
const section = (doc, title) => doc.slice(doc.indexOf(`## ${title}`)).split(/\n## /)[0];
const at = (doc, re) => {
  const m = re.exec(doc);
  assert.ok(m, `${re} is missing from TRACKS.md`);
  return m.index;
};

test('the track text: dispatch, merge in contract order, the merged suite, one scoped reviewer, a park', () => {
  const skill = fs.readFileSync(path.join(ROOT, 'skills/finish-it/SKILL.md'), 'utf8');
  const doc = fs.readFileSync(path.join(ROOT, 'skills/finish-it/TRACKS.md'), 'utf8');
  assert.match(skill, /\[--tracks N\]/, 'the argument hint takes the flag');
  assert.match(skill, /run new <slug> --tracks N/);
  assert.match(skill, /TRACKS\.md/, 'the loop points at the track text');
  assert.match(skill, /work\.mjs run next <slug> <file>/, 'step 1 stays the one-slice call');
  // At 1 nothing changes: no batch call, no worktree.
  const opening = doc.split('\n\n')[1];
  assert.match(opening, /At 1 nothing\s+here applies/);
  assert.match(opening, /run next <slug> <file>`\s+with no `--batch`/);
  assert.match(opening, /no\s+worktree is created/);
  // Dispatch takes the flag's width, then pairs.
  assert.match(section(doc, 'Dispatch'), /run tracks <slug> <file>/);
  assert.match(section(doc, 'Dispatch'), /--batch <tracks>/);
  assert.match(section(doc, 'Dispatch'), /start one `it-builder` agent on\s+the mid-tier model/);
  assert.match(section(doc, 'Dispatch'), /report under 150 words/);
  // A track never fans its own phases out, and the run at 1 gets the fan-out back.
  const width = section(doc, 'Width');
  assert.match(width, /phases one at a time/);
  assert.match(width, /PARALLEL\.md/);
  assert.match(width, /comes back for a run at `tracks` 1/);
  // Merge: contract order, --no-ff, the suite once on the merged tree, one scoped reviewer, then ship.
  const merge = section(doc, 'Merge, in contract order');
  assert.match(merge, /merge order `run contract` prints/);
  assert.match(merge, /one at a time/);
  const order = [
    /run\s+verify <slug> <slice> --in <worktree>/,
    /git merge --no-ff/,
    /run verify <slug> <slice> --merged \./,
    /start one\s+`it-reviewer` agent on the mid-tier model/,
    /work\.mjs run gate <slug> <slice>/,
    /run slice <slug> <slice>\s+shipped/,
  ].map((re) => at(doc, re));
  assert.deepEqual(order, [...order].sort((x, y) => x - y), 'record the track, merge, the merged suite, the reviewer, the gate, then shipped');
  assert.match(merge, /records `merged_fingerprint`/);
  assert.match(merge, /git diff <base>\.\.HEAD/);
  assert.match(merge, /git worktree remove <worktree>/);
  // A conflict goes to merge-it with the plan path, as build-it's PARALLEL.md does.
  assert.match(merge, /Skill`? tool with "merge-it"/);
  assert.match(merge, /passing the slice's plan path/);
  // A failed track parks its slice and the run goes on.
  const failed = section(doc, 'A failed track');
  assert.match(failed, /park its slice with the reason the report or the Must gives/);
  assert.match(failed, /go on with the tracks still running/);
  assert.match(failed, /`git merge --abort`/);
  // The record stays the coordinator's.
  assert.match(section(doc, 'The record'), /never writes the run record/);
});
