// Host-neutral hook decisions. The Claude Code entry points and the OpenCode
// plugin translate these results into their own protocols.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadConfig, isOn } from '../../skills/track-it/scripts/config.mjs';
import { loadChecks, scan, format, editParts } from './checks.mjs';
import { addedLines, BINARY_BUDGET } from '../../skills/do-it/scripts/changeset.mjs';
import { parseGitCommits } from './shell.mjs';

export { parseGitCommit, parseGitCommits } from './shell.mjs';

export function setup(cwd, env = process.env) {
  const config = loadConfig({ cwd, env });
  const cfg = config.values;
  const enabled = isOn(cfg.DO_IT_HOOKS);
  const checks = enabled ? loadChecks(config.root, cfg.DO_IT_COMPLIANCE_DIR) : { rules: [], error: null };
  // One notice for the session: config warnings and skipped rules.
  const error = [...config.warnings, checks.error].filter(Boolean).join('\n') || null;
  return { root: config.root, cwd: path.resolve(cwd), cfg, enabled, rules: checks.rules, error };
}

function split(findings) {
  return {
    block: findings.filter((f) => f.severity === 'HIGH'),
    warn: findings.filter((f) => f.severity !== 'HIGH'),
  };
}

// Before a file edit: block HIGH findings in the text being added to each
// file, scanned under that file's own path, and any path rule (env files) on
// every file the edit touches.
export function beforeEdit(ctx, input) {
  if (!ctx.enabled) return { action: 'allow' };
  const findings = [];
  for (const { file, added } of editParts(input)) {
    const rel = file && path.relative(ctx.root, path.resolve(ctx.root, file));
    for (const f of scan(added, ctx.rules, rel)) findings.push({ ...f, file: rel });
  }
  const list = (fs) => fs.map((f) => format([f], f.file)).join('\n');
  const { block, warn } = split(findings);
  if (block.length) {
    return {
      action: 'block',
      reason: `do-it compliance blocked this edit:\n${list(block)}\nRemove the secret or file. If this is a false positive, add "do-it: allow" on that line and say why in your reply.`,
    };
  }
  if (warn.length) return { action: 'warn', message: `do-it compliance notes:\n${list(warn)}` };
  return { action: 'allow' };
}

// After a file edit: run the configured per-file lint command on every file
// the edit leaves behind, in edit order.
// shortcut: each file gets its own timeout and there is no total cap, so a
// large patch can stall the hook; add a total budget when that bites.
export function afterEdit(ctx, input, { spawn = spawnSync } = {}) {
  if (!ctx.enabled || !ctx.cfg.DO_IT_LINT_CMD) return { action: 'allow' };
  const messages = [];
  let failed = false;
  for (const { file, gone } of editParts(input)) {
    if (!file || gone) continue;
    const abs = path.resolve(ctx.root, file);
    // Single quotes: the shell expands $ and backticks inside double quotes,
    // and paths like app/routes/$id.tsx are common.
    const cmd = ctx.cfg.DO_IT_LINT_CMD.replaceAll('{file}', `'${abs.replaceAll("'", `'\\''`)}'`);
    const res = spawn(cmd, {
      cwd: ctx.root,
      shell: true,
      encoding: 'utf8',
      timeout: Number(ctx.cfg.DO_IT_HOOK_TIMEOUT || 20) * 1000,
    });
    if (res.error?.code === 'ETIMEDOUT' || res.signal) {
      messages.push(`do-it lint timed out after ${ctx.cfg.DO_IT_HOOK_TIMEOUT}s: ${cmd}`);
    } else if (res.status !== 0) {
      const out = `${res.stdout || ''}${res.stderr || ''}`.trim().slice(-3000);
      messages.push(`do-it lint failed for ${path.relative(ctx.root, abs)} (\`${ctx.cfg.DO_IT_LINT_CMD}\`):\n${out}`);
      failed = true;
    }
  }
  if (!messages.length) return { action: 'allow' };
  return { action: failed ? 'feedback' : 'warn', message: messages.join('\n\n') };
}

