#!/usr/bin/env node
// Does the install on this machine still match the checkout it came from?
//
//   node scripts/doctor.mjs [--home <dir>] [--config-home <dir>] [--root <checkout>] [--fetch] [--json]
//
// The symlink install places a link per skill, agent and OpenCode file, and
// records a copy where the platform refuses a link (scripts/install.mjs). This
// command reads those entries back:
//
//   ok           the planned link points at its source, or the copy matches it
//   missing      nothing at a place the plan wants
//   foreign      the entry points at another checkout, or is not a link
//   orphan       a link in a managed directory, into this checkout, at a name
//                the plan does not list: a skill since renamed or removed
//   stale copy   the copy matches install.json, the source changed since
//   edited copy  the copy differs from install.json: edited after install
//
// An entry in a managed directory that the plan and install.json both do not
// know, and that resolves outside this checkout, is counted and left alone: it
// is a synced directory or another repo's skill, not ours. Exit 1 when any
// finding is not ok. Reads only; it runs no fix.
//
// The ref footer answers whether the checkout itself is current: its branch and
// short sha, the commits ahead and behind its upstream and behind origin/main,
// and the age of .git/FETCH_HEAD. An install follows origin/main when that ref
// exists and its own upstream otherwise, so commits behind the ref it follows
// are a finding and exit 1; a branch ahead of its own upstream is reported and
// does not fail. No network call unless --fetch is given; a checkout that is not
// a repository, or a machine without git, reports `unknown` with the reason and
// adds no finding of its own.
//
// Two more routes are reported from what each host stores. The plugin route
// asks the host once, `claude plugin list --json`: an in-place install serves
// the folder's version, a cached install serves its version directory, and a
// version off the manifest is stale. The `skills` CLI route reads its project
// lock in the working directory and its global lock, keeps the entries that
// name this checkout, and says what each recorded, with the command that
// refreshes it. Neither route runs an update command or touches the network.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/skills.mjs';
import { hashFile, manifestPath, readManifestState, sameTarget, under } from './lib/install-state.mjs';
import { planLinks } from './install.mjs';
import { git } from '../skills/do-it/scripts/git.mjs';
import { isMain } from '../skills/it-core/scripts/is-main.mjs';

const USAGE = 'usage: doctor.mjs [--home <dir>] [--config-home <dir>] [--root <checkout>] [--fetch] [--json]';

// The order findings print and count in.
const ORDER = ['ok', 'missing', 'foreign', 'orphan', 'stale copy', 'edited copy', 'unreadable'];

const lstat = (p) => fs.lstatSync(p, { throwIfNoEntry: false });

// Where a link points, as an absolute path; relative link text resolves from
// the entry's directory, as the filesystem does.
function linkTarget(entry) {
  try {
    return path.resolve(path.dirname(entry), fs.readlinkSync(entry));
  } catch {
    return null;
  }
}

// The copies install.json records for this checkout, by target path.
function copiesByDst(copies, root) {
  const map = new Map();
  for (const c of copies) if (under(c.src, root)) map.set(path.resolve(c.dst), c);
  return map;
}

// One finding per planned entry: a link to its source is ok, another link is
// foreign, a non-link is foreign, and nothing there is missing.
function linkFindings(plan, copyAt, fix) {
  const findings = [];
  for (const { src, dst } of plan) {
    if (copyAt.has(path.resolve(dst))) continue; // the copy pass reports it
    const st = lstat(dst);
    if (!st) {
      findings.push({ state: 'missing', entry: dst, detail: `no link; the plan has one to ${src}`, fix });
      continue;
    }
    if (!st.isSymbolicLink()) {
      findings.push({ state: 'foreign', entry: dst, detail: `not a link: a ${st.isDirectory() ? 'directory' : 'file'} is in its place`, fix });
      continue;
    }
    const target = linkTarget(dst);
    if (target !== null && sameTarget(target, src)) findings.push({ state: 'ok', entry: dst });
    else findings.push({ state: 'foreign', entry: dst, detail: `points at ${target ?? 'an unreadable target'}; the plan has ${src}`, fix });
  }
  return findings;
}

