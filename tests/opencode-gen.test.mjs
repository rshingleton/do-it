// OpenCode files generated from agents/ and skills/: agents, command/ and commands/.

import './env.mjs'; // first: isolates the developer's environment
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { agentFor, expected, expectedAgents, targets } from '../scripts/gen-opencode.mjs';
import { parseFrontmatter } from '../scripts/lib/skills.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const agent = (meta, body = 'Body.\n') => ({
  name: meta.name,
  meta,
  body,
});

test('a read-only agent gets a deny-first permission map and no model', () => {
  const out = agentFor(agent({ name: 'it-scout', description: 'Scouts.', model: 'haiku', tools: 'Read, Grep, Glob, Bash' }));
  const { meta, body } = parseFrontmatter(out);
  assert.equal(meta.mode, 'subagent');
  assert.equal(meta.model, undefined);
  assert.equal(meta.tools, undefined);
  assert.match(out, /^permission:\n {2}"\*": deny\n {2}read: allow\n {2}grep: allow\n {2}glob: allow\n {2}list: allow\n {2}bash: allow\n/m);
  assert.doesNotMatch(out, /edit: allow/);
  assert.match(out, /<!-- Generated .* tier: haiku/);
  assert.match(body, /Body\./);
});

test('an agent that lists a write tool is granted edit, and a plan-less tool list is not widened', () => {
  const writer = agentFor(agent({ name: 'it-planner', description: 'Plans.', model: 'opus', tools: 'Read, Write, Edit' }));
  assert.match(writer, /edit: allow/);
  assert.doesNotMatch(writer, /bash: allow/);
});

test('an agent with no tools: line keeps the host default and says why', () => {
  const out = agentFor(agent({ name: 'it-builder', description: 'Builds.', model: 'sonnet' }));
  assert.doesNotMatch(out, /^permission:/m);
  assert.match(out, /tools: all \(source lists none\)/);
});

test('the description is quoted so a colon cannot break the frontmatter', () => {
  const out = agentFor(agent({ name: 'it-x', description: 'Use: only when named.', model: 'haiku', tools: 'Read' }));
  assert.equal(parseFrontmatter(out).meta.description, 'Use: only when named.');
});

test('every generated agent is on disk and carries the source body', () => {
  const want = expectedAgents();
  assert.deepEqual(Object.keys(want).sort(), fs.readdirSync(path.join(ROOT, 'agents')).filter((f) => f.endsWith('.md')).sort());
  for (const [file, text] of Object.entries(want)) {
    assert.equal(fs.readFileSync(path.join(ROOT, '.opencode', 'agents', file), 'utf8'), text);
  }
});

test('commands go to command/ for OpenCode 1 and commands/ for 2, with the same files', () => {
  const t = Object.fromEntries(targets().map((x) => [path.basename(x.dir), x.files]));
  assert.deepEqual(Object.keys(t).sort(), ['agents', 'command', 'commands']);
  assert.deepEqual(t.command, expected());
  assert.deepEqual(t.commands, expected());
});

test('gen --check reports a missing agents directory file as stale', () => {
  const r = spawnSync('node', ['scripts/gen-opencode.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('the subagent rules tell OpenCode to background parallel and background-marked agents', () => {
  const text = fs.readFileSync(path.join(ROOT, 'skills/skill-it/SKILL-MECHANICS.md'), 'utf8');
  assert.match(text, /`subagent`: pass `background: true`/);
});
