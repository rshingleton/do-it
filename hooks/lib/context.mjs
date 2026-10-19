// The standing context do-it injects at session start and into subagents:
// the it-core posture plus pointers to this repo's own standards.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDocs, isOn } from '../../skills/track-it/scripts/config.mjs';
import { codeMap } from './codemap.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CORE_FILE = path.resolve(HERE, '../../skills/it-core/SKILL.md');

const STANDARD_FILES = [
  'AGENTS.md',
  'CONTRIBUTING.md',
  'CODING_STANDARDS.md',
  'STANDARDS.md',
  'STYLE.md',
  'SECURITY_POLICY.md',
  'docs/SECURITY_POLICY.md',
];

const DOC_LABELS = {
  glossary: 'Glossary',
  changelog: 'Changelog',
  adrDir: 'ADRs',
  referenceDir: 'Reference docs',
};

// One line per project doc, so skills that name the defaults (GLOSSARY.md,
// CHANGELOG.md, docs/adr/, docs/reference/) land on this repo's real files.
export function docsLines(docs) {
  return Object.entries(DOC_LABELS).map(([name, label]) => {
    const d = docs[name];
    if (!d.path) return `- ${label}: none; skip steps that write one, do not create it.`;
    return d.exists ? `- ${label}: \`${d.path}\`` : `- ${label}: \`${d.path}\` (not created yet; create it only when a step writes to it)`;
  });
}

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
        `Compliance rules: ${rules.map((f) => `\`${f}\``).join(', ')}. Mechanical ones (\`checks.json\`) are enforced by hooks on every edit; the rest are checked by prove-it.`,
      );
    }
  }
  lines.push(
    '',
    '## This repo\'s project docs',
    '',
    'Skills name the default paths; in this repo use these instead:',
    '',
    ...docsLines(resolveDocs(root, cfg)),
  );
  if (cfg.DO_IT_LINT_CMD) lines.push('', `After each edit a hook runs \`${cfg.DO_IT_LINT_CMD}\`; fix what it reports before moving on.`);
  if (isOn(cfg.DO_IT_MAP ?? 'on')) {
    const map = codeMap(root, cfg);
    if (map) lines.push('', '## Code map', '', 'Check here for existing code before writing new code.', '', map);
  }
  return lines.join('\n').trim();
}
