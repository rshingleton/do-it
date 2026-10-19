// Read the skills directory: one entry per skills/<name>/SKILL.md.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SKILLS_DIR = path.join(ROOT, 'skills');

export function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  const lines = m[1].split('\n');
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2];
    if (value === '>' || value === '|' || value === '>-' || value === '|-') {
      const block = [];
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) block.push(lines[++i].trim());
      value = block.join(value.startsWith('>') ? ' ' : '\n');
    } else if (/^".*"$/.test(value)) {
      value = JSON.parse(value);
    } else if (/^'.*'$/.test(value)) {
      value = value.slice(1, -1);
    }
    meta[kv[1]] = value;
  }
  return { meta, body: text.slice(m[0].length) };
}

export function listSkills() {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, d.name, 'SKILL.md')))
    .map((d) => {
      const file = path.join(SKILLS_DIR, d.name, 'SKILL.md');
      const text = fs.readFileSync(file, 'utf8');
      return { dir: d.name, file, text, ...parseFrontmatter(text) };
    });
}

export function userInvoked(skill) {
  return String(skill.meta['disable-model-invocation']) === 'true';
}
