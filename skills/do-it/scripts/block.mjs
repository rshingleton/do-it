// A plan file's state block: the YAML it is written in, and the file I/O.
//
// The block is YAML frontmatter on the plan (docs/planning/<id>.md for lane S,
// docs/planning/<id>/README.md for lane M). This module reads the subset the
// flow writes, plus the flow-map style older plans use, and writes block
// style only. What the block may hold and how it moves is state.mjs.

import fs from 'node:fs';
import { normalize } from './state.mjs';
import { splitFrontmatter, joinFrontmatter } from '../../track-it/scripts/frontmatter.mjs';

// ---------------------------------------------------------------------------
// Parsing

function scalar(text) {
  const t = text.trim();
  if (t === '' || t === '~' || t === 'null') return null;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+$/.test(t) && t.length < 16) return Number(t);
  return t;
}

function stripComment(text) {
  return text.replace(/\s+#.*$/, '');
}

// Flow values: { a: b }, [a, b], "x", 'x', plain. Plain values end at a comma
// or closing bracket outside parentheses, so `title: Fixes (report, code)`
// stays one value.
function parseFlow(text) {
  let i = 0;
  const ws = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  const fail = (why) => {
    throw new Error(`state block: ${why} at column ${i + 1} in: ${text}`);
  };

  function quoted() {
    const q = text[i];
    if (q === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      if (j >= text.length) fail('unterminated string');
      const out = JSON.parse(text.slice(i, j + 1));
      i = j + 1;
      return out;
    }
    let out = '';
    i++;
    for (;;) {
      if (i >= text.length) fail('unterminated string');
      if (text[i] === "'") {
        if (text[i + 1] === "'") {
          out += "'";
          i += 2;
          continue;
        }
        i++;
        return out;
      }
      out += text[i++];
    }
  }

  function plain(stops) {
    let depth = 0;
    const start = i;
    while (i < text.length) {
      const c = text[i];
      if (c === '(') depth++;
      else if (c === ')') depth = Math.max(0, depth - 1);
      else if (depth === 0 && stops.includes(c)) break;
      i++;
    }
    return text.slice(start, i);
  }

  function value(stops) {
    ws();
    const c = text[i];
    if (c === '{') return map();
    if (c === '[') return list();
    if (c === '"' || c === "'") return quoted();
    return scalar(plain(stops));
  }

  function map() {
    const out = {};
    i++;
    for (;;) {
      ws();
      if (text[i] === '}') {
        i++;
        return out;
      }
      const key = text[i] === '"' || text[i] === "'" ? String(quoted()) : plain(':,}').trim();
      ws();
      if (text[i] !== ':') fail(`expected ':' after ${key}`);
      i++;
      out[key] = value(',}');
      ws();
      if (text[i] === ',') i++;
      else if (text[i] !== '}') fail("expected ',' or '}'");
    }
  }

  function list() {
    const out = [];
    i++;
    for (;;) {
      ws();
      if (text[i] === ']') {
        i++;
        return out;
      }
      out.push(value(',]'));
      ws();
      if (text[i] === ',') i++;
      else if (text[i] !== ']') fail("expected ',' or ']'");
    }
  }

  const out = value('');
  ws();
  if (i < text.length && text[i] !== '#') fail('unexpected text');
  return out;
}

function inline(text) {
  const t = text.trim();
  if (/^[{["']/.test(t)) return parseFlow(t);
  return scalar(stripComment(t));
}

// Bracket balance of a line, ignoring quoted text and comments.
function balance(line) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      if (i === 0 || /[\s[{,:-]/.test(line[i - 1])) quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) break;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
  }
  return depth;
}

// A line without its trailing comment, quotes respected.
function uncomment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      if (i === 0 || /[\s[{,:-]/.test(line[i - 1])) quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i).trimEnd();
  }
  return line;
}

// Lines of the block with indentation, multi-line flow values joined.
function logicalLines(yaml) {
  const out = [];
  const raw = yaml.split(/\r?\n/);
  for (let n = 0; n < raw.length; n++) {
    let line = raw[n];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    let depth = balance(line);
    if (depth > 0) line = uncomment(line);
    while (depth > 0 && n + 1 < raw.length) {
      const next = raw[++n];
      line += ` ${uncomment(next).trim()}`;
      depth += balance(next);
    }
    const indent = line.match(/^ */)[0].length;
    out.push({ indent, text: line.trim() });
  }
  return out;
}

const KEY = /^([A-Za-z0-9_.-]+|"[^"]*"):(?:\s+(.*))?$/;

function keyOf(raw) {
  return raw.startsWith('"') ? JSON.parse(raw) : raw;
}

function parseNode(lines, i, indent) {
  if (i >= lines.length || lines[i].indent < indent) return [null, i];
  const at = lines[i].indent;
  if (lines[i].text === '-' || lines[i].text.startsWith('- ')) return parseList(lines, i, at);
  return parseMap(lines, i, at);
}

function parseMap(lines, i, indent) {
  const out = {};
  while (i < lines.length && lines[i].indent === indent) {
    const m = lines[i].text.match(KEY);
    if (!m) throw new Error(`state block: cannot read line: ${lines[i].text}`);
    const key = keyOf(m[1]);
    const rest = m[2] ?? '';
    i++;
    if (rest.trim() && !rest.trim().startsWith('#')) {
      out[key] = inline(rest);
      continue;
    }
    const next = lines[i];
    if (next && next.indent > indent) [out[key], i] = parseNode(lines, i, next.indent);
    else if (next && next.indent === indent && (next.text === '-' || next.text.startsWith('- '))) {
      [out[key], i] = parseList(lines, i, indent);
    } else out[key] = null;
  }
  return [out, i];
}

function parseList(lines, i, indent) {
  const out = [];
  while (i < lines.length && lines[i].indent === indent && (lines[i].text === '-' || lines[i].text.startsWith('- '))) {
    const content = lines[i].text.slice(1).trim();
    if (!content) {
      const [v, j] = parseNode(lines, i + 1, indent + 1);
      out.push(v);
      i = j;
      continue;
    }
    if (!/^[{["']/.test(content) && KEY.test(content)) {
      // A map item: its first key sits on the dash line, the rest below it.
      const inner = indent + 2;
      const copy = [...lines];
      copy[i] = { indent: inner, text: content };
      const [v, j] = parseMap(copy, i, inner);
      out.push(v);
      i = j;
      continue;
    }
    out.push(inline(content));
    i++;
  }
  return [out, i];
}

export function parseBlock(yaml) {
  const lines = logicalLines(yaml);
  if (!lines.length) return {};
  const [out, i] = parseMap(lines, 0, lines[0].indent);
  if (i < lines.length) throw new Error(`state block: cannot read line: ${lines[i].text}`);
  return out;
}

// ---------------------------------------------------------------------------
// Writing

function plainOk(s) {
  return (
    s !== '' &&
    s === s.trim() &&
    /^[A-Za-z0-9_./]/.test(s) &&
    !/[:,[\]{}"'()]|\s#|[^\S ]/.test(s) &&
    scalar(s) === s
  );
}

function fmtScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v);
  return plainOk(s) ? s : JSON.stringify(s);
}

function isScalar(v) {
  return v === null || v === undefined || typeof v !== 'object';
}

function fmtKey(k) {
  return /^[A-Za-z0-9_.-]+$/.test(k) ? k : JSON.stringify(k);
}

// Short scalar lists stay on one line: blocked_by: [1, 2].
function shortList(v) {
  return v.every(isScalar) && v.every((x) => fmtScalar(x).length <= 40) && v.length <= 8;
}

function writeValue(key, v, indent, out) {
  const pad = ' '.repeat(indent);
  const head = `${pad}${fmtKey(key)}:`;
  if (Array.isArray(v)) {
    if (!v.length || shortList(v)) out.push(`${head} [${v.map(fmtScalar).join(', ')}]`);
    else {
      out.push(head);
      writeList(v, indent + 2, out);
    }
  } else if (v && typeof v === 'object') {
    if (!Object.keys(v).length) out.push(`${head} {}`);
    else {
      out.push(head);
      for (const [k, x] of Object.entries(v)) writeValue(k, x, indent + 2, out);
    }
  } else out.push(`${head} ${fmtScalar(v)}`);
}

function writeList(v, indent, out) {
  const pad = ' '.repeat(indent);
  for (const item of v) {
    if (item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length) {
      const lines = [];
      for (const [k, x] of Object.entries(item)) writeValue(k, x, indent + 2, lines);
      lines[0] = `${pad}- ${lines[0].slice(indent + 2)}`;
      out.push(...lines);
    } else if (Array.isArray(item)) {
      out.push(`${pad}- [${item.map(fmtScalar).join(', ')}]`);
    } else out.push(`${pad}- ${fmtScalar(item)}`);
  }
}

// Keys in the order STATE.md documents; anything else follows in its own order.
const ORDER = [
  'id', 'title', 'lane', 'status', 'tracker', 'sources', 'roadmap', 'todo', 'blocked_by',
  'base_ref', 'approvals', 'phases', 'verified', 'assumptions', 'fix', 'defects', 'audit', 'ship', 'blocker',
];

export function writeBlock(state) {
  const keys = [...ORDER.filter((k) => k in state), ...Object.keys(state).filter((k) => !ORDER.includes(k))];
  const out = [];
  for (const k of keys) writeValue(k, state[k], 0, out);
  return `${out.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Files

export function readItem(file) {
  const text = fs.readFileSync(file, 'utf8');
  const parts = splitFrontmatter(text);
  if (!parts) throw new Error(`${file}: no state block (YAML frontmatter)`);
  const state = normalize(parseBlock(parts.yaml));
  return { path: file, state, body: parts.body, eol: parts.eol };
}

// Keeps the file's line endings, so a CRLF plan stays CRLF throughout. Writes
// a temp file beside the plan and renames it over, so a crash or a full disk
// leaves the old plan whole; plans are uncommitted and git has no copy.
export function writeItem(item, { renameSync = fs.renameSync, writeFileSync = fs.writeFileSync } = {}) {
  const eol = item.eol ?? '\n';
  const tmp = `${item.path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, joinFrontmatter(writeBlock(item.state), item.body, eol));
    renameSync(tmp, item.path);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}
