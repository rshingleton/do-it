// Host-neutral hook decisions. The Claude Code entry points and the OpenCode
// plugin translate these results into their own protocols.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadConfig, isOn } from '../../skills/track-it/scripts/config.mjs';
import { loadChecks, scan, format, editParts } from './checks.mjs';
import { addedLines } from '../../skills/do-it/scripts/changeset.mjs';

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

// Words that run another command: the options that take a value, short
// letters and long names. Any other option is read as a flag with no value.
const WRAPPERS = {
  env: { short: 'uCS', long: new Set(['unset', 'chdir', 'split-string']) },
  sudo: { short: 'ughpCDrtTU', long: new Set(['user', 'group', 'host', 'prompt', 'chdir', 'chroot', 'role', 'type']) },
  command: { short: '', long: new Set() },
  exec: { short: 'a', long: new Set() },
  nice: { short: 'n', long: new Set(['adjustment']) },
  time: { short: 'fo', long: new Set(['format', 'output']) },
};
// Words that may stand before a command in a compound statement.
const LEADERS = new Set(['!', 'if', 'while', 'until', 'then', 'do', 'else', 'elif']);
const ASSIGNMENT = /^[A-Za-z_]\w*(?:\[[^\]]*\])?\+?=/;

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
  return { words, sure, end: i };
}

// The directory changes in a command, in order, each with where it starts;
// the target is null where it cannot be read (bare cd, cd -, popd).
function directoryChanges(text) {
  const cds = [];
  for (const c of text.matchAll(/(?:^|[;&|({`\n]\s*|\b(?:then|do|else|elif)\s+)(?:(?:builtin|command)\s+)?(cd|pushd|popd)(?=\s|$)/g)) {
    const target = c[1] === 'popd' ? undefined : commandWords(text.slice(c.index + c[0].length)).words[0];
    cds.push({ at: c.index, to: target && target !== '-' ? target : null });
  }
  return cds;
}

// Skip env assignments and wrapper commands (with their options) from word i.
function skipPrefix(words, i) {
  for (;;) {
    const w = words[i];
    if (w === undefined) return i;
    if (ASSIGNMENT.test(w)) {
      i++;
      continue;
    }
    const wrap = Object.hasOwn(WRAPPERS, w) && WRAPPERS[w];
    if (!wrap) return i;
    i++;
    while (words[i]?.startsWith('-') && words[i].length > 1) {
      const o = words[i++];
      if (o === '--') break;
      if (o.startsWith('--')) {
        if (wrap.long.has(o.slice(2))) i++;
      } else if (wrap.short.includes(o[o.length - 1]) && o.length === 2) {
        i++;
      }
    }
  }
}

// Read git's words from `git` on: global options, then the commit subcommand.
// Returns the -C directory and the words after `commit`, or null.
function readGitCommit(words, i) {
  if (words[i] !== 'git') return null;
  let dir = null;
  for (i++; i < words.length; i++) {
    const w = words[i];
    if (w === '-C' || w === '-c') {
      const value = words[++i];
      if (w === '-C' && value !== undefined) dir = dir === null || path.isAbsolute(value) ? value : path.join(dir, value);
    } else if (!w.startsWith('-') || w === '-') {
      break;
    }
  }
  // A `)` or backtick fused to the word closes a subshell or substitution.
  return /^commit[)`]*$/.test(words[i] ?? '') ? { dir, args: words.slice(i + 1) } : null;
}

// What `git commit` would record, from the words after it: every tracked
// change (-a, a pathspec file, unreadable quoting) or the named paths.
function commitArgs(args, sure) {
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
  return { all, paths };
}

// Every `git commit` in a command, in order: { dir, all, paths, cds }, with
// cds the directory changes before it (all of them, even in subshells or
// quoted text: over-include). A command starts at the beginning, after
// ; & | ( { ` or a newline, quoted or not, so text that only looks like a
// commit is read as one (an over-scan, never a miss).
export function parseGitCommits(command) {
  const text = String(command || '');
  const cds = directoryChanges(text);
  const commits = [];
  // Each command start reads to the end of its command, so the total is
  // about the text's length; a quote that never closes can make it more, so
  // the work is capped and the rest scanned from the repo root instead.
  let budget = 20 * text.length + 100000;
  for (let at = 0; at <= text.length; at++) {
    if (at > 0 && !';&|({`\n'.includes(text[at - 1])) continue;
    const { words, sure, end } = commandWords(text.slice(at));
    if ((budget -= end + 1) < 0) {
      commits.push({ dir: null, all: true, paths: [], cds: [], bail: true });
      break;
    }
    let i = 0;
    while (LEADERS.has(words[i])) i++;
    const found = readGitCommit(words, skipPrefix(words, i));
    if (!found) continue;
    commits.push({
      dir: found.dir,
      ...commitArgs(found.args, sure),
      cds: cds.filter((c) => c.at < at).map((c) => c.to),
    });
  }
  return commits;
}

export function parseGitCommit(command) {
  return parseGitCommits(command)[0] ?? null;
}

// A word the shell would expand before git sees it.
const UNEXPANDED = /[$`]|^~/;

// The files a commit would record, each with its added lines, or null when
// the listing cannot be trusted (git failed, or named paths matched nothing).
function listChanges(cwd, all, paths) {
  try {
    const staged = addedLines(cwd, { against: 'staged' });
    if (all) return staged.concat(addedLines(cwd));
    if (!paths.length) return staged;
    const named = addedLines(cwd, { paths });
    return named.length ? staged.concat(named) : null;
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
    report(listChanges(ctx.root, true, []) || []);
  };
  for (const commit of commits) {
    // The command's paths are relative to the shell's directory (after any cd
    // before the commit), then -C.
    const unsure =
      commit.bail ||
      commit.cds.some((to) => to === null || UNEXPANDED.test(to)) ||
      [commit.dir ?? '', ...commit.paths].some((w) => UNEXPANDED.test(w));
    if (unsure) {
      fromRoot();
      continue;
    }
    if (commit.cds.length > CD_SUBSET_MAX) fromRoot();
    for (const shell of shellDirs(start, commit.cds)) {
      const cwd = commit.dir ? path.resolve(shell, commit.dir) : shell;
      const key = `${cwd}\0${commit.all}\0${commit.paths.join('\0')}`;
      if (listed.has(key)) continue;
      listed.add(key);
      const files = listChanges(cwd, commit.all, commit.paths);
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
