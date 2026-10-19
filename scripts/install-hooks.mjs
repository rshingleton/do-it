#!/usr/bin/env node
// Register (or remove) the do-it hooks for a symlink install. The Claude Code
// plugin install does not need this; it reads hooks/hooks.json itself.
//
// Usage: install-hooks.mjs claude|opencode [--remove] [--dry-run]
//
// claude:   merges hooks into ~/.claude/settings.json (backup alongside)
// opencode: adds the plugin to ~/.config/opencode/opencode.json (backup alongside)
// Entries are recognised by their path into this checkout, so re-running is safe.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT } from './lib/skills.mjs';

const [host, ...flags] = process.argv.slice(2);
const remove = flags.includes('--remove');
const dryRun = flags.includes('--dry-run');
const HOME = os.homedir();

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${file} is not plain JSON (comments?). Edit it by hand; see README "Hooks".`);
  }
}

// Write only when something changed. The backup is taken once, so it keeps
// the file as it was before do-it first touched it, however often this runs.
function writeJson(file, before, data) {
  if (JSON.stringify(before) === JSON.stringify(data)) {
    console.log(`unchanged ${file}`);
    return;
  }
  const out = `${JSON.stringify(data, null, 2)}\n`;
  if (dryRun) {
    console.log(`--- ${file} (dry run)\n${out}`);
    return;
  }
  const backup = `${file}.bak-do-it`;
  if (fs.existsSync(file) && !fs.existsSync(backup)) fs.copyFileSync(file, backup);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out);
  console.log(`updated ${file}${fs.existsSync(backup) ? ` (original kept in ${backup})` : ''}`);
}

// hooks/hooks.json with ${CLAUDE_PLUGIN_ROOT} resolved to this checkout.
export function claudeHooks(root) {
  const { hooks } = JSON.parse(fs.readFileSync(path.join(root, 'hooks', 'hooks.json'), 'utf8'));
  for (const groups of Object.values(hooks)) {
    for (const group of groups) {
      for (const h of group.hooks) h.command = h.command.replaceAll('${CLAUDE_PLUGIN_ROOT}', root);
    }
  }
  return hooks;
}

export function mergeClaude(settings, root, { strip = false } = {}) {
  const mine = (h) => String(h.command || '').includes(path.join(root, 'hooks', 'claude.mjs'));
  const hooks = { ...(settings.hooks || {}) };
  for (const event of Object.keys(hooks)) {
    hooks[event] = hooks[event]
      .map((group) => ({ ...group, hooks: (group.hooks || []).filter((h) => !mine(h)) }))
      .filter((group) => group.hooks.length);
    if (!hooks[event].length) delete hooks[event];
  }
  if (!strip) {
    for (const [event, groups] of Object.entries(claudeHooks(root))) {
      hooks[event] = [...(hooks[event] || []), ...groups];
    }
  }
  const next = { ...settings, hooks };
  if (!Object.keys(hooks).length) delete next.hooks;
  return next;
}

function opencodeMajor() {
  try {
    return Number(execFileSync('opencode', ['--version'], { encoding: 'utf8' }).match(/(\d+)\./)?.[1]) || 1;
  } catch {
    return 1;
  }
}

export function mergeOpencode(config, root, { strip = false, major = 1 } = {}) {
  const dir = path.join(root, '.opencode', 'plugins');
  const file = path.join(dir, 'do-it.mjs');
  const next = { ...config };
  for (const key of ['plugin', 'plugins']) {
    if (Array.isArray(next[key])) next[key] = next[key].filter((p) => p !== dir && p !== file);
  }
  if (!strip) {
    const key = major >= 2 ? 'plugins' : 'plugin';
    next[key] = [...(next[key] || []), major >= 2 ? dir : file];
  }
  for (const key of ['plugin', 'plugins']) if (Array.isArray(next[key]) && !next[key].length) delete next[key];
  return next;
}

function main() {
  if (host === 'claude') {
    const file = path.join(HOME, '.claude', 'settings.json');
    const before = readJson(file);
    writeJson(file, before, mergeClaude(before, ROOT, { strip: remove }));
  } else if (host === 'opencode') {
    const file = path.join(process.env.XDG_CONFIG_HOME || path.join(HOME, '.config'), 'opencode', 'opencode.json');
    const before = readJson(file);
    writeJson(file, before, mergeOpencode(before, ROOT, { strip: remove, major: opencodeMajor() }));
  } else {
    console.error('usage: install-hooks.mjs claude|opencode [--remove] [--dry-run]');
    process.exit(2);
  }
}

// fileURLToPath, not URL.pathname: the latter keeps %20 for spaces in the path.
function isMain() {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
