// Local tracker: one Markdown file per issue under DO_IT_ISSUES_DIR.

import fs from 'node:fs';
import path from 'node:path';
import { slugify } from '../refs.mjs';
import { splitFrontmatter, joinFrontmatter, parseFlat, writeFlat } from '../frontmatter.mjs';

export function readIssue(file) {
  const text = fs.readFileSync(file, 'utf8');
  const parts = splitFrontmatter(text);
  if (!parts) return { meta: {}, body: text, hasFront: false, skipped: [] };
  const { meta, skipped, continued } = parseFlat(parts.yaml);
  // A rewrite writes flat key: value lines only, so a folded or nested line counts as dropped.
  return { meta, body: parts.body, hasFront: true, skipped: [...skipped, ...continued] };
}

function issueText(meta, body) {
  return joinFrontmatter(writeFlat(meta), `\n${body.replace(/^(\r?\n)+/, '')}`);
}

// Write beside the target and rename over it, so a crash never leaves a
// half-written issue.
function rewriteIssue(file, meta, body) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
  try {
    fs.writeFileSync(tmp, issueText(meta, body));
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

// Realpath of the nearest existing ancestor, so a symlink cannot lead out of a
// directory and /tmp matches /private/tmp.
function realish(p) {
  const rest = [];
  for (let cur = p; ; cur = path.dirname(cur)) {
    try {
      return path.join(fs.realpathSync(cur), ...rest);
    } catch {
      if (path.dirname(cur) === cur) return p;
      rest.unshift(path.basename(cur));
    }
  }
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
  const rel = (file) => path.relative(root, file);

  // A ref names an .md file inside the issues dir; anything else (a plan, a
  // roadmap, a path that climbs out) is refused before it is read or changed.
  function issuePath(ref) {
    const file = path.resolve(root, ref);
    const inside = path.relative(realish(dir), realish(file));
    if (!/\.md$/i.test(file) || !inside || inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside)) {
      throw new Error(`${ref}: outside the issues dir ${rel(dir)}, refusing`);
    }
    return file;
  }

  function update(ref, fn) {
    const file = issuePath(ref);
    const { meta, body, hasFront, skipped } = readIssue(file);
    if (!hasFront) throw new Error(`${ref}: no frontmatter, refusing to rewrite`);
    if (skipped.length) throw new Error(`${ref}: frontmatter line not flat key: value, refusing to rewrite: "${skipped[0]}"`);
    const next = fn(meta, body);
    rewriteIssue(file, next.meta, next.body);
    return { ref: rel(file), status: next.meta.status };
  }

  return {
    kind: 'local',

    create({ title, type = 'todo', body = '', source = 'user', externalId }) {
      const base = slugify(title);
      const text = issueText({ title, type, status: 'open', source, external_id: externalId }, body);
      fs.mkdirSync(dir, { recursive: true });
      for (let i = 1; ; i++) {
        const file = path.join(dir, i === 1 ? `${base}.md` : `${base}-${i}.md`);
        try {
          fs.writeFileSync(file, text, { flag: 'wx' });
        } catch (err) {
          if (err.code === 'EEXIST') continue;
          throw err;
        }
        return { ref: rel(file), path: rel(file) };
      }
    },

    // Issues under the issues dir: "open" (the default, so in-progress too),
    // "closed" or "all".
    list({ status = 'open' } = {}) {
      if (!['open', 'closed', 'all'].includes(status)) throw new Error(`list --status takes open, closed or all, not "${status}"`);
      if (!fs.existsSync(dir)) return [];
      return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.md'))
        .sort()
        .map((f) => ({ file: path.join(dir, f), meta: readIssue(path.join(dir, f)).meta }))
        .filter(({ meta }) => meta.title)
        .filter(({ meta }) => status === 'all' || ((meta.status ?? 'open') === 'closed') === (status === 'closed'))
        .map(({ file, meta }) => ({ ref: rel(file), title: meta.title, type: meta.type, status: meta.status ?? 'open' }));
    },

    get(ref) {
      const { meta, body } = readIssue(issuePath(ref));
      return { ref, title: meta.title, status: meta.status, type: meta.type, meta, body };
    },

    comment(ref, text) {
      return update(ref, (meta, body) => ({ meta, body: appendLog(body, text) }));
    },

    start(ref) {
      return update(ref, (meta, body) => ({ meta: { ...meta, status: 'in-progress' }, body: appendLog(body, 'started') }));
    },

    // A closed issue is deleted: the commit and git history keep it, so no
    // closed file stays behind.
    close(ref) {
      const file = issuePath(ref);
      readIssue(file);
      fs.unlinkSync(file);
      return { ref: rel(file), status: 'closed', removed: true };
    },

    // Plans already live in docs/planning/ beside local issues; nothing to publish.
    publish() {
      return { parent: null, phases: {} };
    },
  };
}
