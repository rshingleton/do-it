// The change since a base ref: tracked edits plus untracked files, with some
// paths excluded. The work item's fingerprint hashes it; prove-it records the
// hash and ship-it compares it to detect code that moved after the audit.
// addedLines gives the lines a change adds, for the commit guard
// (hooks/lib/guard.mjs) and guard-it's scan.mjs.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export function hasObject(cwd, id) {
  return git(cwd, ['cat-file', '-e', id]).status === 0;
}

function git(cwd, args, encoding = 'utf8', env = process.env, limits = {}) {
  const r = spawnSync('git', args, { cwd, encoding, env, maxBuffer: 512 * 1024 * 1024, ...limits });
  if (r.error) throw r.error;
  return r;
}

// Resolve the base to a commit, or the empty tree before the first commit.
// An unknown base is an error, never an empty change.
export function resolveBase(top, base) {
  const r = git(top, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]);
  if (r.status === 0) return r.stdout.trim();
  // An item started before the first commit has the empty tree as its base.
  if (base === EMPTY_TREE) return EMPTY_TREE;
  if (git(top, ['rev-parse', '--verify', '--quiet', 'HEAD']).status !== 0) return EMPTY_TREE;
  throw new Error(`unknown base ref: ${base}`);
}

// Runs from the repo top level whatever `cwd` is, so the result is the same
// from any directory. `exclude` paths are relative to the top level.
export function changeset(cwd, base, { exclude = [] } = {}) {
  const topRes = git(cwd, ['rev-parse', '--show-toplevel']);
  if (topRes.status !== 0) throw new Error(`not a git repository: ${cwd}`);
  const top = topRes.stdout.trim();
  const resolved = resolveBase(top, base);
  const spec = ['--', '.', ...exclude.map((p) => `:(exclude)${p}`)];
  const diff = git(top, ['diff', '--binary', resolved, ...spec], 'buffer');
  if (diff.status !== 0) throw new Error(`git diff failed: ${diff.stderr}`);
  const others = git(top, ['ls-files', '-z', '--others', '--exclude-standard', ...spec], 'buffer');
  if (others.status !== 0) throw new Error(`git ls-files failed: ${others.stderr}`);
  const untracked = others.stdout.toString('utf8').split('\0').filter(Boolean);
  return { top, base: resolved, diff: diff.stdout, untracked };
}

// Repo config must not swap, colour or narrow what a scan reads. diff.relative
// is overridden as config, not with --no-relative, which git before 2.28
// rejects.
const SCAN_GIT = ['-c', 'core.quotePath=false', '-c', 'diff.relative=false', 'diff'];
const SCAN_FLAGS = ['--no-renames', '--diff-filter=d', '--no-ext-diff', '--no-textconv', '--no-color', '--submodule=short', '-U0', '--inter-hunk-context=0'];
// shortcut: a file whose diff is over FILE_CAP, takes over FILE_TIME or fails
// gets path rules only (its content is not scanned), and so does a binary
// once BINARY_BUDGET is spent: a file git treats as binary is read as text,
// and a 2 MB one takes about 1.6 s, so one hook may spend only the budget on
// them before the 15 s hook timeout lets the commit through; scan such files
// in chunks or in the background if they ever need content rules beyond it.
// Files with a textconv driver share that budget for their driven view; past
// it they keep their raw lines and path rules.
const FILE_CAP = 1024 * 1024;
const FILE_TIME = 2000;
// shortcut: plain text files are diffed CHUNK names per git call; a chunk over
// CHUNK_CAP, past CHUNK_TIME, or that fails falls back to one diff per file,
// with no total cap on those, so a repo whose chunks keep failing is slow; raise
// the limits, or add a total cap, when a real repo hits it.
const CHUNK = 500;
const CHUNK_CAP = 64 * 1024 * 1024;
const CHUNK_TIME = 3000;
// How long one hook may spend reading files git treats as binary.
export const BINARY_BUDGET = 6000;

