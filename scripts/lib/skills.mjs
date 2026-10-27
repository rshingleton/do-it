// Read the skills directory: one entry per skills/<name>/SKILL.md.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitFrontmatter, parseFlat } from '../../skills/track-it/scripts/frontmatter.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SKILLS_DIR = path.join(ROOT, 'skills');

// The `key: value` pairs of a SKILL.md or agent header, with the body after it,
// line endings normalized to LF; no header gives empty meta.
export function parseFrontmatter(raw) {
  const text = raw.replace(/\r\n?/g, '\n');
  const parts = splitFrontmatter(text);
  return parts ? { meta: parseFlat(parts.yaml).meta, body: parts.body } : { meta: {}, body: text };
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

export const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];

// `tools: Read, Grep` or a YAML list, as the tool names; [] when none are listed.
export const agentTools = (agent) => String(agent.meta.tools ?? '').split(/[\s,\[\]-]+/).filter(Boolean);

// Lists tools and none of them writes.
export const readsOnly = (agent) => {
  const tools = agentTools(agent);
  return tools.length > 0 && !tools.some((t) => WRITE_TOOLS.includes(t));
};

export function userInvoked(skill) {
  return String(skill.meta['disable-model-invocation']) === 'true';
}
