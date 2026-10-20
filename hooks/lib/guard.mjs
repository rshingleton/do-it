// Host-neutral hook decisions. The Claude Code entry points and the OpenCode
// plugin translate these results into their own protocols.

import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadConfig, isOn } from '../../skills/track-it/scripts/config.mjs';
import { loadChecks, scan, format, addedText, editedFile, editedFiles } from './checks.mjs';
import { EMPTY_TREE } from '../../skills/do-it/scripts/changeset.mjs';

export function setup(cwd) {
  const config = loadConfig({ cwd });
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
// commit-tree or a quoted mention. Its arguments are read by commandWords.
const GIT_COMMIT = /(?:^|[;&|(]\s*)git((?:\s+(?:-[Cc]\s+(?:'[^']*'|"[^"]*"|\S+)|--?[\w-]+(?:=\S+)?))*)\s+commit(?=\s|$)/;

// git commit options that take a value as the next argument (or attached).
const SHORT_WITH_VALUE = 'mFCct';
const LONG_WITH_VALUE = new Set([
  'message', 'file', 'author', 'date', 'fixup', 'squash', 'cleanup', 'trailer',
  'template', 'reuse-message', 'reedit-message',
]);

// The shell words of one command, up to the first unquoted ; & | or newline,
// quotes removed and nothing expanded. $(...), backticks and heredocs inside
// them stay part of their word; redirects and their targets are dropped.
// `sure` is false when the quoting never closes.
function commandWords(s) {
  const words = [];
  let word = null;
  let sure = true;
  let target = false; // the next word is a redirect target, not an argument
  const end = () => {
    if (word !== null && !target) words.push(word);
    if (word !== null) target = false;
    word = null;
  };
  // Index just past the quote, backtick or ) that closes what starts at i.
  const close = (ch, i) => {
    const j = s.indexOf(ch, i);
    if (j < 0) sure = false;
    return j < 0 ? s.length : j + 1;
  };
  const closeDouble = (i) => {
    while (i < s.length && s[i] !== '"') {
      if (s[i] === '\\') i += 2;
      else if (s[i] === '$' && s[i + 1] === '(') i = closeSub(i + 2);
      else if (s[i] === '`') i = close('`', i + 1);
      else i++;
    }
    if (i >= s.length) sure = false;
    return i + 1;
  };
  // A heredoc body is literal: skip from `<<` to the line holding the delimiter.
  const closeHeredoc = (i) => {
    const head = s.slice(i).match(/^<<-?\s*(['"]?)(\w+)\1[^\n]*\n/);
    if (!head) return i + 2;
    const body = i + head[0].length;
    const m = s.slice(body).match(new RegExp(`(?:^|\\n)\\t*${head[2]}(?=\\n|\\)|$)`));
    return m ? body + m.index + m[0].length : s.length;
  };
  function closeSub(i) {
    let depth = 1;
    while (i < s.length) {
      const c = s[i];
      if (c === '<' && s[i + 1] === '<') i = closeHeredoc(i);
      else if (c === "'") i = close("'", i + 1);
      else if (c === '"') i = closeDouble(i + 1);
      else if (c === '`') i = close('`', i + 1);
      else if (c === '\\') i += 2;
      else if (c === '(') depth++, i++;
      else if (c === ')' && --depth === 0) return i + 1;
      else i++;
    }
    sure = false;
    return s.length;
  }

  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '<' && s[i + 1] === '<' && s[i + 2] !== '<') {
      // Its body starts after the newline, where this command ends anyway;
      // skip only the operator and delimiter, the rest of the line is args.
      end();
      i += s.slice(i).match(/^<<-?\s*(?:'[^'\n]*'|"[^"\n]*"|[^\s;&|<>]*)/)[0].length;
      continue;
    }
    if (c === '&' && s[i + 1] === '>') {
      end();
      i++;
    }
    if (s[i] === '<' || s[i] === '>') {
      // A file descriptor number before the operator (2>) belongs to it.
      if (word !== null && /^\d+$/.test(word)) word = null;
      end();
      i++;
      while (/[<>|]/.test(s[i] ?? '')) i++;
      const dup = s.slice(i).match(/^&(\d+|-)/);
      if (dup) i += dup[0].length;
      else target = true;
      continue;
    }
    if (/[;&|\n]/.test(c)) break;
    if (/\s/.test(c)) {
      end();
      i++;
      continue;
    }
    word ??= '';
    let next = i + 1;
    if (c === "'") {
      next = close("'", i + 1);
      word += s.slice(i + 1, next - 1);
    } else if (c === '$' && s[i + 1] === "'") {
      // ANSI-C quoting: backslash escapes, including \'.
      let j = i + 2;
      while (j < s.length && s[j] !== "'") j += s[j] === '\\' ? 2 : 1;
      if (j >= s.length) sure = false;
      next = j + 1;
      word += s.slice(i + 2, j).replace(/\\(.)/gs, '$1');
    } else if (c === '"') {
      next = closeDouble(i + 1);
      word += s.slice(i + 1, next - 1).replace(/\\(["\\$`])/g, '$1');
    } else if (c === '$' && s[i + 1] === '(') {
      next = closeSub(i + 2);
      word += s.slice(i, next);
    } else if (c === '`') {
      next = close('`', i + 1);
      word += s.slice(i, next);
    } else if (c === '\\') {
      next = i + 2;
      word += s[i + 1] ?? '';
    } else {
      word += c;
    }
    i = next;
  }
  end();
  return { words, sure };
}

export function parseGitCommit(command) {
  const text = String(command || '');
  const m = text.match(GIT_COMMIT);
  if (!m) return null;
  const dir = m[1].match(/-C\s+(?:'([^']*)'|"([^"]*)"|(\S+))/);
  // Directory changes earlier in the command, in order; null where the
  // target cannot be read (bare cd, cd -, popd).
  const cds = [];
  for (const c of text.slice(0, m.index).matchAll(/(?:^|[;&|({]\s*|\b(?:then|do|else)\s+)(?:(?:builtin|command)\s+)?(cd|pushd|popd)(?=\s|$)/g)) {
    const target = c[1] === 'popd' ? undefined : commandWords(text.slice(c.index + c[0].length)).words[0];
    cds.push(target && target !== '-' ? target : null);
  }
  const { words: args, sure } = commandWords(text.slice(m.index + m[0].length));
  // Quoting that never closes cannot be read: scan every tracked change.
  let all = !sure;
  const paths = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      paths.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const [name, value] = a.slice(2).split(/=(.*)/s);
      if (name === 'all') all = true;
      // Paths listed in a file are not visible here: scan everything.
      else if (name === 'pathspec-from-file') all = true;
      if (LONG_WITH_VALUE.has(name) && value === undefined) i++;
    } else if (a.startsWith('-') && a.length > 1) {
      // A short cluster (-am): the first value-taking letter ends it, and
      // takes the rest of the cluster or the next word as its value.
      for (let j = 1; j < a.length; j++) {
        if (a[j] === 'a') all = true;
        if (SHORT_WITH_VALUE.includes(a[j])) {
          if (j === a.length - 1) i++;
          break;
        }
      }
    } else {
      paths.push(a);
    }
  }
  return { dir: dir ? dir[1] ?? dir[2] ?? dir[3] : null, all, paths, cds };
}

// A word the shell would expand before git sees it.
const UNEXPANDED = /[$`]|^~/;

// The files each range would record ({ cwd, ranges: [[rev, files]] }), or
// null when the listing cannot be trusted (git failed, or named paths matched
// nothing).
function listChanges(git, cwd, all, paths) {
  // Before the first commit there is no HEAD; diff against the empty tree.
  const head = (git(['rev-parse', '--verify', '--quiet', 'HEAD'], cwd) ?? '').trim() || EMPTY_TREE;
  const ranges = [['--cached']];
  if (all) ranges.push([head]);
  else if (paths.length) ranges.push([head, '--', ...paths]);
  const out = [];
  for (const [rev, ...spec] of ranges) {
    // -z and quotePath=false keep non-ASCII and quoted names intact.
    const listed = git(['-c', 'core.quotePath=false', 'diff', rev, '--name-only', '-z', '--diff-filter=ACMR', ...spec], cwd);
    if (listed === null) return null;
    const files = listed.split('\0').filter(Boolean);
    if (spec.length && !files.length) return null;
    out.push([rev, files]);
  }
  return { cwd, ranges: out };
}

// Before a shell command: a git commit gets the change it will record
// scanned: the staged diff, plus the working tree against HEAD for the
// paths it names, or for every tracked change with commit -a. When the
// command cannot be resolved for sure, every tracked change is scanned from
// the repo root: errors over-scan, never under-scan.
export function beforeShell(ctx, command, { git = defaultGit } = {}) {
  const commit = ctx.enabled ? parseGitCommit(command) : null;
  if (!commit) return { action: 'allow' };
  // The command's paths are relative to the shell's directory (after any cd
  // before the commit), then -C.
  const unsure =
    commit.cds.some((to) => to === null || UNEXPANDED.test(to)) ||
    [commit.dir ?? '', ...commit.paths].some((w) => UNEXPANDED.test(w));
  const start = ctx.cwd || ctx.root;
  // A cd in a subshell, a pipeline or quoted text does not persist, and the
  // hook cannot tell which: scan from every step of the cd chain.
  const shells = [start];
  for (const to of commit.cds) {
    const next = to ? path.resolve(shells[shells.length - 1], to) : shells[shells.length - 1];
    if (!shells.includes(next)) shells.push(next);
  }
  const findings = [];
  const seen = new Set();
  for (const shell of shells) {
    const cwd = commit.dir ? path.resolve(shell, commit.dir) : shell;
    const changes = (!unsure && listChanges(git, cwd, commit.all, commit.paths)) ||
      listChanges(git, ctx.root, true, []) || { cwd, ranges: [] };
    for (const [rev, files] of changes.ranges) {
      for (const file of files) {
        // Listed names are relative to the repo top, whatever cwd is.
        const added = (git(['-c', 'core.quotePath=false', 'diff', rev, '-U0', '--', `:(top,literal)${file}`], changes.cwd) ?? '')
          .split('\n')
          .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
          .map((l) => l.slice(1))
          .join('\n');
        for (const f of scan(added, ctx.rules, file)) {
          const key = `${file}:${f.id}`;
          if (f.severity !== 'HIGH' || seen.has(key)) continue;
          seen.add(key);
          findings.push({ ...f, file });
        }
      }
    }
  }
  if (!findings.length) return { action: 'allow' };
  return {
    action: 'block',
    reason: `do-it compliance blocked the commit:\n${findings.map((f) => format([f], f.file)).join('\n')}\nUnstage or fix these first.`,
  };
}

// Output, or null when git exits non-zero.
function defaultGit(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}