// What a change adds, file by file: [{ file, lines: [{ n, text }] }], `file`
// relative to the top level, `n` the line in the new version. `against` is
// 'staged' (the index against HEAD) or a base ref; `paths` are pathspecs
// relative to `cwd` that narrow it. Every file but a deleted one is listed,
// with no lines when it adds none (a mode change, a binary, or a file past
// the limits above), so path rules still see it. A file git treats as binary
// is read as text while `budget` ({ deadline }, ms since epoch; default
// BINARY_BUDGET from now) lasts, and a file with a textconv driver is read
// raw and, while the budget lasts, through the driver. `untracked` adds every
// untracked file in the repo, regular files read whole (and, with a driver,
// through it too); an array of pathspecs
// (relative to `cwd`) adds only the untracked files they match, and with
// `ignored` those the repo ignores too (what `git add -f` stages). Throws when
// the listing fails or the base is unknown.
export function addedLines(cwd, { against = 'HEAD', paths = [], untracked = false, ignored = false, budget = null } = {}) {
  const deadline = (budget ?? { deadline: Date.now() + BINARY_BUDGET }).deadline;
  const topRes = git(cwd, ['rev-parse', '--show-toplevel']);
  if (topRes.status !== 0) throw new Error(`not a git repository: ${cwd}`);
  const top = topRes.stdout.trim();
  const range = against === 'staged' ? '--cached' : resolveBase(top, against);
  // GIT_DIFF_OPTS would override -U0 and bring context lines in.
  const env = { ...process.env };
  delete env.GIT_DIFF_OPTS;
  // Output, or null when it is over the size or time limit.
  const diff = (extra, spec, limits, flags = SCAN_FLAGS) => {
    try {
      const r = git(cwd, [...SCAN_GIT, range, ...flags, ...extra, '--', ...spec], 'utf8', env, limits);
      if (r.status !== 0) throw new Error(`git diff failed: ${r.stderr}`);
      return r.stdout;
    } catch (e) {
      if (e.code === 'ENOBUFS' || e.code === 'ETIMEDOUT') return null;
      throw e;
    }
  };
  // -z names come back exact. Each file is then diffed on its own, so its
  // output holds only its own hunks and no section header is ever parsed.
  const names = diff(['--name-only', '-z'], paths).split('\0').filter(Boolean);
  // One file's failure costs only that file's content, never the listing.
  // stderr is ignored: a driver's noise must not fill the buffer and cost the
  // content, and a failed diff has nothing to say that is used.
  const own = (file, flags, timeout = FILE_TIME) => {
    try {
      return diff([], [`:(top,literal)${file}`], { maxBuffer: FILE_CAP, timeout, stdio: ['ignore', 'pipe', 'ignore'] }, flags);
    } catch {
      return null;
    }
  };
  // The untracked files to add, listed before the driver lookup so one
  // check-attr call covers them and the tracked names.
  let others = [];
  if (untracked) {
    const listing = Array.isArray(untracked)
      ? git(cwd, ['-c', 'core.quotePath=false', 'ls-files', '-z', '--full-name', '--others', ...(ignored ? [] : ['--exclude-standard']), '--', ...untracked])
      : git(top, ['-c', 'core.quotePath=false', 'ls-files', '-z', '--others', '--exclude-standard', '--', '.']);
    if (listing.status !== 0) throw new Error(`git ls-files failed: ${listing.stderr}`);
    others = listing.stdout.split('\0').filter(Boolean);
  }
  // The files whose diff driver has a textconv command, looked up once, when
  // the first file is read. A failed lookup counts every file as driven:
  // a second diff costs time, a missed driver costs content.
  let driven;
  const hasTextconv = (file) => {
    if (!driven) {
      try {
        const cfg = git(top, ['config', '-z', '--get-regexp', '^diff\\..*\\.textconv$'], 'utf8', env);
        if (cfg.status > 1) throw new Error(cfg.stderr);
        const drivers = new Set(cfg.stdout.split('\0').filter(Boolean).map((e) => e.split('\n')[0].slice('diff.'.length, -'.textconv'.length)));
        driven = new Set();
        if (drivers.size) {
          const attrs = git(top, ['check-attr', '-z', '--stdin', 'diff'], 'utf8', env, { input: [...names, ...others].join('\0') });
          if (attrs.status !== 0) throw new Error(attrs.stderr);
          const t = attrs.stdout.split('\0');
          for (let i = 0; i + 2 < t.length; i += 3) if (drivers.has(t[i + 2])) driven.add(t[i]);
        }
      } catch {
        driven = { has: () => true };
      }
    }
    return driven.has(file);
  };
  // The time left for a driven or binary read, or 0 when the budget is spent.
  const timeLeft = () => Math.max(0, Math.min(FILE_TIME, deadline - Date.now()));
  // The plain text diffs of every name, one git call per chunk: file ->
  // output, null when over FILE_CAP. Every line of a hunk starts with + - space
  // or \, so a line starting `diff --git ` is always a new file's section.
  // A chunk that cannot be read, or whose sections do not match its names,
  // is left out and its files are read one by one.
  const plain = new Map();
  for (let i = 0; i < names.length; i += CHUNK) {
    const group = names.slice(i, i + CHUNK);
    try {
      const out = diff([], group.map((f) => `:(top,literal)${f}`), { maxBuffer: CHUNK_CAP, timeout: CHUNK_TIME, stdio: ['ignore', 'pipe', 'ignore'] });
      if (out === null) continue;
      const sections = sectionsOf(out);
      // Each section must open with its own name's header: a type change gives
      // a file two sections and an unmerged path none, so counts alone can line up wrong.
      if (sections.length !== group.length || sections.some((sec, j) => !sec.startsWith(`diff --git a/${group[j]} b/${group[j]}\n`))) continue;
      group.forEach((f, j) => plain.set(f, sections[j].length > FILE_CAP ? null : sections[j]));
    } catch {
      // Read these one by one below.
    }
  }
  // textconv stays off here so it cannot hide a text file's lines.
  const merge = (lines, text) => {
    const seen = new Set(lines.map((l) => `${l.n}\0${l.text}`));
    for (const l of hunkLines(text)) if (!seen.has(`${l.n}\0${l.text}`)) lines.push(l);
  };
  const files = names.map((file) => {
    let out = plain.has(file) ? plain.get(file) : own(file, SCAN_FLAGS);
    // A binary has no lines until it is read as text, within the budget.
    const left = timeLeft();
    if (out && !/^@@ /m.test(out) && /^Binary files /m.test(out) && left > 0) {
      out = own(file, [...SCAN_FLAGS, '--text'], left) ?? out;
    }
    const lines = hunkLines(out ?? '');
    // A driver may also reveal what the raw view does not: read both, while
    // the budget lasts.
    if (hasTextconv(file) && timeLeft() > 0) {
      merge(lines, own(file, SCAN_FLAGS.filter((f) => f !== '--no-textconv'), timeLeft()) ?? '');
    }
    return { file, lines };
  });
  for (const file of others) {
    let text = '';
    let regular = false;
    try {
      if (fs.lstatSync(path.join(top, file)).isFile()) {
        regular = true;
        text = fs.readFileSync(path.join(top, file), 'utf8');
      }
    } catch {
      // Gone since the listing: path rules still apply.
    }
    const lines = text ? text.replace(/\n$/, '').split('\n').map((t, j) => ({ n: j + 1, text: t })) : [];
    // git diff --no-index exits 1 when the files differ, which is the success case here.
    if (regular && hasTextconv(file) && timeLeft() > 0) {
      try {
        const r = git(top, ['-c', 'core.quotePath=false', 'diff', '--no-index', '--textconv', '--no-ext-diff', '--no-color', '-U0', '--', '/dev/null', file], 'utf8', env, { maxBuffer: FILE_CAP, timeout: timeLeft(), stdio: ['ignore', 'pipe', 'ignore'] });
        if (r.status === 1) merge(lines, r.stdout);
      } catch {
        // The raw lines stand.
      }
    }
    files.push({ file, lines });
  }
  return files;
}

