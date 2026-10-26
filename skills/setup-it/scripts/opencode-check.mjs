#!/usr/bin/env node
// Check that a repo's OpenCode config does not leave `external_directory` open.
// Prints JSON: {applies, file, status, value, comments}. status is ok, allow,
// missing or invalid. Always exits 0; a repo without OpenCode has applies: false.
//
// Usage: opencode-check.mjs [dir]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILES = ['opencode.json', 'opencode.jsonc'];

// Strip // and /* */ comments and trailing commas, leaving strings intact.
function stripJsonc(text) {
  let out = '';
  let comments = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === '/' && text[i + 1] === '/') {
      comments = true;
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      comments = true;
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 1;
    } else out += c;
  }
  return { text: out.replace(/,(\s*[}\]])/g, '$1'), comments };
}

const SAFE = new Set(['ask', 'deny']);

export function checkExternalDirectory(text) {
  const { text: json, comments } = stripJsonc(text);
  let cfg;
  try {
    cfg = JSON.parse(json);
  } catch {
    return { status: 'invalid', value: null, comments };
  }
  const perm = cfg && typeof cfg === 'object' ? cfg.permission : undefined;
  // A string `permission` (a blanket action) cannot take a merged key.
  if (typeof perm === 'string') return { status: 'invalid', value: perm, comments };
  const v = perm?.external_directory;
  if (v === undefined) return { status: 'missing', value: null, comments };
  // The object form maps path patterns to actions; "*" is the catch-all.
  const effective = v && typeof v === 'object' ? v['*'] : v;
  return { status: SAFE.has(effective) ? 'ok' : effective === undefined ? 'missing' : 'allow', value: v, comments };
}

export function checkRepo(dir) {
  const file = FILES.find((f) => fs.existsSync(path.join(dir, f)));
  if (!file) return { applies: fs.existsSync(path.join(dir, '.opencode')), file: null, status: 'missing', value: null, comments: false };
  return { applies: true, file, ...checkExternalDirectory(fs.readFileSync(path.join(dir, file), 'utf8')) };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  console.log(JSON.stringify(checkRepo(path.resolve(process.argv[2] || '.')), null, 2));
}
