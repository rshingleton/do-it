#!/usr/bin/env node
// Repo checks: skill frontmatter, size budget, skill calls, relative links,
// prose rules. Exits 1 on any error; warnings print but pass.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, listSkills } from './lib/skills.mjs';

const SKILL_LINE_BUDGET = 100;
const SKILL_LINE_LIMIT = 150;

const errors = [];
const warnings = [];
const rel = (p) => path.relative(ROOT, p);

const skills = listSkills();
const names = new Set(skills.map((s) => s.meta.name));

function markdownFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(p));
    else if (entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

for (const s of skills) {
  const where = rel(s.file);
  if (!s.meta.name) errors.push(`${where}: missing name`);
  else if (s.meta.name !== s.dir) errors.push(`${where}: name "${s.meta.name}" does not match directory "${s.dir}"`);
  if (!s.meta.description) errors.push(`${where}: missing description`);
  else if (s.meta.description.length > 1024) errors.push(`${where}: description over 1024 characters`);

  const lines = s.text.split('\n').length;
  if (lines > SKILL_LINE_LIMIT) errors.push(`${where}: ${lines} lines (limit ${SKILL_LINE_LIMIT}); move detail to a sibling file`);
  else if (lines > SKILL_LINE_BUDGET) warnings.push(`${where}: ${lines} lines (budget ${SKILL_LINE_BUDGET})`);
}

const docs = [...markdownFiles(path.join(ROOT, 'skills')), path.join(ROOT, 'README.md'), path.join(ROOT, 'AGENTS.md')].filter((f) =>
  fs.existsSync(f),
);

for (const file of docs) {
  const text = fs.readFileSync(file, 'utf8');
  const where = rel(file);

  for (const m of text.matchAll(/Skill tool with "([^"]+)"/g)) {
    const target = m[1];
    if (!names.has(target) && target !== 'resolving-merge-conflicts') {
      errors.push(`${where}: calls skill "${target}", which this repo does not ship`);
    }
  }

  const prose = text.replace(/```[\s\S]*?```/g, '');
  for (const m of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = m[1].split('#')[0];
    if (!target || /^[a-z]+:/.test(target)) continue;
    if (!fs.existsSync(path.resolve(path.dirname(file), target))) errors.push(`${where}: broken link ${m[1]}`);
  }

  if (file.includes(`${path.sep}skills${path.sep}`) && prose.includes('—')) {
    errors.push(`${where}: em-dash; use a colon, comma or parentheses`);
  }
}

for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`error ${e}`);
console.log(`${skills.length} skills, ${docs.length} docs: ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
