#!/usr/bin/env node
// Repo checks: skill frontmatter, size budget, skill calls, relative links,
// prose rules. Exits 1 on any error; warnings print but pass.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, listSkills, userInvoked } from './lib/skills.mjs';

const SKILL_LINE_BUDGET = 100;
const SKILL_LINE_LIMIT = 150;

const errors = [];
const warnings = [];
const rel = (p) => path.relative(ROOT, p);

const skills = listSkills();
const names = new Set(skills.map((s) => s.meta.name));
const userOnly = new Set(skills.filter(userInvoked).map((s) => s.meta.name));

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

  // Count lines the way wc -l does: a trailing newline does not start a new line.
  const lines = s.text.replace(/\n$/, '').split('\n').length;
  if (lines > SKILL_LINE_LIMIT) errors.push(`${where}: ${lines} lines (limit ${SKILL_LINE_LIMIT}); move detail to a sibling file`);
  else if (lines > SKILL_LINE_BUDGET) warnings.push(`${where}: ${lines} lines (budget ${SKILL_LINE_BUDGET})`);
}

const docs = [...markdownFiles(path.join(ROOT, 'skills')), path.join(ROOT, 'README.md'), path.join(ROOT, 'AGENTS.md')].filter((f) =>
  fs.existsSync(f),
);

for (const file of docs) {
  const text = fs.readFileSync(file, 'utf8');
  const where = rel(file);

  // Every Skill-tool mention must name its target, or the checks below cannot
  // see it (a generic "call the step with the Skill tool" hid user-only calls).
  // Any case, optional backticks: "the `Skill` tool", "skill tool".
  const mentions = [...text.matchAll(/`?Skill`?\s+tool/gi)].length;
  const named = [...text.matchAll(/`?Skill`?\s+tool\s+with\s+"[^"]+"/gi)].length;
  if (mentions > named) errors.push(`${where}: mentions the Skill tool without naming the skill ("Skill tool with \\"x\\"")`);

  // Calls often wrap across lines ("call the Skill tool with\n  \"x\"").
  for (const m of text.matchAll(/`?Skill`?\s+tool\s+with\s+"([^"]+)"/gi)) {
    const target = m[1];
    if (target.startsWith('<')) continue; // a placeholder in prose about the convention
    if (!names.has(target)) {
      errors.push(`${where}: calls skill "${target}", which this repo does not ship`);
    } else if (userOnly.has(target)) {
      errors.push(
        `${where}: calls user-invoked skill "${target}" through the Skill tool, which the host refuses; follow ../${target}/SKILL.md by path instead`,
      );
    }
  }

  // Prose: no ``` or ~~~ fences, no inline code. Examples live there.
  const prose = text.replace(/^(```|~~~)[\s\S]*?^\1/gm, '').replace(/`[^`\n]*`/g, '');
  const targets = [
    // [t](path), [t](path "title"), [t](<path with spaces>)
    ...[...prose.matchAll(/\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g)].map((m) => m[1]),
    // [ref]: path
    ...[...prose.matchAll(/^\s{0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm)].map((m) => m[1]),
  ];
  for (const raw of targets) {
    const link = raw.replace(/^<|>$/g, '');
    const target = link.split('#')[0];
    if (!target || /^[a-z]+:/.test(target)) continue;
    if (!fs.existsSync(path.resolve(path.dirname(file), target))) errors.push(`${where}: broken link ${link}`);
  }

  if (file.includes(`${path.sep}skills${path.sep}`) && prose.includes('—')) {
    errors.push(`${where}: em-dash; use a colon, comma or parentheses`);
  }
}

for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`error ${e}`);
console.log(`${skills.length} skills, ${docs.length} docs: ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
