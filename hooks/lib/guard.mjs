// Host-neutral hook decisions. The Claude Code entry points and the OpenCode
// plugin translate these results into their own protocols.

import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadConfig, isOn } from '../../skills/tracker/scripts/config.mjs';
import { loadChecks, scan, format, addedText, editedFile } from './checks.mjs';

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

// Before a file edit: block HIGH findings in the text being added.
export function beforeEdit(ctx, input) {
  if (!ctx.enabled) return { action: 'allow' };
  const file = editedFile(input);
  const rel = file ? path.relative(ctx.root, path.resolve(ctx.root, file)) : '';
  const { block, warn } = split(scan(addedText(input), ctx.rules, rel));
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
  const cmd = ctx.cfg.DO_IT_LINT_CMD.replaceAll('{file}', JSON.stringify(abs));
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

const GIT_COMMIT = /(^|[;&|]\s*|\s)git\s+(-[^\s]+\s+)*commit\b/;

// Before a shell command: a git commit gets the staged diff scanned.
export function beforeShell(ctx, command, { git = defaultGit } = {}) {
  if (!ctx.enabled || !GIT_COMMIT.test(command || '')) return { action: 'allow' };
  const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR'], ctx.root).split('\n').filter(Boolean);
  const findings = [];
  for (const file of staged) {
    const added = git(['diff', '--cached', '-U0', '--', file], ctx.root)
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
