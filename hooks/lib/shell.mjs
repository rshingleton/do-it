// The shell lexer behind the commit guard: reads the words of each command
// in a shell line and finds every `git commit` with its arguments and the
// directory changes before it. Nothing is expanded or executed.

import path from 'node:path';

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
export function commandWords(s) {
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

// Read git's words from `git` on: global options, then the subcommand `sub`
// matches. Returns the -C directory, the subcommand and the words after it,
// or null.
function readGit(words, i, sub) {
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
  return sub.test(words[i] ?? '') ? { dir, name: words[i].replace(/[)`]+$/, ''), args: words.slice(i + 1) } : null;
}

const COMMIT = /^commit[)`]*$/;
const STAGE = /^(add|stage|rm|mv)[)`]*$/;
// git add options that stage more than the named paths: short letters (-A -u
// -p -i -e) and long names.
const STAGE_ALL_SHORT = 'Aupie';
const STAGE_ALL_LONG = new Set(['all', 'update', 'patch', 'interactive', 'edit', 'pathspec-from-file']);

// What an earlier `git add`, `stage`, `rm` or `mv` puts in the index, from the
// words after it: every tracked change (a flag above, unreadable quoting) or
// the named paths. A rm adds no lines, so it names none; a mv names its
// sources, as its destination does not exist yet when the hook runs. `force`
// is -f on an add: it stages ignored files too.
function stageArgs(sub, args, sure) {
  let all = sub !== 'rm' && !sure;
  let force = false;
  const words = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      words.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      if (sub !== 'rm' && sub !== 'mv' && STAGE_ALL_LONG.has(a.slice(2).split('=')[0])) all = true;
      if (sub !== 'rm' && sub !== 'mv' && a === '--force') force = true;
    } else if (a.startsWith('-') && a.length > 1) {
      if (sub !== 'rm' && sub !== 'mv' && [...a.slice(1)].some((c) => STAGE_ALL_SHORT.includes(c))) all = true;
      if (sub !== 'rm' && sub !== 'mv' && a.includes('f')) force = true;
    } else {
      words.push(a);
    }
  }
  const named = sub === 'rm' ? [] : sub === 'mv' ? words.slice(0, -1) : words;
  // A `)` or backtick fused to a word closes a subshell or substitution: read
  // the path both ways (a path may end in one), an over-scan, never a miss.
  const paths = named.flatMap((w) => (/[)`]$/.test(w) ? [w, w.replace(/[)`]+$/, '')] : [w]));
  return { all, paths, force };
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

// Every `git commit` in a command, in order: { dir, all, paths, cds, stages },
// with cds the directory changes before it (all of them, even in subshells or
// quoted text: over-include) and stages the `git add`, `stage`, `rm` and `mv`
// before it, each { dir, all, paths, cds }, as the hook runs before they do. A command starts at the beginning, after
// ; & | ( { ` or a newline, quoted or not, so text that only looks like a
// commit is read as one (an over-scan, never a miss).
export function parseGitCommits(command) {
  const text = String(command || '');
  const cds = directoryChanges(text);
  const commits = [];
  const stages = [];
  // Each command start reads to the end of its command, so the total is
  // about the text's length; a quote that never closes can make it more, so
  // the work is capped and the rest scanned from the repo root instead.
  let budget = 20 * text.length + 100000;
  for (let at = 0; at <= text.length; at++) {
    if (at > 0 && !';&|({`\n'.includes(text[at - 1])) continue;
    const { words, sure, end } = commandWords(text.slice(at));
    if ((budget -= end + 1) < 0) {
      commits.push({ dir: null, all: true, paths: [], cds: [], stages: [], bail: true });
      break;
    }
    let i = 0;
    while (LEADERS.has(words[i])) i++;
    const start = skipPrefix(words, i);
    const here = cds.filter((c) => c.at < at).map((c) => c.to);
    const found = readGit(words, start, COMMIT);
    if (found) {
      commits.push({ dir: found.dir, ...commitArgs(found.args, sure), cds: here, stages: [...stages] });
      continue;
    }
    const staging = readGit(words, start, STAGE);
    if (staging) {
      stages.push({ dir: staging.dir, ...stageArgs(staging.name, staging.args, sure), cds: here });
    }
  }
  return commits;
}

export function parseGitCommit(command) {
  return parseGitCommits(command)[0] ?? null;
}
