// Sizes of what do-it adds to every session, so the part this repo controls can
// be set beside the median start context the ledger recorded. Characters, and
// tokens estimated as chars / 4.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILLS = path.resolve(HERE, '../..');
export const tokens = (chars) => Math.round(chars / 4);

const read = (f) => {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    return null;
  }
};

// Skills the model can start by itself list their description every turn; typed
// ones (disable-model-invocation) cost nothing until used.
export function descriptionSizes(skillsDir = SKILLS) {
  let names = [];
  try {
    names = fs.readdirSync(skillsDir);
  } catch {}
  const rows = [];
  for (const name of names.sort()) {
    const text = read(path.join(skillsDir, name, 'SKILL.md'));
    if (!text || /^disable-model-invocation:\s*true/m.test(text)) continue;
    const d = /^description:\s*(.*)$/m.exec(text)?.[1];
    if (d) rows.push({ name, chars: d.length });
  }
  return rows;
}

// root: the project whose CLAUDE.md and AGENTS.md count. The session-start block
// comes from the hooks when they sit beside this skill; an install that links
// only skills/ reports it as unmeasured.
export async function baselineSizes(root, { skillsDir = SKILLS } = {}) {
  const out = [];
  try {
    const { decide } = await import('../../../hooks/lib/decide.mjs');
    const text = decide('session', { cwd: root }).context;
    if (text) out.push({ label: 'session-start block (hooks: posture, project docs, code map)', chars: text.length });
  } catch {
    out.push({ label: 'session-start block (hooks not found beside the skills)', chars: null });
  }
  const own = ['CLAUDE.md', 'AGENTS.md'].map((f) => read(path.join(root, f))).filter((t) => t !== null);
  out.push({ label: 'project CLAUDE.md and AGENTS.md', chars: own.reduce((n, t) => n + t.length, 0) });
  const d = descriptionSizes(skillsDir);
  out.push({ label: `descriptions of ${d.length} invocable skill(s)`, chars: d.reduce((n, r) => n + r.chars, 0) });
  return out;
}

export const MCP_NOTE =
  'The start context also holds the host prompt, tool and MCP server definitions and your own CLAUDE.md files; those depend on the connected MCP servers and are not measured here. Compare the median start context with and without servers to see them.';
