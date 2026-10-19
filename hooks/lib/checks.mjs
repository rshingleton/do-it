// Mechanical compliance checks, shared by the Claude Code hooks and the
// OpenCode plugin. Judgement-call rules stay in .compliance-rules/*.md for
// prove-it; anything a regex can decide lives here or in checks.json.
//
// .compliance-rules/checks.json:
//   [{ "id": "no-console", "severity": "MEDIUM", "pattern": "console\\.log\\(",
//      "flags": "", "files": [".js", ".ts"], "message": "Use the logger." }]
// severity: HIGH blocks the edit; MEDIUM and LOW are reported to the agent.
// A rule with "filePattern" instead of "pattern" matches the edited path;
// "exceptFilePattern" exempts paths from any rule.
// {"id": "<builtin id>", "disabled": true} turns a built-in rule off.

import fs from 'node:fs';
import path from 'node:path';

export const BUILTIN = [
  {
    id: 'env-file',
    severity: 'HIGH',
    filePattern: '(^|/)\\.env(\\.[^/]*)?$',
    exceptFilePattern: '\\.(example|sample|template|dist)$',
    message: 'Env files hold secrets and stay out of the change. Use a .env.example.',
  },
  { id: 'private-key', severity: 'HIGH', pattern: '-----BEGIN [A-Z ]*PRIVATE KEY-----', message: 'Private key material.' },
  { id: 'aws-access-key', severity: 'HIGH', pattern: '\\b(AKIA|ASIA)[0-9A-Z]{16}\\b', message: 'AWS access key id.' },
  { id: 'github-token', severity: 'HIGH', pattern: '\\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\\b', message: 'GitHub token.' },
  { id: 'slack-token', severity: 'HIGH', pattern: '\\bxox[abprs]-[A-Za-z0-9-]{10,}', message: 'Slack token.' },
  {
    id: 'openai-anthropic-key',
    severity: 'HIGH',
    // Real keys are long random runs with digits and capitals; sk-some-long-identifier is not.
    pattern: '\\bsk-(?:ant-[a-z0-9]+-|proj-)?(?=[A-Za-z0-9_-]{32,})(?=[A-Za-z0-9_-]*[0-9])(?=[A-Za-z0-9_-]*[A-Z])[A-Za-z0-9_-]+',
    message: 'API secret key.',
  },
  { id: 'google-api-key', severity: 'HIGH', pattern: '\\bAIza[0-9A-Za-z_-]{35}\\b', message: 'Google API key.' },
  { id: 'jwt', severity: 'HIGH', pattern: '\\beyJ[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}', message: 'JSON Web Token.' },
  {
    id: 'credential-in-url',
    severity: 'HIGH',
    // The password part excludes $ < { % so interpolated ${DB_PASS} is not a hit.
    pattern: '[a-z][a-z0-9+.-]*://[^/\\s:@]+:[^/\\s:@$<{%]{3,}@',
    flags: 'i',
    message: 'Plaintext credentials in a connection string.',
  },
  {
    id: 'hardcoded-secret',
    severity: 'HIGH',
    pattern: '\\b(password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\\b["\']?\\s*[:=]\\s*["\'][^"\'\\s$<{]{8,}["\']',
    flags: 'i',
    message: 'Hard-coded secret.',
  },
  {
    id: 'credential-placeholder',
    severity: 'MEDIUM',
    pattern: '(TODO|FIXME).{0,20}(insert|add|put|paste).{0,20}(key|token|password|secret)', // do-it: allow (the rule itself)
    flags: 'i',
    message: 'Credential placeholder in a comment.',
  },
];

export function loadChecks(root, complianceDir = '.compliance-rules') {
  const file = path.join(root, complianceDir, 'checks.json');
  let custom = [];
  let error = null;
  try {
    custom = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(custom)) throw new Error('checks.json must be an array');
  } catch (e) {
    if (e.code !== 'ENOENT') error = `${file}: ${e.message}`;
    custom = [];
  }
  const disabled = new Set(custom.filter((c) => c.disabled).map((c) => c.id));
  const rules = [...BUILTIN.filter((r) => !disabled.has(r.id)), ...custom.filter((c) => !c.disabled)];
  return { rules, error };
}

function applies(rule, file) {
  if (!rule.files || !rule.files.length || !file) return true;
  return rule.files.some((ext) => file.endsWith(ext));
}

// Scan text for rule hits. `file` scopes rules with a `files` list.
export function scan(text, rules, file = '') {
  const findings = [];
  const lines = String(text || '').split('\n');
  for (const rule of rules) {
    if (!applies(rule, file)) continue;
    if (rule.exceptFilePattern && file && safeRegex(rule.exceptFilePattern, rule.flags)?.test(file)) continue;
    if (rule.filePattern) {
      if (file && safeRegex(rule.filePattern, rule.flags)?.test(file)) {
        findings.push({ id: rule.id, severity: (rule.severity || 'HIGH').toUpperCase(), line: 0, message: rule.message || rule.id });
      }
      continue;
    }
    if (!text) continue;
    const re = safeRegex(rule.pattern, rule.flags);
    if (!re) continue;
    lines.forEach((line, i) => {
      if (/do-it:\s*allow/.test(line)) return;
      if (re.test(line)) findings.push({ id: rule.id, severity: (rule.severity || 'HIGH').toUpperCase(), line: i + 1, message: rule.message || rule.id });
    });
  }
  return findings;
}

function safeRegex(pattern, flags = '') {
  try {
    return new RegExp(pattern, String(flags).replace(/g/g, ''));
  } catch {
    return null;
  }
}

export function format(findings, file) {
  return findings
    .map((f) => `- [${f.severity}] ${f.id}${file ? ` in ${file}${f.line ? `:${f.line}` : ''}` : ''}: ${f.message}`)
    .join('\n');
}

// The text an edit tool is about to add, from Claude Code or OpenCode tool
// input. Patches contribute only their added lines: removing a secret is fine.
export function addedText(input = {}) {
  const parts = [];
  for (const key of ['content', 'new_string', 'newString', 'new_source']) {
    if (typeof input[key] === 'string') parts.push(input[key]);
  }
  for (const key of ['patch', 'patchText']) {
    if (typeof input[key] !== 'string') continue;
    for (const line of input[key].split(/\r?\n/)) {
      if (line.startsWith('+') && !line.startsWith('+++')) parts.push(line.slice(1));
    }
  }
  for (const e of input.edits || []) {
    if (typeof e.new_string === 'string') parts.push(e.new_string);
    if (typeof e.newString === 'string') parts.push(e.newString);
  }
  return parts.join('\n');
}

// Every path an edit touches: the single-file fields, plus each file a patch
// adds, updates or moves to.
export function editedFiles(input = {}) {
  const files = [input.file_path, input.filePath, input.notebook_path, input.path].filter((f) => typeof f === 'string' && f);
  for (const key of ['patch', 'patchText']) {
    if (typeof input[key] !== 'string') continue;
    for (const m of input[key].matchAll(/^\*\*\* (?:Add File|Update File|Move to): (.+)$/gm)) files.push(m[1].trim());
    for (const m of input[key].matchAll(/^\+\+\+ (?:b\/)?(.+)$/gm)) if (m[1] !== '/dev/null') files.push(m[1].trim());
  }
  return [...new Set(files)];
}

export function editedFile(input = {}) {
  return editedFiles(input)[0] || '';
}
