#!/usr/bin/env node
// Run the do-it mechanical checks over a change: tracked edits since a ref
// (default HEAD) plus untracked files. Prints findings; exits 1 on any HIGH.
//
// Usage: scan.mjs [--since <ref>]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fs.realpathSync(fileURLToPath(import.meta.url)));

// A step that did not run is unverified, never a clean scan: a copy install
// (`skills` CLI, plugin) has no shared code to run, and that must be said.
function unverified(why) {
  console.error(`Unverified: ${why}`);
  process.exit(2);
}

// The checkout holding the shared code: the nearest directory above this script
// with hooks/lib/checks.mjs in it.
function findCheckout(start) {
  for (let dir = start; ; ) {
    if (fs.existsSync(path.join(dir, 'hooks/lib/checks.mjs'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const CHECKOUT = findCheckout(HERE);
if (!CHECKOUT) unverified(`cannot resolve hooks/lib/checks.mjs from ${HERE}`);

// Each module: the checkout's copy, else the sibling skill layout (an install
// keeps each skill's tree but not the checkout); nothing found is unverified.
const SHARED = {
  'skills/track-it/scripts/config.mjs': '../../track-it/scripts/config.mjs',
  'hooks/lib/checks.mjs': '../../../hooks/lib/checks.mjs',
  'skills/do-it/scripts/changeset.mjs': '../../do-it/scripts/changeset.mjs',
};
const found = {};
const missing = [];
for (const [at, sibling] of Object.entries(SHARED)) {
  const beside = path.join(HERE, sibling);
  const file = [path.join(CHECKOUT, at), beside].find((f) => fs.existsSync(f));
  if (file) found[at] = file;
  else missing.push(at);
}
if (missing.length) unverified(`cannot resolve ${missing.join(', ')} from ${CHECKOUT}`);

async function load(at) {
  try {
    return await import(pathToFileURL(found[at]).href);
  } catch (e) {
    unverified(`cannot load ${found[at]}: ${e.message}`);
  }
}

const { loadConfig } = await load('skills/track-it/scripts/config.mjs');
const { loadChecks, scan, format } = await load('hooks/lib/checks.mjs');
const { addedLines } = await load('skills/do-it/scripts/changeset.mjs');

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
