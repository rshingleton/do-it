#!/usr/bin/env node
// Install do-it from this checkout, for Claude Code and OpenCode, on any
// platform.
//
//   node scripts/install.mjs [--link] [--no-hooks] [--force] [--dry-run] [--uninstall]
//
// Skills:   skills/<name>    -> ~/.claude/skills/<name> and ~/.agents/skills/<name>
// Agents:   agents/<name>.md -> ~/.claude/agents/<name>.md (Claude Code only)
// Commands: .opencode/command/<name>.md  -> ~/.config/opencode/command/<name>.md  (OpenCode 1)
//           .opencode/commands/<name>.md -> ~/.config/opencode/commands/<name>.md (OpenCode 2)
// OpenCode agents: .opencode/agents/<name>.md -> ~/.config/opencode/agents/<name>.md
// Hooks:    on by default; registered in ~/.claude/settings.json and
//           ~/.config/opencode/opencode.json (backups written alongside).
//
// Every entry is copied, so the install outlives the checkout: someone who is
// not developing do-it can delete the clone once its hooks are deregistered.
// `--link` installs links into the checkout instead, which is the development
// mode: edits are live and nothing has to be re-copied after a pull. Hooks and
// the OpenCode plugin stay registered by absolute path from the checkout the
// installer ran in; copies are for skills, agents and commands.
//
// The root an install runs from: `install({ root })`, else `DO_IT_HOME`, else
// this checkout. `DO_IT_HOME` is read once, and only when no root is given.
//
// A link is a symlink. Where Windows refuses one (no Developer Mode), a
// directory becomes a junction and a file becomes a copy; every copied entry is
// listed in ~/.claude/do-it/install.json so a re-run refreshes it and
// --uninstall removes only it. An existing entry that is not ours is left alone
// unless --force.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/skills.mjs';
import { hashFile, hashTree, norm, readManifest, sameTarget, under, writeManifest } from './lib/install-state.mjs';
// The ref this installer prints comes from lib/read-ref.mjs, so the doctor can
// plan its links through this module without the two importing each other.
import { fetchText, plural, readRef } from './lib/read-ref.mjs';
import { isMain } from '../skills/it-core/scripts/is-main.mjs';

const USAGE = 'usage: install.mjs [--link] [--no-hooks] [--force] [--dry-run] [--uninstall]';

// A directory with nothing in it is not a skill. An untracked `skills/<name>`
// made and then emptied would otherwise be planned, linked and, in the doctor's
// read-back, reported as installed.
const filled = (dir) => {
  try {
    return fs.readdirSync(dir).length > 0;
  } catch {
    return false;
  }
};

const entries = (dir, want) => {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => (want === 'dir' ? d.isDirectory() && filled(path.join(dir, d.name)) : d.isFile() && d.name.endsWith('.md')))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
};

// The entries an install places: [{ src, dst, kind: 'dir' | 'file' }], in the order
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

