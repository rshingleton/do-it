#!/usr/bin/env node
// Run the do-it mechanical checks over a change: tracked edits since a ref
// (default HEAD) plus untracked files. Prints findings; exits 1 on any HIGH.
//
// Usage: scan.mjs [--since <ref>]

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fs.realpathSync(fileURLToPath(import.meta.url)));
const { loadConfig } = await import(path.join(HERE, '../../tracker/scripts/config.mjs'));
const { loadChecks, scan, format } = await import(path.join(HERE, '../../../hooks/lib/checks.mjs'));

const args = process.argv.slice(2);
const at = args.indexOf('--since');
const since = at >= 0 && args[at + 1] ? args[at + 1] : 'HEAD';

const config = loadConfig();
const root = config.root;
const git = (a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
const { rules, error } = loadChecks(root, config.values.DO_IT_COMPLIANCE_DIR);
if (error) console.log(`warning: ${error}`);

// A repo with no commits has no HEAD to diff against; every file is untracked.
let hasBase = true;
try {
  git(['rev-parse', '--verify', '--quiet', `${since}^{commit}`]);
} catch {
  hasBase = false;
}

const findings = [];
const tracked = hasBase ? git(['diff', '--name-only', '--diff-filter=ACMR', since]).split('\n').filter(Boolean) : [];
for (const file of tracked) {
  const added = git(['diff', '-U0', since, '--', file])
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1))
    .join('\n');
  for (const f of scan(added, rules, file)) findings.push({ ...f, file, line: 0 });
}
for (const file of git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)) {
  let text = '';
  try {
    text = fs.readFileSync(path.join(root, file), 'utf8');
  } catch {
    continue;
  }
  for (const f of scan(text, rules, file)) findings.push({ ...f, file });
}

if (!findings.length) {
  console.log(`clean: ${rules.length} rules, change since ${since}`);
} else {
  for (const f of findings) console.log(format([f], f.file));
}
process.exit(findings.some((f) => f.severity === 'HIGH') ? 1 : 0);
