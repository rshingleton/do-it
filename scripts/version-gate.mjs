#!/usr/bin/env node
// Gates a release: a change under skills/, agents/ or hooks/ must move
// .claude-plugin/plugin.json's version, or a plugin user never receives it.
// Claude Code compares the manifest version, not file content
// (docs/adr/0013-routes-and-the-version-gate.md). Zero dependencies, Node ESM.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { git } from '../skills/do-it/scripts/git.mjs';
import { isMain } from '../skills/it-core/scripts/is-main.mjs';

const VERSION_FILE = '.claude-plugin/plugin.json';
const PACKAGE_FILE = 'package.json';
// The three paths the plugin carries: a change to any of them ships to a
// plugin user only when the version moves.
const GATED = ['skills/', 'agents/', 'hooks/'];

const USAGE = `Usage: node scripts/version-gate.mjs [--base <ref>] [--skip-missing-base] [--help]

Fails when the change since the base edits skills/, agents/ or hooks/ but
leaves ${VERSION_FILE}'s version at or below the base's. "Above" is compared
numerically as major.minor.patch against the higher of the merge base's version
and the base ref's own tip. A version absent at the base counts as a bump.

It also fails when ${PACKAGE_FILE} exists and its version differs from
${VERSION_FILE}'s.

The range starts at \`git merge-base <base> HEAD\`, is read against the working
tree, and adds untracked files, so uncommitted work counts.

--skip-missing-base prints one line and exits 0 when the base does not resolve,
so an offline or detached checkout still passes.

The base defaults to, in order:
  the event payload's before sha   on a push, when the payload names one
  HEAD^                            on a push with no payload
  origin/$GITHUB_BASE_REF          on a pull request
  origin/main                      otherwise

Exit codes:
  0  no gated change and the versions agree, or the version is above the base's
  1  a gated path changed and the version did not rise, or the two manifests disagree
  2  git cannot answer, a manifest is missing or does not parse, or an
     argument is bad
`;