// One finding per recorded copy: a copy matching both its record and its
// source is ok; a copy matching the record but not the source is stale (the
// installer refreshes it); any other copy was edited (only --force replaces
// it).
function copyFindings(copies, root, fix) {
  const findings = [];
  for (const c of copies) {
    if (!under(c.src, root)) continue; // another checkout's copy
    const st = lstat(c.dst);
    if (!st) {
      findings.push({ state: 'missing', entry: c.dst, detail: `no copy; install.json records one of ${c.src}`, fix });
      continue;
    }
    if (st.isSymbolicLink()) {
      const target = linkTarget(c.dst);
      if (target !== null && sameTarget(target, c.src)) findings.push({ state: 'ok', entry: c.dst });
      else findings.push({ state: 'foreign', entry: c.dst, detail: `a link to ${target ?? 'an unreadable target'}, not the recorded copy`, fix });
      continue;
    }
    if (!st.isFile()) {
      findings.push({ state: 'foreign', entry: c.dst, detail: 'a directory is in place of the recorded copy', fix });
      continue;
    }
    const hash = hashFile(c.dst);
    if (hash !== c.hash) {
      findings.push({ state: 'edited copy', entry: c.dst, detail: `differs from install.json (${hash.slice(0, 7)} here, ${c.hash.slice(0, 7)} recorded)`, fix: `${fix} --force` });
      continue;
    }
    let srcHash = null;
    try {
      srcHash = hashFile(c.src);
    } catch {
      /* the source is gone; reported below */
    }
    if (srcHash === null) findings.push({ state: 'orphan', entry: c.dst, detail: `its source ${c.src} is gone`, fix });
    else if (srcHash !== c.hash) findings.push({ state: 'stale copy', entry: c.dst, detail: `matches install.json; ${c.src} has changed since`, fix });
    else findings.push({ state: 'ok', entry: c.dst });
  }
  return findings;
}

// Every entry in a directory the plan targets: a link into this checkout at a
// name the plan does not list is an orphan, and anything else there is not
// ours. Returns the findings and how many entries were left alone.
function scanFindings(plan, copyAt, root, fix) {
  const dirs = new Map(); // dst directory -> the names the plan puts there
  for (const { dst } of plan) {
    const dir = path.dirname(dst);
    if (!dirs.has(dir)) dirs.set(dir, new Set());
    dirs.get(dir).add(path.basename(dst));
  }
  const findings = [];
  let notOurs = 0;
  for (const [dir, planned] of dirs) {
    let names = [];
    try {
      names = fs.readdirSync(dir).sort();
    } catch {
      continue; // no directory, so its planned entries are missing above
    }
    for (const name of names) {
      if (planned.has(name)) continue;
      const entry = path.join(dir, name);
      if (copyAt.has(path.resolve(entry))) continue;
      const st = lstat(entry);
      if (!st) continue;
      const target = st.isSymbolicLink() ? linkTarget(entry) : null;
      if (target === null || !under(target, root)) {
        notOurs += 1; // a synced directory, another repo's skill: left alone
        continue;
      }
      const survives = fs.existsSync(target);
      findings.push({
        state: 'orphan',
        entry,
        detail: `links to ${target}, which the plan does not list; the target ${survives ? 'still exists' : 'is gone'}`,
        fix,
      });
    }
  }
  return { findings, notOurs };
}

// The first line of a git error without git's "fatal: " prefix: the reason as
// a person reads it.
const firstLine = (text) => String(text ?? '').trim().split('\n')[0].replace(/^fatal: /, '');

