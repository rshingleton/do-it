// The standing context do-it injects at session start and into subagents:
// the core posture plus pointers to this repo's own standards.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CORE_FILE = path.resolve(HERE, '../../skills/core/SKILL.md');

const STANDARD_FILES = [
  'AGENTS.md',
  'CONTRIBUTING.md',
  'CODING_STANDARDS.md',
  'STANDARDS.md',
  'STYLE.md',
  'SECURITY_POLICY.md',
  'docs/SECURITY_POLICY.md',
  'GLOSSARY.md',
];

export function coreText(file = CORE_FILE) {
  try {
    return fs.readFileSync(file, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').trim();
  } catch {
    return '';
  }
}

export function standardsPointers(root, complianceDir = '.compliance-rules') {
  const found = STANDARD_FILES.filter((f) => fs.existsSync(path.join(root, f)));
  let rules = [];
  try {
    rules = fs
      .readdirSync(path.join(root, complianceDir))
      .filter((f) => /\.(md|ya?ml|json)$/.test(f))
      .map((f) => `${complianceDir}/${f}`);
  } catch {
    rules = [];
  }
  return { found, rules };
}

export function sessionContext(root, cfg) {
  const { found, rules } = standardsPointers(root, cfg.DO_IT_COMPLIANCE_DIR);
  const lines = [coreText()];
  if (found.length || rules.length) {
    lines.push('', '## This repo\'s standards', '');
    if (found.length) lines.push(`Read before editing code they govern: ${found.map((f) => `\`${f}\``).join(', ')}.`);
    if (rules.length) {
      lines.push(
        `Compliance rules: ${rules.map((f) => `\`${f}\``).join(', ')}. Mechanical ones (\`checks.json\`) are enforced by hooks on every edit; the rest are checked by audit-it.`,
      );
    }
  }
  if (cfg.DO_IT_LINT_CMD) lines.push('', `After each edit a hook runs \`${cfg.DO_IT_LINT_CMD}\`; fix what it reports before moving on.`);
  return lines.join('\n').trim();
}
