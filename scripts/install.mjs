#!/usr/bin/env node
// Install do-it from this checkout by links, for Claude Code and OpenCode, on
// any platform.
//
//   node scripts/install.mjs [--no-hooks] [--force] [--dry-run] [--uninstall]
//
// Skills:   skills/<name>    -> ~/.claude/skills/<name> and ~/.agents/skills/<name>
// Agents:   agents/<name>.md -> ~/.claude/agents/<name>.md (Claude Code only)
// Commands: .opencode/command/<name>.md  -> ~/.config/opencode/command/<name>.md  (OpenCode 1)
//           .opencode/commands/<name>.md -> ~/.config/opencode/commands/<name>.md (OpenCode 2)
// OpenCode agents: .opencode/agents/<name>.md -> ~/.config/opencode/agents/<name>.md
// Hooks:    on by default; registered in ~/.claude/settings.json and
//           ~/.config/opencode/opencode.json (backups written alongside).
//
// The root an install runs from: `install({ root })`, else `DO_IT_HOME`, else
// this checkout. `DO_IT_HOME` is read once, and only when no root is given.
//
// A link is a symlink. Where Windows refuses one (no Developer Mode), a
// directory becomes a junction and a file becomes a copy; copies are listed in
// ~/.claude/do-it/install.json so a re-run refreshes them and --uninstall
// removes only them. An existing entry that is not ours is left alone unless
// --force.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/skills.mjs';
import { hashFile, norm, readManifest, sameTarget, under, writeManifest } from './lib/install-state.mjs';
// doctor.mjs imports this module's plan, so the two read each other; both
// imports are function declarations, available before either body runs.
import { ageOf, plural, readRef } from './doctor.mjs';
import { isMain } from '../skills/it-core/scripts/is-main.mjs';

const USAGE = 'usage: install.mjs [--no-hooks] [--force] [--dry-run] [--uninstall]';

const entries = (dir, want) => {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => (want === 'dir' ? d.isDirectory() : d.isFile() && d.name.endsWith('.md')))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
};

// The links an install makes: [{ src, dst, kind: 'dir' | 'file' }], in the order
// install.sh made them. `configHome` is XDG_CONFIG_HOME or ~/.config.
export function planLinks(root, home, configHome = path.join(home, '.config')) {
  const plan = [];
  const add = (srcDir, dstDir, want) => {
    for (const name of entries(srcDir, want)) plan.push({ src: path.join(srcDir, name), dst: path.join(dstDir, name), kind: want });
  };
  for (const dir of [path.join(home, '.claude', 'skills'), path.join(home, '.agents', 'skills')]) add(path.join(root, 'skills'), dir, 'dir');
  add(path.join(root, 'agents'), path.join(home, '.claude', 'agents'), 'file');
  add(path.join(root, '.opencode', 'command'), path.join(configHome, 'opencode', 'command'), 'file');
  add(path.join(root, '.opencode', 'commands'), path.join(configHome, 'opencode', 'commands'), 'file');
  add(path.join(root, '.opencode', 'agents'), path.join(configHome, 'opencode', 'agents'), 'file');
  return plan;
}

const REFUSED = new Set(['EPERM', 'EACCES', 'ENOTSUP', 'ENOSYS']);

// Put `src` at `dst`: a symlink; failing that a junction (directory, Windows)
// or a copy (file). Returns 'symlink', 'junction' or 'copy'. Any other error,
// such as EEXIST, is thrown.
export function place(src, dst, { fs: f = fs, platform = process.platform } = {}) {
  const isDir = f.statSync(src).isDirectory();
  try {
    f.symlinkSync(src, dst, isDir ? 'dir' : 'file');
    return 'symlink';
  } catch (e) {
    if (!REFUSED.has(e.code)) throw e;
    if (isDir) {
      if (platform !== 'win32') throw e;
      f.symlinkSync(src, dst, 'junction');
      return 'junction';
    }
    f.copyFileSync(src, dst);
    return 'copy';
  }
}

const lstat = (p) => fs.lstatSync(p, { throwIfNoEntry: false });

// Remove an entry without ever following a link into what it points at.
function removeEntry(p) {
  const st = lstat(p);
  if (!st) return;
  if (st.isSymbolicLink()) {
    try {
      fs.unlinkSync(p);
    } catch {
      fs.rmdirSync(p); // a junction on some Node/Windows builds
    }
  } else {
    fs.rmSync(p, { recursive: true, force: true });
  }
}