// The checkout's ref, read through the one git wrapper (it passes
// safe.bareRepository, which a fixture bare repo needs). Every read is a local
// one: the remote moves only when `fetch` asks it to. Each count comes from a
// remote-tracking ref, so a checkout that has not fetched reports what it knew
// at its last fetch; the age of FETCH_HEAD is printed beside the counts for
// that reason. `unknown` carries the reason git could not answer.
export function readRef({ root, fetch = false } = {}) {
  const at = (args) => {
    try {
      return git(root, args);
    } catch (e) {
      return { status: -1, stdout: '', stderr: e.code === 'ENOENT' ? 'git is not installed' : e.message };
    }
  };

  const top = at(['rev-parse', '--show-toplevel']);
  if (top.status !== 0) return { unknown: firstLine(top.stderr) || 'git cannot read this directory' };
  const toplevel = top.stdout.trim();
  // git walks up from a subdirectory; a ref belongs to the checkout only when
  // that checkout is the repository's top level.
  if (!sameTarget(toplevel, root)) return { unknown: `not the root of a git checkout (its top level is ${toplevel})` };

  let fetchError = null;
  if (fetch) {
    const f = at(['fetch', '--quiet']);
    if (f.status !== 0) fetchError = firstLine(f.stderr) || 'fetch failed';
  }

  const sha = at(['rev-parse', '--short', 'HEAD']);
  if (sha.status !== 0) return { unknown: `no commit at HEAD: ${firstLine(sha.stderr)}` };

  const head = at(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
  const up = at(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);

  // `rev-list --left-right --count A...HEAD` prints commits only in A, then
  // only in HEAD: behind, then ahead.
  const count = (left) => {
    const r = at(['rev-list', '--left-right', '--count', `${left}...HEAD`]);
    if (r.status !== 0) return null;
    const [behind, ahead] = r.stdout.trim().split(/\s+/).map(Number);
    return { ahead, behind };
  };

  const upstream = up.status === 0 ? up.stdout.trim() : null;
  const vsUpstream = upstream ? count(upstream) : null;
  const vsMain = at(['rev-parse', '--verify', '--quiet', 'origin/main^{commit}']).status === 0 ? count('origin/main') : null;

  // The one rule for which ref an install follows: origin/main when it
  // resolves, else the branch's own upstream, else none. Both the footer and
  // the installer's closing line read this field instead of picking again.
  const followed = typeof vsMain?.behind === 'number'
    ? { name: 'origin/main', behind: vsMain.behind }
    : upstream && vsUpstream
      ? { name: upstream, behind: vsUpstream.behind }
      : null;

  const common = at(['rev-parse', '--git-common-dir']);
  const gitDir = common.status === 0 ? path.resolve(root, common.stdout.trim()) : path.join(root, '.git');
  const fetched = fs.statSync(path.join(gitDir, 'FETCH_HEAD'), { throwIfNoEntry: false });

  const ref = {
    branch: head && head !== 'HEAD' ? head : null,
    sha: sha.stdout.trim(),
    upstream,
    ahead: vsUpstream ? vsUpstream.ahead : null,
    behind: vsUpstream ? vsUpstream.behind : null,
    behindMain: vsMain ? vsMain.behind : null,
    followed,
    fetchedAt: fetched ? fetched.mtime.toISOString() : null,
  };
  if (fetchError) ref.fetchError = fetchError;
  return ref;
}

// The age of the last fetch, as an age alone: the footer and the installer's
// line each put their own words in front of it.
export function ageOf(fetchedAt) {
  if (!fetchedAt) return 'never';
  const mins = Math.max(0, Math.floor((Date.now() - Date.parse(fetchedAt)) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

// The age of the last fetch, in the one line the footer has room for.
function ageText(fetchedAt) {
  return fetchedAt ? `fetched ${ageOf(fetchedAt)}` : 'never fetched';
}

// A ref footer line: indented, so it reads as its own route below the entry
// table rather than as another entry.
const refFooter = (text) => `  ref: ${text}`;

// The ref footer: one line naming the ref compared and the age of the fetch,
// then, when the checkout is behind main, the finding and the command that
// updates it. Indented below the entries' summary: these lines are not entries.
function refSection(report) {
  const ref = report.ref;
  if (ref.unknown) return [refFooter(`unknown, ${ref.unknown}`)];
  const where = `${ref.branch ?? 'detached HEAD'} @ ${ref.sha}`;
  const upstream = ref.upstream ? `upstream ${ref.upstream} (${ref.ahead} ahead, ${ref.behind} behind)` : 'upstream none';
  const main = ref.behindMain === null ? 'origin/main absent' : `origin/main (${ref.behindMain} behind)`;
  const fetched = ageText(ref.fetchedAt);
  const failed = ref.fetchError ? `, fetch failed: ${ref.fetchError}` : '';
  const lines = [refFooter(`${where}, ${upstream}, ${main}, ${fetched}${failed}`)];
  if (ref.followed && ref.followed.behind > 0) {
    const root = /\s/.test(report.root) ? `"${report.root}"` : report.root;
    const target = ref.followed.name === 'origin/main' ? 'main' : 'its upstream';
    lines.push(refFooter(`${plural(ref.followed.behind, 'commit', 'commits')} behind ${ref.followed.name}; the install follows ${target}  fix: git -C ${root} pull --ff-only`));
  }
  return lines;
}

// ---- The plugin route ---------------------------------------------------

// The host binary, found the way the platform finds it. On Windows the shell
// is not trusted here: one PATH entry with a stray quote makes cmd miss a
// binary `where` finds, so each entry is checked directly. A .cmd needs the
// shell to run, an .exe does not.
function claudeCall() {
  const args = ['plugin', 'list', '--json'];
  if (process.platform !== 'win32') return { cmd: 'claude', args };
  for (const entry of String(process.env.PATH ?? '').split(path.delimiter)) {
    const dir = entry.trim().replace(/^"+|"+$/g, '');
    if (!dir) continue;
    for (const name of ['claude.exe', 'claude.cmd', 'claude.bat']) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) return { cmd: file, args, shell: /\.(cmd|bat)$/i.test(name) };
    }
  }
  return { cmd: 'claude', args };
}

// The one host read this section makes: what `claude` says it holds.
function claudeList() {
  const { cmd, args, shell = false } = claudeCall();
  const r = shell
    ? spawnSync(`"${cmd}" ${args.join(' ')}`, { encoding: 'utf8', timeout: 15000, shell: true })
    : spawnSync(cmd, args, { encoding: 'utf8', timeout: 15000 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(firstLine(r.stderr || r.stdout) || `claude plugin list exited ${r.status}`);
  return r.stdout;
}

// What the host holds for the do-it plugin, from the last JSON line of
// `claude plugin list --json`. `exec` is that call, so a test stubs it; the
// doctor never asks the host anything else.
export function pluginState({ exec = claudeList } = {}) {
  let out;
  try {
    out = exec();
  } catch (e) {
    const why = e?.code === 'ENOENT' ? 'claude is not on PATH' : firstLine(e?.message ?? e);
    return { unknown: why.includes('claude') ? why : `claude plugin list failed: ${why}` };
  }
  const textOut = String(out ?? '').trim();
  if (!textOut) return { unknown: 'claude plugin list printed nothing' };
  // The documented shape is one JSON object on the last line; the host also
  // pretty-prints the list, so the whole output is the second try.
  const last = textOut.split('\n').map((line) => line.trim()).filter(Boolean).pop();
  let data;
  for (const candidate of [last, textOut]) {
    try {
      data = JSON.parse(candidate);
      break;
    } catch {
      /* try the next shape */
    }
  }
  if (data === undefined) return { unknown: 'claude plugin list did not print JSON' };
  const list = Array.isArray(data) ? data : Array.isArray(data?.plugins) ? data.plugins : data?.pluginId || data?.id ? [data] : [];
  const entry = list.find((p) => (p.pluginId ?? p.id) === 'do-it@do-it');
  if (!entry) return { installed: false };
  return {
    installed: true,
    version: entry.version ?? null,
    folderVersion: entry.folderVersion ?? null,
    readFromFolder: entry.readFromFolder ?? null,
  };
}

const quote = (s) => (/\s/.test(s) ? `"${s}"` : s);

function manifestVersion(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

// One section for the plugin route: the version the host loads, against the
// manifest on disk. A checkout without a manifest has nothing on this route,
// so the host is not asked and another checkout's plugin is not read as ours.
function pluginRoute({ root, exec }) {
  const absent = { route: 'plugin', state: 'absent', detail: 'not installed on this route', fix: null };
  if (!fs.existsSync(path.join(root, '.claude-plugin', 'plugin.json'))) return absent;
  const state = pluginState({ exec });
  if (state.unknown) return { route: 'plugin', state: 'unknown', detail: state.unknown, fix: null };
  if (!state.installed) return absent;
  const version = manifestVersion(root);
  if (!version) return { route: 'plugin', state: 'unknown', detail: 'cannot read the version in .claude-plugin/plugin.json', fix: null };
  const inPlace = state.readFromFolder !== null && sameTarget(state.readFromFolder, root);
  const loaded = inPlace ? state.folderVersion : state.version;
  if (loaded === null || loaded === undefined) {
    return { route: 'plugin', state: 'unknown', detail: 'the host reported no version for do-it@do-it', fix: null };
  }
  const where = inPlace ? 'the host reads this checkout in place' : 'the cache is an install-time snapshot';
  const detail = `${inPlace ? 'the folder' : 'the cached copy'} is ${loaded}, the manifest ${version}; ${where}`;
  if (loaded === version) return { route: 'plugin', state: 'ok', detail, fix: null };
  return { route: 'plugin', state: 'stale', detail, fix: inPlace ? '/plugin marketplace update do-it' : 'claude plugin update do-it@do-it' };
}

// ---- The `skills` CLI route ---------------------------------------------

// The two lock files the CLI writes: the project one in the working directory
// (version 2), and the global one in the state directory (version 3), which
// $XDG_STATE_HOME moves.
function lockFiles({ home, cwd, env }) {
  const stateHome = env.XDG_STATE_HOME ? path.join(env.XDG_STATE_HOME, 'skills') : path.join(home, '.agents');
  return [
    { scope: 'project', file: path.join(cwd, 'skills-lock.json') },
    { scope: 'global', file: path.join(stateHome, '.skill-lock.json') },
  ];
}

// A recorded hash with the length that tells the two kinds apart.
function hashNote(hash) {
  if (!hash) return 'no hash';
  const kind = hash.length === 40 ? 'git tree' : hash.length === 64 ? 'content' : 'unrecognised length';
  return `${hash} (${hash.length} hex, ${kind})`;
}

// A stored timestamp as `YYYY-MM-DD HH:mm`, in UTC so the line does not move
// with the reader's timezone.
function utcStamp(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 16).replace('T', ' ');
}

// A source written as a path: `~` from home, a relative one from the lock's
// directory, the way the CLI resolves it.
function sourcePath(value, { home, lockDir }) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  if (s.startsWith('~/') || s.startsWith('~\\')) return path.join(home, s.slice(2));
  return path.resolve(lockDir, s);
}

// `owner/repo` for a git source or a remote URL, so the two forms compare.
function repoForm(value) {
  const s = String(value ?? '').trim().replace(/^git\+/, '').replace(/\.git$/i, '').replace(/[/\\]+$/, '');
  if (!s) return null;
  const gh = s.match(/github\.com[:/]+([^/]+)\/([^/]+)$/i);
  if (gh) return `${gh[1]}/${gh[2]}`.toLowerCase();
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s) ? s.toLowerCase() : null;
}

// The repository names this checkout's origin answers to.
function originForms(root) {
  try {
    const r = git(root, ['remote', 'get-url', '--all', 'origin']);
    return r.status === 0 ? r.stdout.split('\n').map(repoForm).filter(Boolean) : [];
  } catch {
    return [];
  }
}

// Whether an entry names this checkout: a local source by path, a git source by
// the repository its remote names.
function namesCheckout(entry, { root, home, lockDir, origins }) {
  const sources = [entry.source, entry.sourceUrl].filter(Boolean);
  if (entry.sourceType === 'local') {
    return sources.some((v) => sameTarget(sourcePath(v, { home, lockDir }), root));
  }
  if (entry.sourceType === 'node_modules') return false;
  if (sources.map(repoForm).some((f) => f && origins.includes(f))) return true;
  // A git entry written as the checkout's own path.
  return sources.some((v) => path.isAbsolute(v) && sameTarget(v, root));
}

// The date of the checkout's HEAD commit, as git stores it.
function commitDate(root) {
  try {
    const r = git(root, ['log', '-1', '--format=%cI']);
    const iso = r.stdout.trim();
    return r.status === 0 && iso ? iso.slice(0, 10) : null;
  } catch {
    return null;
  }
}

// One stored entry, as stored, with its scope in front of it.
function cliLine(entry, { checkout, root }) {
  const hash = entry.skillFolderHash ?? entry.computedHash ?? entry.hash ?? null;
  const recorded = utcStamp(entry.updatedAt);
  const parts = [
    `${entry.scope}:`,
    entry.sourceType ?? 'git',
    entry.source ?? entry.sourceUrl ?? 'unknown source',
    entry.skillPath ?? null,
    `hash ${hashNote(hash)},`,
    entry.sourceType !== 'local' && entry.commit ? `commit ${entry.commit},` : null,
    recorded ? `recorded ${recorded},` : null,
    `checkout ${checkout ?? 'unknown'}`,
  ];
  const line = parts.filter(Boolean).join(' ');
  if (entry.sourceType !== 'local') return line;
  const add = `npx skills@latest add ${quote(root)}`;
  return `${line}; skills update never touches a local install, re-run ${add}`;
}

// One section for the CLI route: every lock entry that names this checkout,
// read as stored.
function cliRoute({ root, home, env = process.env, cwd = process.cwd() }) {
  let error = null;
  const found = [];
  for (const { scope, file } of lockFiles({ home, cwd, env })) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') error = error ?? `cannot read ${file}: ${e.message}`;
      continue;
    }
    const skills = data && typeof data.skills === 'object' && !Array.isArray(data.skills) ? data.skills : {};
    for (const [name, entry] of Object.entries(skills)) found.push({ name, ...entry, scope, lockDir: path.dirname(file) });
  }
  if (error) return { route: 'skills CLI', state: 'unknown', detail: error, fix: null };
  const origins = found.some((e) => e.sourceType !== 'local') ? originForms(root) : [];
  const entries = found.filter((e) => namesCheckout(e, { root, home, lockDir: e.lockDir, origins }));
  if (!entries.length) return { route: 'skills CLI', state: 'absent', detail: 'not installed on this route', fix: null };
  const checkout = commitDate(root);
  const local = entries.filter((e) => e.sourceType === 'local');
  const state = local.length === entries.length ? 'local' : local.length ? 'mixed' : 'git';
  const fix = local.length ? `npx skills@latest add ${quote(root)}` : 'npx skills@latest update';
  return { route: 'skills CLI', state, detail: entries.map((e) => cliLine(e, { checkout, root })).join('; '), fix };
}

