// YAML frontmatter in one place: split and join a Markdown file's header
// (keeping its line endings), and read and write its flat `key: value` form.
// The state block's nested YAML stays in skills/do-it/scripts/block.mjs.

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

// { yaml, body, eol } for a file that opens with a closed block, else null.
// `yaml` always has LF line breaks; `eol` is the file's own ending.
export function splitFrontmatter(text) {
  const m = text.match(FRONT);
  if (!m) return null;
  return { yaml: m[1].replace(/\r\n/g, '\n'), body: text.slice(m[0].length), eol: text.includes('\r\n') ? '\r\n' : '\n' };
}

// The block through its closing `---` in `eol` line endings, then the body as given.
export function joinFrontmatter(yaml, body, eol = '\n') {
  const block = `---\n${yaml.replace(/\n$/, '')}\n---\n`;
  return `${eol === '\n' ? block : block.replace(/\n/g, eol)}${body}`;
}

// Top-level `key: value` pairs, covering the YAML scalar forms a header uses:
// plain (with indented continuation lines), single and double quoted (possibly
// spanning lines), and > / | block scalars with chomping and indentation
// indicators. Trailing newlines are dropped.
//
// `skipped`: non-blank lines that open no key. `continued`: non-blank lines
// folded into the key above them, which a flat writer cannot give back.
export function parseFlat(yaml) {
  const meta = {};
  const skipped = [];
  const continued = [];
  const lines = yaml.split(/\r?\n/);
  const isKey = (l) => /^[A-Za-z_][\w-]*:(\s|$)/.test(l);

  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) {
      if (lines[i].trim()) skipped.push(lines[i]);
      continue;
    }
    const first = kv[2];
    // Lines that belong to this value: indented or blank, up to the next key.
    const rest = [];
    while (i + 1 < lines.length && !isKey(lines[i + 1])) rest.push(lines[++i]);
    // A comment line is never part of the value, except inside a block scalar.
    const block = /^[>|][+-]?\d?\s*$/.test(first);
    const comments = block ? [] : rest.filter((l) => /^\s*#/.test(l));
    skipped.push(...comments);
    if (comments.length) rest.splice(0, rest.length, ...rest.filter((l) => !comments.includes(l)));
    continued.push(...rest.filter((l) => l.trim()));

    let value;
    if (block) {
      value = blockScalar(first.trim()[0], rest);
    } else if (first.startsWith('"')) {
      value = doubleQuoted([first, ...rest.map((l) => l.trim())].join(' ').trim());
    } else if (first.startsWith("'")) {
      value = [first, ...rest.map((l) => l.trim())].join(' ').trim().replace(/^'|'$/g, '').replaceAll("''", "'");
    } else {
      value = [first, ...rest.map((l) => l.trim())].filter(Boolean).join(' ').trim();
    }
    meta[kv[1]] = value;
  }
  return { meta, skipped, continued };
}

function blockScalar(style, rest) {
  const indent = Math.min(...rest.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length), Infinity);
  const body = rest.map((l) => (l.trim() ? l.slice(indent === Infinity ? 0 : indent) : ''));
  if (style === '|') return body.join('\n').replace(/\n+$/, '');
  // Folded: lines join with spaces; a blank line becomes a newline.
  const paragraphs = body.join('\n').replace(/\n+$/, '').split(/\n\s*\n/);
  return paragraphs.map((p) => p.split('\n').join(' ')).join('\n');
}

function doubleQuoted(s) {
  const inner = s.replace(/^"/, '').replace(/"\s*$/, '');
  const simple = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/', 0: '\0', ' ': ' ' };
  return inner.replace(/\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|.)/g, (_, e) => {
    if (/^[xuU]/.test(e)) return String.fromCodePoint(parseInt(e.slice(1), 16));
    return e in simple ? simple[e] : e;
  });
}

// Values that stay readable bare in YAML; anything else is written JSON-quoted.
const BARE = /^[A-Za-z0-9_][\w .\/-]*$/;

// One `key: value` line per entry, skipping undefined and empty values.
export function writeFlat(meta) {
  return Object.entries(meta)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${BARE.test(String(v)) && !/\s$/.test(String(v)) ? v : JSON.stringify(String(v))}`)
    .join('\n');
}