// A push's payload names the tip it replaced, so one base covers every commit
// in the push. HEAD^ would read only the last commit, and an earlier gated
// change would slip past.
function eventBefore(env) {
  if (!env.GITHUB_EVENT_PATH) return null;
  try {
    const before = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'))?.before;
    const sha = typeof before === 'string' ? before.trim() : '';
    return /^[0-9a-f]{7,40}$/i.test(sha) && !/^0+$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

function defaultBase(env) {
  if (env.GITHUB_EVENT_NAME === 'push') return eventBefore(env) ?? 'HEAD^';
  if (env.GITHUB_EVENT_NAME === 'pull_request' && env.GITHUB_BASE_REF) return `origin/${env.GITHUB_BASE_REF}`;
  return 'origin/main';
}

// One git call through the repo's wrapper, as a plain answer: a run that never
// started (git absent) reads like a non-zero status, not a crash.
function ask(cwd, args) {
  try {
    const r = git(cwd, args);
    return { ok: r.status === 0, out: r.stdout || '', why: (r.stderr || '').trim() || `git ${args[0]} exited ${r.status}` };
  } catch (e) {
    return { ok: false, out: '', why: `git could not be run: ${e.message}` };
  }
}

// The version in a manifest's text, or null when it is missing, unparseable or
// carries no version: the gate cannot compare against either.
function versionOf(text) {
  let data;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
  const v = data?.version;
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function versionAt(root, rev) {
  const listed = ask(root, ['ls-tree', '--name-only', rev, '--', VERSION_FILE]);
  if (!listed.ok) return { error: listed.why };
  if (!listed.out.trim()) return { missing: true };
  const shown = ask(root, ['show', `${rev}:${VERSION_FILE}`]);
  if (!shown.ok) return { error: shown.why };
  const version = versionOf(shown.out);
  return version === null ? { error: `${VERSION_FILE} at ${rev} does not parse or carries no version` } : { version };
}

function versionOnDisk(root) {
  let text;
  try {
    text = readFileSync(path.join(root, VERSION_FILE), 'utf8');
  } catch {
    return { error: `${VERSION_FILE} is missing in the working tree` };
  }
  const version = versionOf(text);
  return version === null ? { error: `${VERSION_FILE} in the working tree does not parse or carries no version` } : { version };
}

// package.json's version when it exists: a missing file is not an error, since
// a checkout without one is not this repo.
function packageVersionOnDisk(root) {
  let text;
  try {
    text = readFileSync(path.join(root, PACKAGE_FILE), 'utf8');
  } catch {
    return { missing: true };
  }
  const version = versionOf(text);
  return version === null ? { error: `${PACKAGE_FILE} in the working tree does not parse or carries no version` } : { version };
}

// major.minor.patch as numbers, or null when it is some other shape. The gate
// reads a release number, so a prerelease tag falls back to inequality below.
function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compareVersion(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
  return 0;
}

function highestVersion(versions) {
  const parsed = versions.filter((v) => parseVersion(v));
  if (!parsed.length) return versions[0] ?? null;
  return parsed.reduce((top, v) => (compareVersion(v, top) > 0 ? v : top));
}

// True when `now` is above every base version. No base version (the manifest
// absent at the base) counts as a bump. A version that is not major.minor.patch
// has no numeric order, so only a change counts.
function isBump(now, bases) {
  return bases.every((b) => {
    const c = compareVersion(now, b);
    return c === null ? now !== b : c > 0;
  });
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--skip-missing-base') o.skipMissingBase = true;
    else if (a === '--base') {
      if (i + 1 >= argv.length) throw new Error('--base needs a value');
      o.base = argv[++i];
    } else throw new Error(`unknown argument: ${a}`);
  }
  return o;
}

// One line on stdout: the two versions and what moved.
function report(ok, before, now, gated) {
  const state = gated.length
    ? `${gated.length} gated ${gated.length === 1 ? 'file' : 'files'} changed (${gated.slice(0, 5).join(', ')}${gated.length > 5 ? `, +${gated.length - 5} more` : ''})`
    : 'no gated file changed';
  return `version-gate: ${ok ? 'pass' : 'fail'} - version ${before ?? 'absent'} -> ${now}, ${state}\n`;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${e.message}\n\n${USAGE}`);
    return 2;
  }
  if (opts.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const bad = (why) => {
    process.stderr.write(`version-gate: ${why}\n`);
    return 2;
  };

  const top = ask(process.cwd(), ['rev-parse', '--show-toplevel']);
  if (!top.ok) return bad(`git cannot answer: ${top.why}`);
  const root = top.out.trim();
  const base = opts.base ?? defaultBase(process.env);

  if (opts.skipMissingBase) {
    const found = ask(root, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]);
    if (!found.ok || !found.out.trim()) {
      process.stdout.write(`version-gate: skipped - base ${base} does not resolve here\n`);
      return 0;
    }
  }

  const mb = ask(root, ['merge-base', base, 'HEAD']);
  if (!mb.ok || !mb.out.trim()) return bad(`git cannot answer: no merge base for ${base} and HEAD (${mb.why})`);
  const mergeBase = mb.out.trim();

  // --no-renames: rename detection reports a moved file by its destination
  // only, so a skill moved out of skills/ would read as no gated change.
  // -z: without it git quotes a path holding a non-ASCII byte (core.quotepath),
  // so `skills/naïve-it/SKILL.md` would not match the prefix and pass.
  const diff = ask(root, ['diff', '--name-only', '-z', '--no-renames', mergeBase]);
  if (!diff.ok) return bad(`git cannot answer: ${diff.why}`);
  const untracked = ask(root, ['ls-files', '--others', '--exclude-standard', '-z']);
  if (!untracked.ok) return bad(`git cannot answer: ${untracked.why}`);

  const paths = new Set();
  for (const p of `${diff.out}\0${untracked.out}`.split('\0')) {
    const rel = p.replace(/\\/g, '/');
    if (rel) paths.add(rel);
  }
  const gated = [...paths].filter((p) => GATED.some((prefix) => p.startsWith(prefix))).sort();

  const baseVersions = [];
  const atMergeBase = versionAt(root, mergeBase);
  if (atMergeBase.error) return bad(`git cannot answer: ${atMergeBase.error}`);
  if (!atMergeBase.missing) baseVersions.push(atMergeBase.version);

  // The base ref's own tip: on a branch, main may have moved past the fork
  // point, and the version must rise above that too. A ref that does not
  // resolve has no tip to read; the merge base still stands.
  const baseTip = ask(root, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]);
  if (baseTip.ok && baseTip.out.trim()) {
    const tip = baseTip.out.trim();
    if (tip !== mergeBase) {
      const atTip = versionAt(root, tip);
      if (atTip.error) return bad(`git cannot answer: ${atTip.error}`);
      if (!atTip.missing) baseVersions.push(atTip.version);
    }
  }

  const before = highestVersion(baseVersions);
  const now = versionOnDisk(root);
  if (now.error) return bad(now.error);

  // The plugin version is hand-copied into package.json on every release; the
  // gate keeps the two equal so neither lags.
  const pkg = packageVersionOnDisk(root);
  if (pkg.error) return bad(pkg.error);
  if (!pkg.missing && pkg.version !== now.version) {
    process.stdout.write(`version-gate: fail - ${PACKAGE_FILE} is ${pkg.version}, ${VERSION_FILE} is ${now.version}; keep them equal\n`);
    return 1;
  }

  const ok = gated.length === 0 || isBump(now.version, baseVersions);
  process.stdout.write(report(ok, before, now.version, gated));
  return ok ? 0 : 1;
}

// Run only when executed: an import must not start a check.
if (isMain(import.meta.url)) process.exitCode = main();