// A multi-file patch cut into one section per `diff --git ` line. Split on \n
// only: a regex ^ would also cut after \r or U+2028 inside an added line.
function sectionsOf(patch) {
  const out = [];
  let from = -1;
  for (let at = 0; at < patch.length; ) {
    if (patch.startsWith('diff --git ', at)) {
      if (from >= 0) out.push(patch.slice(from, at));
      from = at;
    }
    const nl = patch.indexOf('\n', at);
    at = nl < 0 ? patch.length : nl + 1;
  }
  if (from >= 0) out.push(patch.slice(from));
  return out;
}

// The + lines of one file's patch, numbered from each hunk's new start. Each
// hunk says how many new-side lines it holds (added and context), so a +++
// header is never taken, an added line that starts with ++ always is, and
// context lines keep the numbering right.
function hunkLines(patch) {
  const out = [];
  let n = 0;
  let left = 0;
  for (const line of patch.split('\n')) {
    const h = left === 0 && line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (h) {
      n = Number(h[1]);
      left = h[2] === undefined ? 1 : Number(h[2]);
    } else if (left > 0 && (line[0] === '+' || line[0] === ' ' || line === '')) {
      // diff.suppressBlankEmpty prints a blank context line as ''.
      if (line[0] === '+') out.push({ n, text: line.slice(1) });
      n++;
      left--;
    }
  }
  return out;
}