function runHooks(args, home, root) {
  // The hook step resolves the host's home itself (`os.homedir`), so a caller
  // installing into another home has to carry it in the environment, or the
  // step edits the real host config. OpenCode writes its runtime log under the
  // data home, so route it into the same temp home and clear it after.
  const elsewhere = home && norm(home) !== norm(os.homedir());
  const dataHome = elsewhere ? path.join(home, '.local', 'share') : undefined;
  const cacheHome = elsewhere ? path.join(home, '.cache') : undefined;
  const stateHome = elsewhere ? path.join(home, '.local', 'state') : undefined;
  const env = elsewhere
    ? {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        ...(process.platform === 'win32'
          ? { HOMEDRIVE: path.parse(home).root.slice(0, 2), HOMEPATH: home.slice(2) }
          : {}),
        XDG_CONFIG_HOME: path.join(home, '.config'),
        XDG_DATA_HOME: dataHome,
        XDG_CACHE_HOME: cacheHome,
        XDG_STATE_HOME: stateHome,
      }
    : process.env;
  // The step is the installed checkout's own, so its hooks.json and plugin are
  // the ones registered; a tree without the script (a fixture, a partial
  // checkout) falls back to the running installer's.
  const script = fs.existsSync(path.join(root, 'scripts', 'install-hooks.mjs'))
    ? path.join(root, 'scripts', 'install-hooks.mjs')
    : path.join(ROOT, 'scripts', 'install-hooks.mjs');
  const status = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit', env }).status ?? 1;
  const runtimeDirs = new Set([
    path.join(home, '.local', 'share', 'opencode'),
    path.join(home, '.cache', 'opencode'),
    path.join(home, '.local', 'state', 'opencode'),
  ]);
  if (dataHome) runtimeDirs.add(path.join(dataHome, 'opencode'));
  if (cacheHome) runtimeDirs.add(path.join(cacheHome, 'opencode'));
  if (stateHome) runtimeDirs.add(path.join(stateHome, 'opencode'));
  for (const dir of runtimeDirs) fs.rmSync(dir, { recursive: true, force: true });
  return status;
}

// Both hosts' hook work, in order, even after one fails: a host that refuses
// its config must not leave the other host's hooks installed or unregistered.
// Each host's status, so each caller keeps the exit policy it already had.
function runHookSteps(args, { root, home, dry }) {
  const extra = dry ? ['--dry-run'] : [];
  const status = {};
  for (const host of ['claude', 'opencode']) status[host] = runHooks([host, ...args, ...extra], home, root);
  return status;
}

// The checkout an install runs from: the caller's root, else DO_IT_HOME, else
// this checkout. The environment is read once, and only when no root argument
// was given, so a caller that names one is never overridden by it.
const resolveRoot = (root) => root ?? (process.env.DO_IT_HOME || ROOT);

// The checkout's ref, as the doctor reads it: local reads only, so an install
// never fetches. A directory that is not a repository, or a machine without
// git, comes back `unknown`; a reader that throws anyway still leaves an
// install to finish.
function checkoutRef(root) {
  try {
    return readRef({ root });
  } catch {
    return { unknown: 'git cannot answer' };
  }
}

// The line an install ends with: the commit it came from, and how far this
// checkout is behind the ref the install follows. Null when git cannot answer,
// so an install prints what it always printed and carries on. `dry` says what
// would be installed rather than what was.
function installLine(ref, { root, dry }) {
  if (ref.unknown) return null;
  const at = `${dry ? 'would install from' : 'installed from'} ${root} at ${ref.sha} (${ref.branch ?? 'detached HEAD'})`;
  const followed = ref.followed;
  if (!followed) return at;
  const where = followed.behind > 0
    ? `${plural(followed.behind, 'commit', 'commits')} behind ${followed.name}`
    : `up to date with ${followed.name}`;
  const fetched = ref.fetchedAt ? `last fetch ${ageOf(ref.fetchedAt)}` : 'never fetched';
  return `${at}, ${where}; ${fetched}`;
}

