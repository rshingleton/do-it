#!/usr/bin/env node
// Routing eval: does each model-invoked skill's description pull in the
// prompts it should, and leave the ones another skill owns? Lexical TF-IDF,
// so it is deterministic and runs in CI. Data: evals/routing.json.
//
// Usage: eval-routing.mjs [--verbose]

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, listSkills, userInvoked } from './lib/skills.mjs';
import { evaluate } from './lib/routing.mjs';

const verbose = process.argv.includes('--verbose');
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals', 'routing.json'), 'utf8'));
const skills = listSkills()
  .filter((s) => !userInvoked(s))
  .map((s) => ({ name: s.meta.name, description: s.meta.description || '' }));

const r = evaluate(skills, spec);

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('skill', 14)} ${pad('positives first', 16)} negatives ok`);
for (const row of r.rows) {
  const flag = row.first < row.positives || row.negOk < row.negatives ? '  <' : '';
  console.log(`${pad(row.name, 14)} ${pad(`${row.first}/${row.positives}`, 16)} ${row.negOk}/${row.negatives}${flag}`);
}

const shown = verbose ? r.confusions : r.confusions.slice(0, 5);
if (shown.length) {
  console.log('\nWorst confusions:');
  for (const c of shown) {
    if (c.kind === 'positive') console.log(`- [${c.skill}] "${c.prompt}" -> ${c.winner} (ours ranked ${c.rank})`);
    else console.log(`- [${c.skill}] negative "${c.prompt}" beat its owner ${c.owner}`);
  }
}

console.log('\nClosest descriptions:');
for (const s of r.topSimilar) console.log(`- ${s.a} / ${s.b}: ${s.score.toFixed(2)}`);

for (const w of r.warnings) console.log(`warn  ${w}`);
for (const f of r.failures) console.log(`error ${f}`);
console.log(`\nrouting: ${(r.rate * 100).toFixed(1)}% positives ranked first (need ${(r.threshold * 100).toFixed(0)}%), ${r.failures.length} errors`);
process.exit(r.ok ? 0 : 1);
