#!/usr/bin/env node
// Run the do-it mechanical checks over a change: tracked edits since a ref
// (default HEAD) plus untracked files. Prints findings; exits 1 on any HIGH.
//
// Usage: scan.mjs [--since <ref>]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fs.realpathSync(fileURLToPath(import.meta.url)));
const { loadConfig } = await import(path.join(HERE, '../../track-it/scripts/config.mjs'));
const { loadChecks, scan, format } = await import(path.join(HERE, '../../../hooks/lib/checks.mjs'));
const { addedLines } = await import(path.join(HERE, '../../do-it/scripts/changeset.mjs'));

const args = process.argv.slice(2);
const at = args.indexOf('--since');
if (at >= 0 && !args[at + 1]) {
  console.error('usage: scan.mjs [--since <ref>]');
  process.exit(2);
}
const since = at >= 0 ? args[at + 1] : 'HEAD';

const config = loadConfig();
const { rules, error } = loadChecks(config.root, config.values.DO_IT_COMPLIANCE_DIR);
if (error) console.log(`warning: ${error}`);

// A repo with no commits diffs against the empty tree. Any other ref that
// does not resolve is a mistake, not "nothing changed".
let files;
try {
  files = addedLines(config.root, { against: since, untracked: true });
} catch (e) {
  console.error(/^unknown base ref/.test(e.message) ? `unknown ref: ${since}` : e.message);
  process.exit(2);
}

const findings = [];
for (const { file, lines } of files) {
  for (const f of scan(lines.map((l) => l.text).join('\n'), rules, file)) {
    // scan() numbers the added lines; map back to the line in the file.
    findings.push({ ...f, file, line: f.line && lines[f.line - 1].n });
  }
}

if (!findings.length) {
  console.log(`clean: ${rules.length} rules, change since ${since}`);
} else {
  for (const f of findings) console.log(format([f], f.file));
}
process.exit(findings.some((f) => f.severity === 'HIGH') ? 1 : 0);
