// Read the skills directory: one entry per skills/<name>/SKILL.md.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SKILLS_DIR = path.join(ROOT, 'skills');

// Top-level `key: value` pairs of a SKILL.md header, covering the YAML scalar
// forms a header uses: plain (with indented continuation lines), single and
// double quoted (possibly spanning lines), and > / | block scalars with
// chomping and indentation indicators. Trailing newlines are dropped.
export function parseFrontmatter(raw) {
  const text = raw.replace(/\r\n?/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  const lines = m[1].split('\n');
  const isKey = (l) => /^[A-Za-z_][\w-]*:(\s|$)/.test(l);

  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const first = kv[2];
    // Lines that belong to this value: indented or blank, up to the next key.
    const rest = [];
    while (i + 1 < lines.length && !isKey(lines[i + 1])) rest.push(lines[++i]);

    let value;
    if (/^[>|][+-]?\d?\s*$/.test(first)) {
      value = blockScalar(first.trim()[0], rest);
    } else if (first.startsWith('"')) {
      value = doubleQuoted([first, ...rest.map((l) => l.trim())].join(' ').trim());
    } else if (first.startsWith("'")) {
      value = [first, ...rest.map((l) => l.trim())].join(' ').trim().replace(/^'|'$/g, '').replaceAll("''", "'");
    } else {
      value = [first, ...rest.map((l) => l.trim())].filter(Boolean).join(' ').trim();
    }
    meta[kv[1]] = value;
  }
  return { meta, body: text.slice(m[0].length) };
}

function blockScalar(style, rest) {
  const indent = Math.min(...rest.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length), Infinity);
  const body = rest.map((l) => (l.trim() ? l.slice(indent === Infinity ? 0 : indent) : ''));
  if (style === '|') return body.join('\n').replace(/\n+$/, '');
  // Folded: lines join with spaces; a blank line becomes a newline.
  const paragraphs = body.join('\n').replace(/\n+$/, '').split(/\n\s*\n/);
  return paragraphs.map((p) => p.split('\n').join(' ')).join('\n');
}

function doubleQuoted(s) {
  const inner = s.replace(/^"/, '').replace(/"\s*$/, '');
  const simple = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', 0: '\0', ' ': ' ' };
  return inner.replace(/\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|.)/g, (_, e) => {
    if (/^[xuU]/.test(e)) return String.fromCodePoint(parseInt(e.slice(1), 16));
    return e in simple ? simple[e] : e;
  });
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

export const AGENTS_DIR = path.join(ROOT, 'agents');

// One entry per agents/<name>.md: the role definitions skills hand work to.
export function listAgents() {
  if (!fs.existsSync(AGENTS_DIR)) return [];
  return fs
    .readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const file = path.join(AGENTS_DIR, f);
      const text = fs.readFileSync(file, 'utf8');
      return { name: f.replace(/\.md$/, ''), file, text, ...parseFrontmatter(text) };
    });
}

export function userInvoked(skill) {
  return String(skill.meta['disable-model-invocation']) === 'true';
}