// The install's findings for one home and one checkout, in print order, with
// the checkout's own ref and the other two routes beside them.
export function doctor({ root = ROOT, home = os.homedir(), configHome, fetch = false, cwd = process.cwd(), env = process.env, exec } = {}) {
  configHome = configHome || process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  const installer = path.join(root, 'scripts', 'install.mjs');
  const fix = `node ${/\s/.test(installer) ? `"${installer}"` : installer}`;
  const manifest = readManifestState(home);
  const ref = readRef({ root, fetch });
  const findings = [];
  if (manifest.error) {
    const file = manifestPath(home);
    const remove = process.platform === 'win32' ? `Remove-Item ${quote(file)}` : `rm ${quote(file)}`;
    findings.push({
      state: 'unreadable',
      entry: file,
      detail: `cannot read it: ${manifest.error}; delete it, then run the installer with --force, which records the copies no other file lists`,
      fix: remove,
    });
  }
  const plan = planLinks(root, home, configHome);
  const copyAt = copiesByDst(manifest.copies, root);
  findings.push(...linkFindings(plan, copyAt, fix));
  findings.push(...copyFindings(manifest.copies, root, fix));
  const scan = scanFindings(plan, copyAt, root, fix);
  findings.push(...scan.findings);
  const behind = Boolean(ref.followed && ref.followed.behind > 0);
  const routes = [pluginRoute({ root, exec }), cliRoute({ root, home, env, cwd })];
  const stale = routes.some((r) => r.state === 'stale');
  return { root, home, configHome, ref, findings, routes, notOurs: scan.notOurs, ok: findings.every((f) => f.state === 'ok') && !behind && !stale };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// One indented line per route, after the checkout's ref: its state, its detail
// and the command that updates it, or the words for a route nothing is on.
function routeSection(report) {
  return report.routes.map((r) => {
    const head = r.state === 'absent' ? r.detail : `${r.state}, ${r.detail}`;
    return `  ${r.route}: ${head}${r.fix ? `  fix: ${r.fix}` : ''}`;
  });
}

// One line per finding, then the counts, then the ref footer and the routes.
function text(report) {
  const lines = report.findings.map((f) => `${f.state.padEnd(12)}${f.entry}${f.detail ? `  ${f.detail}` : ''}${f.fix && f.state !== 'ok' ? `  fix: ${f.fix}` : ''}`);
  const counts = new Map();
  for (const f of report.findings) counts.set(f.state, (counts.get(f.state) ?? 0) + 1);
  const tally = ORDER.filter((s) => s !== 'ok' && counts.get(s)).map((s) => `${counts.get(s)} ${s}`);
  const notOurs = report.notOurs ? `; ${plural(report.notOurs, 'entry', 'entries')} not ours (left alone)` : '';
  const summary = `summary ${plural(report.findings.length, 'entry', 'entries')}: ${counts.get('ok') ?? 0} ok${tally.length ? `, ${tally.join(', ')}` : ''}${notOurs}`;
  return [...lines, summary, ...refSection(report), ...routeSection(report)].join('\n');
}

function parseArgs(argv) {
  const o = { json: false, fetch: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--fetch') o.fetch = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a === '--home' || a === '--config-home' || a === '--root') {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      o[a.replace(/^--/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase())] = argv[++i];
    } else throw new Error(`unknown option: ${a}`);
  }
  return o;
}

function main(argv) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    console.error(`${e.message}\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    console.log(USAGE);
    return 0;
  }
  const report = doctor({ root: o.root, home: o.home, configHome: o.configHome, fetch: o.fetch });
  if (o.json) console.log(JSON.stringify(report, null, 2));
  else console.log(text(report));
  return report.ok ? 0 : 1;
}

if (isMain(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