// Hash of the change: the binary diff, then each untracked file's name and
// content (symlinks by target, directories such as nested repos by name),
// as a git blob id. Matches the shell version it replaced byte for byte.
export function fingerprint(cwd, base, opts) {
  const { top, diff, untracked } = changeset(cwd, base, opts);
  const parts = [diff];
  for (const name of untracked) {
    parts.push(Buffer.from(`${name}\n`));
    const file = path.join(top, name);
    let st;
    try {
      st = fs.lstatSync(file);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) parts.push(Buffer.from(`${fs.readlinkSync(file)}\n`));
    else if (st.isFile()) parts.push(fs.readFileSync(file));
  }
  const data = Buffer.concat(parts);
  return crypto.createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
}

// The working tree as a git tree object, untracked files included, written
// through a throwaway index: no commit, and the user's index is untouched.
// ship-it records it so a later run can show what the review changed.
export function snapshot(cwd, { exclude = [] } = {}) {
  const top = git(cwd, ['rev-parse', '--show-toplevel']).stdout.trim();
  if (!top) throw new Error(`not a git repository: ${cwd}`);
  const index = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'do-it-snap-')), 'index');
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    // splitIndex off: a throwaway index must not leave shared parts in .git.
    const run = (args) => {
      const r = git(top, ['-c', 'core.splitIndex=false', ...args], 'utf8', env);
      if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${r.stderr}`);
      return r.stdout.trim();
    };
    // Start from a copy of the real index: its stat data spares re-reading
    // every tracked file. Without one, start from HEAD (or nothing).
    const fromHead = () => {
      fs.rmSync(index, { force: true });
      if (git(top, ['rev-parse', '--verify', '--quiet', 'HEAD']).status === 0) run(['read-tree', 'HEAD']);
    };
    const add = () => run(['add', '-A', '--', '.', ...exclude.map((p) => `:(exclude)${p}`)]);
    const real = path.resolve(top, git(top, ['rev-parse', '--git-path', 'index']).stdout.trim());
    if (fs.existsSync(real)) {
      fs.copyFileSync(real, index);
      // Keep the index's own mtime: git re-checks "racily clean" entries
      // against it, and a fresh mtime would hide same-size edits.
      const st = fs.statSync(real);
      fs.utimesSync(index, st.atime, st.mtime);
      try {
        add();
      } catch {
        // A copy git cannot use (corrupt, or an unknown index format): start from HEAD.
        fromHead();
        add();
      }
    } else {
      fromHead();
      add();
    }
    return run(['write-tree']);
  } finally {
    fs.rmSync(path.dirname(index), { recursive: true, force: true });
  }
}

// Files that differ between two snapshots, with a diffstat.
export function treeDiff(cwd, from, to) {
  const names = git(cwd, ['diff', '--name-status', from, to]);
  if (names.status !== 0) throw new Error(`git diff failed: ${names.stderr}`);
  const stat = git(cwd, ['diff', '--stat', from, to]).stdout.trim();
  const files = names.stdout.split('\n').filter(Boolean).map((l) => {
    const [status, ...rest] = l.split('\t');
    return { status, path: rest.join(' -> ') };
  });
  return { files, stat };
}