// Put `src` at `dst`: a copy, or with `link` a symlink (failing that a junction
// for a directory on Windows, or a copy for a file). Returns 'copy', 'symlink'
// or 'junction'. Any other error, such as EEXIST, is thrown.
export function place(src, dst, { fs: f = fs, platform = process.platform, link = false } = {}) {
  const isDir = f.statSync(src).isDirectory();
  if (!link) {
    if (isDir) f.cpSync(src, dst, { recursive: true });
    else f.copyFileSync(src, dst);
    return 'copy';
  }
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

// Where a link points, or null when it cannot be read.
const readlink = (p) => {
  try {
    return fs.readlinkSync(p);
  } catch {
    return null;
  }
};

// What a manifest entry hashes: a directory by its tree, a file by its bytes.
const hashOf = (p, kind) => (kind === 'dir' ? hashTree(p) : hashFile(p));

// The copy a manifest entry records is still the one that was installed: it is
// there, of the recorded kind, and nothing inside it changed.
const copyUnchanged = (c) => {
  const st = lstat(c.dst);
  if (!st) return false;
  const kind = c.kind === 'dir' ? 'dir' : 'file';
  if (kind === 'dir' ? !st.isDirectory() || st.isSymbolicLink() : !st.isFile()) return false;
  try {
    return hashOf(c.dst, kind) === c.hash;
  } catch {
    return false;
  }
};

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
  // checkout) falls back to the running installer's. Say so: the fallback
  // registers ROOT's hooks while the links point at root.
  const own = path.join(root, 'scripts', 'install-hooks.mjs');
  const script = fs.existsSync(own) ? own : path.join(ROOT, 'scripts', 'install-hooks.mjs');
  if (script !== own) console.error(`note: ${root} has no scripts/install-hooks.mjs; hooks come from ${ROOT}`);
  const runtimeDirs = [
    path.join(home, '.local', 'share', 'opencode'),
    path.join(home, '.cache', 'opencode'),
    path.join(home, '.local', 'state', 'opencode'),
  ];
  const alreadyThere = new Set(runtimeDirs.filter((dir) => fs.existsSync(dir)));
  const status = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit', env }).status ?? 1;
  // Clear only runtime dirs the hook step just created. An install into the
  // current home must leave its OpenCode data alone: the database there holds
  // the user's saved accounts.
  for (const dir of runtimeDirs) if (!alreadyThere.has(dir)) fs.rmSync(dir, { recursive: true, force: true });
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
// was given, so a caller that names one is never overridden by it. Resolved to
// an absolute path here, so a relative DO_IT_HOME cannot make a link target
// that resolves inside the link's own directory.
const resolveRoot = (root) => path.resolve(root ?? (process.env.DO_IT_HOME || ROOT));

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

// The line an install ends with: the commit it came from, how far this checkout
// is behind the ref the install follows, and where those counts came from.
// Null when git cannot answer, so an install prints what it always printed and
// carries on. `dry` says what would be installed rather than what was.
function installLine(ref, { root, dry }) {
  if (ref.unknown) return null;
  const at = `${dry ? 'would install from' : 'installed from'} ${root} at ${ref.sha} (${ref.branch ?? 'detached HEAD'})`;
  const followed = ref.followed;
  if (!followed) return at;
  const where = followed.behind > 0
    ? `${plural(followed.behind, 'commit', 'commits')} behind ${followed.name}`
    : `up to date with ${followed.name}`;
  return `${at}, ${where}; ${fetchText(ref)}`;
}

// The directories an install fills, each with the checkout's directory its links
// point into: everything under the first that is a link into the second is ours.
function installDirs(root, home, configHome) {
  return [
    [path.join(home, '.claude', 'skills'), path.join(root, 'skills')],
    [path.join(home, '.agents', 'skills'), path.join(root, 'skills')],
    [path.join(home, '.claude', 'agents'), path.join(root, 'agents')],
    [path.join(configHome, 'opencode', 'command'), path.join(root, '.opencode', 'command')],
    [path.join(configHome, 'opencode', 'commands'), path.join(root, '.opencode', 'commands')],
    [path.join(configHome, 'opencode', 'agents'), path.join(root, '.opencode', 'agents')],
  ];
}

// The entries this checkout's install left that the plan no longer lists: a
// skill since renamed or removed, a directory the plan now leaves out, or a
// source deleted after the install. Links into this checkout go, and so does a
// recorded copy nobody edited. The doctor calls each one an orphan and its fix
// is this installer, so the installer is what removes them; an entry the plan
// lists is placed or refreshed by the loop that follows. Returns the manifest
// with the pruned copies dropped.
function pruneOrphans(root, home, configHome, plan, manifest, { dry, say, run, force }) {
  const planned = new Map(); // destination directory -> the names the plan puts there
  const plannedDst = new Set();
  for (const { dst } of plan) {
    plannedDst.add(path.resolve(dst));
    const dir = path.dirname(dst);
    if (!planned.has(dir)) planned.set(dir, new Set());
    planned.get(dir).add(path.basename(dst));
  }
  for (const [dir, prefix] of installDirs(root, home, configHome)) {
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (planned.get(dir)?.has(name)) continue;
      const entry = path.join(dir, name);
      const st = lstat(entry);
      if (!st?.isSymbolicLink()) continue;
      const target = readlink(entry);
      if (target === null || !under(target, prefix)) continue;
      if (dry) run(`rm ${entry}`);
      else removeEntry(entry);
      say(`unlink ${entry} (the plan does not list it)`);
    }
  }
  const kept = [];
  let removed = 0;
  const cliOwns = cliOwner(home);
  for (const c of manifest) {
    if (!under(c.src, root) || plannedDst.has(path.resolve(c.dst))) {
      kept.push(c);
      continue;
    }
    // Another route's copy is neither ours to remove nor still ours to record.
    if (cliOwns(c.dst)) {
      removed += 1;
      continue;
    }
    if (!lstat(c.dst)) {
      removed += 1; // the entry is gone, so its record goes with it
      continue;
    }
    // An edited copy is the user's; --force is their word that it is not.
    if (!force && !copyUnchanged(c)) {
      kept.push(c);
      continue;
    }
    if (dry) run(`rm -rf ${c.dst}`);
    else removeEntry(c.dst);
    say(`rm ${c.dst} (the plan does not list it)`);
    removed += 1;
  }
  return { kept, removed };
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
  const dirs = installDirs(root, home, configHome);
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
      const target = readlink(entry);
      if (target === null || !under(target, prefix)) continue;
      if (!dry) removeEntry(entry);
      else run(`rm ${entry}`);
      say(`unlink ${entry}`);
    }
  }
  const kept = [];
  const cliOwns = cliOwner(home);
  for (const c of manifest) {
    if (!under(c.src, root)) {
      kept.push(c);
      continue;
    }
    // A copy the `skills` CLI now owns is not ours to uninstall, nor to record.
    if (cliOwns(c.dst)) continue;
    const st = lstat(c.dst);
    if (!st) continue;
    if (copyUnchanged(c)) {
      if (!dry) removeEntry(c.dst);
      else run(`rm -rf ${c.dst}`);
      say(`${c.kind === 'dir' ? 'rm' : 'unlink'} ${c.dst}`);
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

// A predicate: is `dst` a copy the `skills` CLI installed? Only the folder the
// CLI writes into and the names its lock records count, so the same skill name
// anywhere else is ours. The lock is the only place the CLI writes down what it
// owns: ours to leave alone, not to adopt, replace or uninstall.
function cliOwner(home) {
  let names = new Set();
  try {
    const lock = JSON.parse(fs.readFileSync(path.join(home, '.agents', '.skill-lock.json'), 'utf8'));
    names = new Set(Object.keys(lock.skills ?? {}));
  } catch {
    // No lock, no route to protect.
  }
  const dir = path.join(home, '.agents', 'skills');
  return (dst) => names.has(path.basename(dst)) && sameTarget(path.dirname(dst), dir);
}

export function install({ root, home = os.homedir(), configHome, hooks = true, force = false, dry = false, uninstall: remove = false, link = false, placeFs } = {}) {
  root = resolveRoot(root);
  configHome = configHome || process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  if (remove) return uninstall({ root, home, configHome, hooks, dry });
  const say = (s) => console.log(s);
  const run = (what) => dry && say(`would: ${what}`);
  const plan = planLinks(root, home, configHome);

  // Before the plan: an orphan entry this checkout's install left has no place
  // in it, and removing it first lets a renamed entry take the name back in the
  // same run.
  const manifest = pruneOrphans(root, home, configHome, plan, readManifest(home), { dry, say, run, force });

  const copies = new Map(manifest.kept.map((c) => [c.dst, c]));
  const cliOwns = cliOwner(home);
  const made = [];
  const dirsDone = new Set();
  for (const { src, dst, kind } of plan) {
    if (!dirsDone.has(path.dirname(dst))) {
      dirsDone.add(path.dirname(dst));
      if (dry) run(`mkdir -p ${path.dirname(dst)}`);
      else fs.mkdirSync(path.dirname(dst), { recursive: true });
    }
    const st = lstat(dst);
    const copy = copies.get(dst);
    const oursCopy = Boolean(copy && sameTarget(copy.src, src));
    const target = st?.isSymbolicLink() ? readlink(dst) : null;
    const oursLink = target !== null && sameTarget(target, src);

    // A copy the `skills` CLI recorded is that route's, in either mode, and
    // --force does not make it ours.
    if (st && !oursLink && cliOwns(dst)) {
      say(`skip  ${dst} (installed by the skills CLI)`);
      continue;
    }

    if (link) {
      // A link this run wants is already right. Our own copy becomes a link,
      // unless the user edited it; a stranger's entry waits for --force.
      if (oursLink) continue;
      if (st && !force && !oursCopy) {
        // An unrecorded copy identical to its source is an interrupted run's,
        // which this mode finishes by linking it.
        let same = false;
        try {
          same = !st.isSymbolicLink() && hashOf(dst, kind) === hashOf(src, kind);
        } catch {
          same = false;
        }
        if (!same) {
          say(`skip  ${dst} (exists: not ours; --force to replace)`);
          continue;
        }
      }
      if (st && !force && oursCopy && !copyUnchanged(copy)) {
        say(`skip  ${dst} (copy was edited; --force to replace)`);
        continue;
      }
    } else {
      if (oursCopy && st) {
        const copyKind = copy.kind === 'dir' ? 'dir' : 'file';
        const ours = copyKind === 'dir' ? st.isDirectory() && !st.isSymbolicLink() : st.isFile();
        if (oursLink) {
          // Our own link with a record left beside it (an interrupted --link
          // run): replace it with the copy this mode wants.
        } else if (!ours) {
          // Not the entry we recorded: a directory where a file was copied, or
          // the reverse. The user put it there, so only --force replaces it.
          if (!force) {
            say(`skip  ${dst} (not the ${copyKind} copy we installed; --force to replace)`);
            continue;
          }
        } else if (!copyUnchanged(copy)) {
          if (!force) {
            say(`skip  ${dst} (copy was edited; --force to replace)`);
            continue;
          }
        } else if (hashOf(src, kind) === copy.hash) {
          continue; // already the copy this run would make
        }
      } else if (st && !oursLink) {
        if (!force) {
          // A link that is not ours is a stranger's, never an interrupted run's.
          if (st.isSymbolicLink()) {
            say(`skip  ${dst} (exists: not ours; --force to replace)`);
            continue;
          }
          // An entry that is not recorded, yet is byte-identical to the source,
          // is a copy an interrupted run left: adopt it rather than asking for
          // --force. Anything else is a stranger's.
          let same = false;
          try {
            same = hashOf(dst, kind) === hashOf(src, kind);
          } catch {
            same = false;
          }
          if (!same) {
            say(`skip  ${dst} (exists: not ours; --force to replace)`);
            continue;
          }
          made.push(kind === 'dir' ? { src, dst, kind: 'dir', hash: hashOf(dst, 'dir') } : { src, dst, hash: hashOf(dst, 'file') });
          say(`keep  ${dst} (an unrecorded copy that matches the source)`);
          continue;
        }
      }
    }

    if (st) {
      if (dry) run(`rm -rf ${dst}`);
      else removeEntry(dst);
    }
    if (dry) {
      run(link ? `ln -s ${src} ${dst}` : `cp -R ${src} ${dst}`);
      say(`${link ? 'link' : 'copy'}  ${dst}`);
      continue;
    }
    const how = place(src, dst, { ...(placeFs ? { fs: placeFs } : {}), link });
    if (kind === 'dir' && how === 'copy') made.push({ src, dst, kind: 'dir', hash: hashTree(dst) });
    else if (how === 'copy') made.push({ src, dst, hash: hashFile(dst) });
    say(`${link ? 'link' : 'copy'}  ${dst}${how === 'symlink' || how === 'copy' ? '' : ` (${how})`}`);
  }

  if (!dry) {
    const refreshed = new Set(made.map((c) => c.dst));
    const live = [
      ...manifest.kept.filter((c) => !refreshed.has(c.dst) && lstat(c.dst) && (c.kind === 'dir' ? lstat(c.dst).isDirectory() : lstat(c.dst).isFile())),
      ...made,
    ];
    if (manifest.removed || live.length !== manifest.kept.length || made.length) writeManifest(home, live);
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
  const o = { hooks: true, force: false, dry: false, uninstall: false, link: false };
  for (const arg of argv) {
    if (arg === '--link') o.link = true;
    else if (arg === '--no-hooks') o.hooks = false;
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