// Remove what this checkout's install put down, and only that: links into this
// checkout, and copies whose hash still matches the manifest. `install({
// uninstall: true })` dispatches here, so callers keep their one entry point.
export function uninstall({ root, home = os.homedir(), configHome, hooks = true, dry = false } = {}) {
  root = resolveRoot(root);
  configHome = configHome || process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  const say = (s) => console.log(s);
  const run = (what) => dry && say(`would: ${what}`);
  const manifest = readManifest(home);
  const dirs = [
    [path.join(home, '.claude', 'skills'), path.join(root, 'skills')],
    [path.join(home, '.agents', 'skills'), path.join(root, 'skills')],
    [path.join(home, '.claude', 'agents'), path.join(root, 'agents')],
    [path.join(configHome, 'opencode', 'command'), path.join(root, '.opencode', 'command')],
    [path.join(configHome, 'opencode', 'commands'), path.join(root, '.opencode', 'commands')],
    [path.join(configHome, 'opencode', 'agents'), path.join(root, '.opencode', 'agents')],
  ];
  // Every link into this checkout, including links to skills since renamed or removed.
  for (const [dir, prefix] of dirs) {
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const entry = path.join(dir, name);
      if (!lstat(entry)?.isSymbolicLink()) continue;
      let target;
      try {
        target = fs.readlinkSync(entry);
      } catch {
        continue;
      }
      if (!under(target, prefix)) continue;
      if (!dry) removeEntry(entry);
      else run(`rm ${entry}`);
      say(`unlink ${entry}`);
    }
  }
  const kept = [];
  for (const c of manifest) {
    if (!under(c.src, root)) {
      kept.push(c);
      continue;
    }
    const st = lstat(c.dst);
    if (!st) continue;
    if (st.isFile() && hashFile(c.dst) === c.hash) {
      if (!dry) removeEntry(c.dst);
      else run(`rm ${c.dst}`);
      say(`unlink ${c.dst}`);
    } else {
      say(`skip  ${c.dst} (copy was edited; left alone)`);
      kept.push(c);
    }
  }
  if (!dry) writeManifest(home, kept);
  if (!hooks) return 0;
  const host = runHookSteps(['--remove'], { root, home, dry });
  return host.claude || host.opencode;
}

export function install({ root, home = os.homedir(), configHome, hooks = true, force = false, dry = false, uninstall: remove = false, placeFs } = {}) {
  root = resolveRoot(root);
  configHome = configHome || process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  if (remove) return uninstall({ root, home, configHome, hooks, dry });
  const say = (s) => console.log(s);
  const run = (what) => dry && say(`would: ${what}`);
  const manifest = readManifest(home);
  const plan = planLinks(root, home, configHome);

  const copies = new Map(manifest.map((c) => [c.dst, c]));
  const made = [];
  const dirsDone = new Set();
  for (const { src, dst, kind } of plan) {
    if (!dirsDone.has(path.dirname(dst))) {
      dirsDone.add(path.dirname(dst));
      if (dry) run(`mkdir -p ${path.dirname(dst)}`);
      else fs.mkdirSync(path.dirname(dst), { recursive: true });
    }
    const st = lstat(dst);
    if (st?.isSymbolicLink()) {
      let target = null;
      try {
        target = fs.readlinkSync(dst);
      } catch {
        /* unreadable: treat as not ours */
      }
      if (target !== null && sameTarget(target, src)) continue;
    }
    const copy = copies.get(dst);
    if (st && kind === 'file' && st.isFile() && copy && sameTarget(copy.src, src)) {
      if (hashFile(dst) !== copy.hash) {
        if (!force) {
          say(`skip  ${dst} (copy was edited; --force to replace)`);
          continue;
        }
      } else if (hashFile(src) === copy.hash) {
        continue;
      }
      // Our copy, or one we may replace: refresh it below.
    } else if (st) {
      if (!force) {
        let what = 'not a link';
        try {
          if (st.isSymbolicLink()) what = fs.readlinkSync(dst);
        } catch {
          /* keep the default */
        }
        say(`skip  ${dst} (exists: ${what}; --force to replace)`);
        continue;
      }
    }
    if (st) {
      if (dry) run(`rm -rf ${dst}`);
      else removeEntry(dst);
    }
    if (dry) {
      run(`ln -s ${src} ${dst}`);
      say(`link  ${dst}`);
      continue;
    }
    const how = place(src, dst, placeFs ? { fs: placeFs } : {});
    if (how === 'copy') made.push({ src, dst, hash: hashFile(dst) });
    say(`link  ${dst}${how === 'symlink' ? '' : ` (${how})`}`);
  }

  if (!dry) {
    const refreshed = new Set(made.map((c) => c.dst));
    const live = [...manifest.filter((c) => !refreshed.has(c.dst) && lstat(c.dst)?.isFile()), ...made];
    if (live.length !== manifest.length || made.length) writeManifest(home, live);
  }

  // Before the hooks block: a hook failure returns early, and the line is the
  // one fact an install must not lose.
  say(installLine(checkoutRef(root), { root, dry }) ?? `do-it installed from ${root}`);

  if (hooks) {
    const host = runHookSteps([], { root, home, dry });
    if (host.opencode) say('OpenCode hooks not registered; see README');
    if (host.claude) return host.claude;
  }
  return 0;
}

function main(argv) {
  const o = { hooks: true, force: false, dry: false, uninstall: false };
  for (const arg of argv) {
    if (arg === '--no-hooks') o.hooks = false;
    else if (arg === '--force') o.force = true;
    else if (arg === '--dry-run') o.dry = true;
    else if (arg === '--uninstall') o.uninstall = true;
    else if (arg === '-h' || arg === '--help') {
      console.log(USAGE);
      return 0;
    } else {
      console.error(`unknown option: ${arg}`);
      return 2;
    }
  }
  return install(o);
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