// A word the shell would expand before git sees it.
const UNEXPANDED = /[$`]|^~/;

// The files a commit would record, each with its added lines, or null when
// the listing cannot be trusted (git failed, or named paths matched nothing).
// `stages` are the paths (or `all`) that earlier commands in the same line put
// in the index: their working-tree changes and new files count as staged.
function listChanges(cwd, all, paths, stages, budget) {
  try {
    const staged = addedLines(cwd, { against: 'staged', budget });
    // `git add -f` stages ignored files, so the listing reads them too.
    const ignored = stages.force;
    if (stages.all) return staged.concat(addedLines(cwd, ignored ? { untracked: ['.'], ignored, budget } : { untracked: true, budget }));
    const untracked = stages.paths.length ? stages.paths : false;
    if (all) return staged.concat(addedLines(cwd, { untracked, ignored, budget }));
    const spec = [...paths, ...stages.paths];
    if (!spec.length) return staged;
    const named = addedLines(cwd, { paths: spec, untracked, ignored, budget });
    return named.length || !paths.length ? staged.concat(named) : null;
  } catch {
    return null;
  }
}

// Where the shell may be when a commit runs, given the cds before it. A cd in
// a subshell, a pipeline or quoted text does not persist, and the hook cannot
// tell which: try every ordered subset of the cds, each relative one resolved
// from the last cd kept. Deduped by directory.
// shortcut: past CD_SUBSET_MAX cds only each step of the chain is tried, plus
// the repo root, as subsets double per cd; raise the cap or read the shell's
// real structure.
const CD_SUBSET_MAX = 4;
function shellDirs(start, cds) {
  const dirs = new Set([start]);
  const step = (from, to) => (to ? path.resolve(from, to) : from);
  if (cds.length > CD_SUBSET_MAX) {
    let cur = start;
    for (const to of cds) dirs.add((cur = step(cur, to)));
    return [...dirs];
  }
  for (let mask = 1; mask < 1 << cds.length; mask++) {
    let cur = start;
    cds.forEach((to, i) => {
      if (mask & (1 << i)) cur = step(cur, to);
    });
    dirs.add(cur);
  }
  return [...dirs];
}

// Before a shell command: every git commit in it gets the change it will
// record scanned: the staged diff, plus the working tree against HEAD for the
// paths it names, or for every tracked change with commit -a. When a commit
// cannot be resolved for sure, every tracked change is scanned from the repo
// root: errors over-scan, never under-scan.
export function beforeShell(ctx, command) {
  const commits = ctx.enabled ? parseGitCommits(command) : [];
  if (!commits.length) return { action: 'allow' };
  const start = ctx.cwd || ctx.root;
  const findings = [];
  const seen = new Set();
  const listed = new Set();
  // One time budget for reading binaries across every listing this hook makes.
  const budget = { deadline: Date.now() + BINARY_BUDGET };
  let rootDone = false;
  const report = (files) => {
    for (const { file, lines } of files) {
      for (const f of scan(lines.map((l) => l.text).join('\n'), ctx.rules, file)) {
        const key = `${file}:${f.id}`;
        if (f.severity !== 'HIGH' || seen.has(key)) continue;
        seen.add(key);
        // scan() numbers the added lines; map back to the line in the file.
        findings.push({ ...f, file, line: f.line && lines[f.line - 1].n });
      }
    }
  };
  const fromRoot = () => {
    if (rootDone) return;
    rootDone = true;
    report(listChanges(ctx.root, true, [], { all: false, paths: [], force: false }, budget) || []);
  };
  for (const commit of commits) {
    // The command's paths are relative to the shell's directory (after any cd
    // before the commit), then -C.
    // A stage in another directory or repo than the commit's is read as `all`.
    const stages = { all: false, paths: [], force: false };
    for (const st of commit.stages) {
      if (!st.all && !st.paths.length) continue;
      if (st.all || st.dir !== commit.dir || st.cds.join('\0') !== commit.cds.join('\0')) stages.all = true;
      else stages.paths.push(...st.paths);
      if (st.force) stages.force = true;
    }
    const unsure =
      commit.bail ||
      commit.cds.some((to) => to === null || UNEXPANDED.test(to)) ||
      [commit.dir ?? '', ...commit.paths, ...stages.paths].some((w) => UNEXPANDED.test(w));
    if (unsure) {
      fromRoot();
      continue;
    }
    if (commit.cds.length > CD_SUBSET_MAX) fromRoot();
    for (const shell of shellDirs(start, commit.cds)) {
      const cwd = commit.dir ? path.resolve(shell, commit.dir) : shell;
      const key = `${cwd}\0${commit.all}\0${commit.paths.join('\0')}\0${stages.all}\0${stages.force}\0${stages.paths.join('\0')}`;
      if (listed.has(key)) continue;
      listed.add(key);
      const files = listChanges(cwd, commit.all, commit.paths, stages, budget);
      if (files) report(files);
      else fromRoot();
    }
  }
  if (!findings.length) return { action: 'allow' };
  return {
    action: 'block',
    reason: `do-it compliance blocked the commit:\n${findings.map((f) => format([f], f.file)).join('\n')}\nUnstage or fix these first.`,
  };
}
