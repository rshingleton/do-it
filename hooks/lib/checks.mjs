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
  // A bad entry costs only itself: the built-ins and every valid rule still load.
  const valid = [];
  const skipped = [];
  custom.forEach((c, i) => {
    const why = invalid(c);
    if (why) skipped.push(`entry ${i + 1}${c && typeof c === 'object' && c.id ? ` (${c.id})` : ''}: ${why}`);
    else if (why === null) valid.push(typeof c.files === 'string' ? { ...c, files: [c.files] } : c);
  });
  if (skipped.length) error = [error, `${file}: skipped ${skipped.join('; ')}`].filter(Boolean).join('\n');
  const disabled = new Set(valid.filter((c) => c.disabled).map((c) => c.id));
  const rules = [...BUILTIN.filter((r) => !disabled.has(r.id)), ...valid.filter((c) => !c.disabled)];
  return { rules, error };
}

// Why a checks.json entry cannot be used, null when it can, '' when it is a
// harmless no-op (disabled with no id).
function invalid(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return 'not an object';
  if (c.disabled) return c.id ? null : '';
  if (typeof c.id !== 'string' || !c.id) return 'no id';
  if (typeof c.pattern !== 'string' && typeof c.filePattern !== 'string') return 'no pattern or filePattern';
  if (c.files !== undefined && typeof c.files !== 'string' && !(Array.isArray(c.files) && c.files.every((f) => typeof f === 'string'))) {
    return 'files must be a list of extensions';
  }
  if (c.severity !== undefined && !(typeof c.severity === 'string' && /^(HIGH|MEDIUM|LOW)$/i.test(c.severity))) {
    return 'severity must be HIGH, MEDIUM or LOW';
  }
  return null;
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

// Each file an edit touches, with the text added to it, in edit order:
// [{ file, added, gone? }], from Claude Code or OpenCode tool input. Patches
// contribute only their added lines (removing a secret is fine), each under
// the file it lands in. No added line is ever dropped: lines before any file
// header land under file '', lines after a delete under the deleted path.
// `gone: true` marks a file that does not exist once the edit is done (a
// move's old path, a deleted file given added lines, a path named only for
// its path rules): it is scanned, path rules included, but there is nothing
// to lint. A deleted file with no added lines has no part.
export function editParts(input = {}) {
  const parts = new Map();
  const exists = new Set();
  const add = (file, line) => {
    if (!parts.has(file)) parts.set(file, []);
    if (line !== undefined) parts.get(file).push(line);
  };
  const files = { add, exists };

  const [file = '', ...others] = [input.file_path, input.filePath, input.notebook_path, input.path].filter((f) => typeof f === 'string' && f);
  const text = ['content', 'new_string', 'newString', 'new_source'].map((k) => input[k]);
  for (const e of input.edits || []) text.push(e.new_string, e.newString);
  const added = text.filter((t) => typeof t === 'string');
  if (file || added.length) add(file);
  for (const t of added) add(file, t);
  for (const f of [file, ...others]) {
    if (!f) continue;
    add(f);
    exists.add(f);
  }

  for (const key of ['patch', 'patchText']) {
    if (typeof input[key] !== 'string') continue;
    const lines = input[key].split(/\r?\n/);
    if (lines.some((l) => /^\*\*\* Begin Patch/.test(l))) applyPatchFiles(lines, files);
    else unifiedFiles(lines, files);
  }
  return [...parts].map(([f, lines]) => (f && !exists.has(f) ? { file: f, added: lines.join('\n'), gone: true } : { file: f, added: lines.join('\n') }));
}

// apply_patch (OpenCode): `*** Add File:`, `*** Update File:`, `*** Delete
// File:` and `*** Move to:` name the files; every `+` line is added text for
// the current one, including one that reads `+++ x`. A `--- ` / `+++ <path>`
// pair also names <path> for its path rules, since a lenient tool may apply
// a unified section embedded in the patch.
function applyPatchFiles(lines, { add, exists }) {
  let current = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const block = line.match(/^\*\*\* (Add File|Update File|Delete File|Move to): (.+)$/);
    const named = headerPath(lines[i - 1], '---') !== null && headerPath(line, '+++');
    if (block) {
      if (block[1] === 'Move to') exists.delete(current);
      current = block[2].trim();
      if (block[1] === 'Delete File') {
        exists.delete(current);
        continue;
      }
      exists.add(current);
      add(current);
    } else if (line.startsWith('+')) {
      if (named && named !== '/dev/null') add(named);
      add(current, line.slice(1));
    }
  }
}

// Unified diff: between hunks, `--- <old>` and `+++ <new>` name the file
// (`+++ /dev/null` deletes <old>); `@@ -a,b +c,d @@` opens a hunk of b old
// and d new lines, and inside it every line is content, however it looks.
// A hunk whose counts cannot be read runs to the end, so its lines are still
// scanned. A `--- ` / `+++ <path>` pair inside a hunk is content too, but a
// lenient tool (a bare `@@`, a wrong count) may split files on it: it also
// names <path>, and the added lines after it are scanned under both files.
function unifiedFiles(lines, { add, exists }) {
  let current = '';
  let also = null;
  let from = null;
  let oldLeft = 0;
  let newLeft = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const c = line[0];
    if ((oldLeft > 0 || newLeft > 0) && (c === '+' || c === '-' || c === ' ' || c === '\\' || line === '')) {
      const named = headerPath(lines[i - 1], '---') !== null && headerPath(line, '+++');
      if (named && named !== '/dev/null') {
        also = named;
        add(also);
      } else if (c === '+' && also) {
        add(also, line.slice(1));
      }
      if (c === '+') add(current, line.slice(1));
      if (c === '+' || c === ' ' || line === '') newLeft--;
      if (c === '-' || c === ' ' || line === '') oldLeft--;
      continue;
    }
    // A malformed hunk ends at the first line it cannot hold.
    oldLeft = newLeft = 0;
    const hunk = line.match(/^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/);
    const old = headerPath(line, '---');
    const to = headerPath(line, '+++');
    if (line.startsWith('@@')) {
      oldLeft = hunk ? Number(hunk[1] ?? 1) : Infinity;
      newLeft = hunk ? Number(hunk[2] ?? 1) : Infinity;
    } else if (old !== null) {
      from = old;
    } else if (to === '/dev/null') {
      current = from && from !== '/dev/null' ? from : '';
      also = null;
      exists.delete(current);
    } else if (to !== null) {
      current = to;
      also = null;
      exists.add(current);
      add(current);
    } else if (line.startsWith('+')) {
      add(current, line.slice(1));
    }
  }
}

// The path a `--- ` or `+++ ` header line names, or null when `line` is not
// one: without the a/ or b/ prefix, git's quotes or diff -u's tab timestamp.
function headerPath(line, marker) {
  if (typeof line !== 'string' || !line.startsWith(`${marker} `)) return null;
  let p = line.slice(4).replace(/\t.*$/, '').trim();
  if (/^".*"$/.test(p)) p = p.slice(1, -1);
  return p === '/dev/null' ? p : p.replace(/^[ab]\//, '');
}
