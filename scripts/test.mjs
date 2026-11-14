#!/usr/bin/env node
// Run every tests/*.test.mjs under `node --test`. The file list is built here
// because Node 18 does not expand globs itself and PowerShell does not either,
// so `node --test tests/*.test.mjs` finds nothing on a Windows runner.
// Extra arguments (a --test-name-pattern, say) pass through to `node --test`.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'tests');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => path.join('tests', f));

const res = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], { cwd: root, stdio: 'inherit' });
process.exit(res.status ?? 1);
