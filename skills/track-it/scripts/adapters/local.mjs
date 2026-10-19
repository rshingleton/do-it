// Local tracker: one Markdown file per issue under DO_IT_ISSUES_DIR.

import fs from 'node:fs';
import path from 'node:path';
import { slugify } from '../refs.mjs';

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
// Values that stay readable bare in YAML; anything else is written JSON-quoted.
const BARE = /^[A-Za-z0-9_][\w .\/-]*$/;

function readValue(raw) {
  const v = raw.trim();
  if (v.startsWith('"')) {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replaceAll("''", "'");
  return v;
}

export function readIssue(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(FRONT);
  const meta = {};
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
      if (kv) meta[kv[1]] = readValue(kv[2]);
    }
  }
  return { meta, body: m ? text.slice(m[0].length) : text };
}

function writeIssue(file, meta, body) {
  const front = Object.entries(meta)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${BARE.test(String(v)) && !/\s$/.test(String(v)) ? v : JSON.stringify(String(v))}`)
    .join('\n');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---\n${front}\n---\n\n${body.replace(/^(\r?\n)+/, '')}`);
}

// Append an entry at the end of the "## Log" section (before the next "## "
// heading), creating the section at the end of the body when there is none.
function appendLog(body, line) {
  const entry = `- ${new Date().toISOString().slice(0, 10)}: ${line}`;
  const lines = body.replace(/\s*$/, '').split(/\r?\n/);
  const start = lines.findIndex((l) => /^## Log\s*$/.test(l));
  if (start < 0) return `${lines.join('\n')}\n\n## Log\n\n${entry}\n`;
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  let at = end;
  while (at > start + 1 && lines[at - 1].trim() === '') at--;
  lines.splice(at, 0, entry);
  return `${lines.join('\n')}\n`;
}

export function localTracker(cfg, { root }) {
  const dir = path.resolve(root, cfg.DO_IT_ISSUES_DIR);
  const abs = (ref) => path.resolve(root, ref);
  const rel = (file) => path.relative(root, file);

  function update(ref, fn) {
    const file = abs(ref);
    const { meta, body } = readIssue(file);
    const next = fn(meta, body);
    writeIssue(file, next.meta, next.body);
    return { ref: rel(file), status: next.meta.status };
  }

  return {
    kind: 'local',

    create({ title, type = 'todo', body = '', source = 'user', externalId }) {
      const base = slugify(title);
      let file = path.join(dir, `${base}.md`);
      for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${base}-${i}.md`);
      writeIssue(file, { title, type, status: 'open', source, external_id: externalId }, body);
      return { ref: rel(file), path: rel(file) };
    },

    get(ref) {
      const { meta, body } = readIssue(abs(ref));
      return { ref, title: meta.title, status: meta.status, type: meta.type, meta, body };
    },

    comment(ref, text) {
      return update(ref, (meta, body) => ({ meta, body: appendLog(body, text) }));
    },

    start(ref) {
      return update(ref, (meta, body) => ({ meta: { ...meta, status: 'in-progress' }, body: appendLog(body, 'started') }));
    },

    close(ref, text) {
      return update(ref, (meta, body) => ({
        meta: { ...meta, status: 'closed' },
        body: appendLog(body, text ? `closed: ${text}` : 'closed'),
      }));
    },

    // Plans already live in docs/planning/ beside local issues; nothing to publish.
    publish() {
      return { parent: null, phases: {} };
    },
  };
}
