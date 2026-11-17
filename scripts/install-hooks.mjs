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
import { ROOT } from './lib/skills.mjs';
import { sameTarget } from './lib/install-state.mjs';
import { isMain } from '../skills/it-core/scripts/is-main.mjs';

const [host, ...flags] = process.argv.slice(2);
const remove = flags.includes('--remove');
const dryRun = flags.includes('--dry-run');
const HOME = os.homedir();

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  // A BOM makes JSON.parse fail at its first byte, which is not what it is.
  if (text.charCodeAt(0) === 0xfeff) {
    throw new Error(`${file} starts with a byte-order mark (BOM); save it as UTF-8 without one. See README "Hooks".`);
  }
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

// One separator style in a registered command: forward slashes, which node,
// cmd and bash all accept, so a Windows root never mixes the two.
const posix = (p) => p.replaceAll('\\', '/');

// The path a `node "<path>" <event>` command runs, or null for another shape.
const commandPath = (command) => command.match(/^\s*node\s+"([^"]+)"/)?.[1] ?? command.match(/^\s*node\s+(\S+)/)?.[1] ?? null;

// hooks/hooks.json with ${CLAUDE_PLUGIN_ROOT} resolved to this checkout.
export function claudeHooks(root) {
  const { hooks } = JSON.parse(fs.readFileSync(path.join(root, 'hooks', 'hooks.json'), 'utf8'));
  for (const groups of Object.values(hooks)) {
    for (const group of groups) {
      for (const h of group.hooks) h.command = h.command.replaceAll('${CLAUDE_PLUGIN_ROOT}', posix(root));
    }
  }
  return hooks;
}

export function mergeClaude(settings, root, { strip = false } = {}) {
  const target = path.join(root, 'hooks', 'claude.mjs');
  // An entry is ours when its path is this checkout's, however the command
  // spells it: forward or back slashes, `/var` or `/private/var`, a Windows
  // short name or the long one it stands for.
  const mine = (h) => {
    const command = String(h.command || '');
    if (posix(command).includes(posix(target))) return true;
    const named = commandPath(command);
    return named !== null && sameTarget(named, target);
  };
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

// Which OpenCode form the config gets, and where that came from. The host's
// version is the signal when `opencode` can answer. Failing that, the host's own
// config is read: v2 writes the `plugins` key, v1 the `plugin` key. With
// neither, the v1 form is a guess, and the guess is said out loud, because the
// v2 host would skip it silently.
function opencodeForm(config) {
  try {
    const major = Number(execFileSync('opencode', ['--version'], { encoding: 'utf8' }).match(/(\d+)\./)?.[1]);
    if (major) return major;
  } catch {
    /* the binary cannot answer: fall through to the config */
  }
  if (Array.isArray(config.plugins)) {
    console.error('note: opencode --version did not answer; the config\'s "plugins" key names the OpenCode 2 form');
    return 2;
  }
  if (Array.isArray(config.plugin)) {
    console.error('note: opencode --version did not answer; the config\'s "plugin" key names the OpenCode 1 form');
    return 1;
  }
  console.error('note: opencode --version did not answer and the config names no plugin key; guessing the OpenCode 1 form');
  return 1;
}

export function mergeOpencode(config, root, { strip = false, major = 1 } = {}) {
  // Not `plugin/` or `plugins/`: OpenCode 2 discovers both directory names
  // inside a project, so a checkout opened directly would load its plugin twice
  // (once by discovery, once by this registration).
  const dir = path.join(root, '.opencode', 'do-it-plugin');
  // The old name, so an install that predates the move is replaced, not kept beside it.
  const legacy = path.join(root, '.opencode', 'plugins');
  const own = [dir, path.join(dir, 'do-it.mjs'), legacy, path.join(legacy, 'do-it.mjs')];
  const mine = (p) => own.some((o) => p === o || sameTarget(p, o));
  const file = path.join(dir, 'do-it.mjs');
  const next = { ...config };
  for (const key of ['plugin', 'plugins']) {
    if (Array.isArray(next[key])) next[key] = next[key].filter((p) => !mine(p));
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
    // A removal strips both keys, so it needs no form and asks for none.
    writeJson(file, before, mergeOpencode(before, ROOT, { strip: remove, major: remove ? 1 : opencodeForm(before) }));
  } else {
    console.error('usage: install-hooks.mjs claude|opencode [--remove] [--dry-run]');
    process.exit(2);
  }
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
