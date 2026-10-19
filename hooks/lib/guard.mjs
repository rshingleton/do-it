// Host-neutral hook decisions. The Claude Code entry points and the OpenCode
// plugin translate these results into their own protocols.

import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadConfig, isOn } from '../../skills/track-it/scripts/config.mjs';
import { loadChecks, scan, format, addedText, editedFile, editedFiles } from './checks.mjs';

export function setup(cwd) {
  const config = loadConfig({ cwd });
  const cfg = config.values;
  const enabled = isOn(cfg.DO_IT_HOOKS);
  const { rules, error } = enabled ? loadChecks(config.root, cfg.DO_IT_COMPLIANCE_DIR) : { rules: [], error: null };
  return { root: config.root, cfg, enabled, rules, error };
}

function split(findings) {
  return {
    block: findings.filter((f) => f.severity === 'HIGH'),
    warn: findings.filter((f) => f.severity !== 'HIGH'),
  };
}

// Before a file edit: block HIGH findings in the text being added, and any
// path rule (env files) on every file the edit touches.
export function beforeEdit(ctx, input) {
  if (!ctx.enabled) return { action: 'allow' };
  const files = editedFiles(input).map((f) => path.relative(ctx.root, path.resolve(ctx.root, f)));
  const rel = files[0] || '';
  const findings = scan(addedText(input), ctx.rules, rel);
  for (const other of files.slice(1)) findings.push(...scan('', ctx.rules, other));
  const { block, warn } = split(findings);
  if (block.length) {
    return {
      action: 'block',
      reason: `do-it compliance blocked this edit:\n${format(block, rel)}\nRemove the secret or file. If this is a false positive, add "do-it: allow" on that line and say why in your reply.`,
    };
  }
  if (warn.length) return { action: 'warn', message: `do-it compliance notes:\n${format(warn, rel)}` };
  return { action: 'allow' };
}

// After a file edit: run the configured per-file lint command.
export function afterEdit(ctx, input, { spawn = spawnSync } = {}) {
  if (!ctx.enabled || !ctx.cfg.DO_IT_LINT_CMD) return { action: 'allow' };
  const file = editedFile(input);
  if (!file) return { action: 'allow' };
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
    return { action: 'warn', message: `do-it lint timed out after ${ctx.cfg.DO_IT_HOOK_TIMEOUT}s: ${cmd}` };
  }
  if (res.status === 0) return { action: 'allow' };
  const out = `${res.stdout || ''}${res.stderr || ''}`.trim().slice(-3000);
  return { action: 'feedback', message: `do-it lint failed for ${path.relative(ctx.root, abs)} (\`${ctx.cfg.DO_IT_LINT_CMD}\`):\n${out}` };
}

// `git` at the start of a command (or after ; & | && ( ), any global options
// (-C dir, -c k=v, --no-pager), then the `commit` subcommand itself, not
// commit-tree or a quoted mention.
const GIT_COMMIT = /(?:^|[;&|(]\s*)git((?:\s+(?:-[Cc]\s+(?:'[^']*'|"[^"]*"|\S+)|--?[\w-]+(?:=\S+)?))*)\s+commit(?=\s|$)([^;&|]*)/;

export function parseGitCommit(command) {
  const m = String(command || '').match(GIT_COMMIT);
  if (!m) return null;
  const dir = m[1].match(/-C\s+(?:'([^']*)'|"([^"]*)"|(\S+))/);
  const args = m[2];
  // -a / --all, or a short-flag cluster that includes a (-am).
  const all = /(?:^|\s)(?:--all|-[A-Za-z]*a[A-Za-z]*)(?=\s|$)/.test(args);
  return { dir: dir ? dir[1] ?? dir[2] ?? dir[3] : null, all };
}

// Before a shell command: a git commit gets the change it will record
// scanned (the staged diff, or every tracked change for commit -a).
export function beforeShell(ctx, command, { git = defaultGit } = {}) {
  const commit = ctx.enabled ? parseGitCommit(command) : null;
  if (!commit) return { action: 'allow' };
  const cwd = commit.dir ? path.resolve(ctx.root, commit.dir) : ctx.root;
  const range = commit.all ? ['HEAD'] : ['--cached'];
  // -z and quotePath=false keep non-ASCII and quoted names intact.
  const staged = git(['-c', 'core.quotePath=false', 'diff', ...range, '--name-only', '-z', '--diff-filter=ACMR'], cwd)
    .split('\0')
    .filter(Boolean);
  const findings = [];
  for (const file of staged) {
    const added = git(['-c', 'core.quotePath=false', 'diff', ...range, '-U0', '--', file], cwd)
      .split('\n')
      .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
      .map((l) => l.slice(1))
      .join('\n');
    for (const f of scan(added, ctx.rules, file)) if (f.severity === 'HIGH') findings.push({ ...f, file });
  }
  if (!findings.length) return { action: 'allow' };
  return {
    action: 'block',
    reason: `do-it compliance blocked the commit:\n${findings.map((f) => format([f], f.file)).join('\n')}\nUnstage or fix these first.`,
  };
}

function defaultGit(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}
