// The path identity and copy-record helpers the installer and the doctor share:
// how two paths are compared on this platform, and where an install keeps the
// files it had to copy instead of link.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// The path the filesystem answers with, or null when nothing can resolve it.
// `.native` comes first because it expands the 8.3 short names Windows hands
// out for long temp paths, which the JavaScript fallback leaves alone.
const realpath = (p) => {
  try {
    return fs.realpathSync.native(p);
  } catch {
    try {
      return fs.realpathSync(p);
    } catch {
      return null;
    }
  }
};

// A path in the shape a comparison wants: absolute, without the \\?\ prefix a
// junction reads back with, lower-cased where the filesystem folds case, and
// resolved through the filesystem so `/var` and `/private/var`, or a short name
// and the long one it stands for, compare equal. A path that does not exist yet
// resolves as far as its nearest existing ancestor.
export const norm = (p) => {
  const raw = String(p ?? '').replace(/^\\\\\?\\/, '');
  const r = path.resolve(raw);
  let cursor = r;
  const parts = [];
  while (!fs.existsSync(cursor) && path.dirname(cursor) !== cursor) {
    parts.unshift(path.basename(cursor));
    cursor = path.dirname(cursor);
  }
  const base = realpath(cursor);
  if (base === null) return process.platform === 'win32' ? r.toLowerCase() : r;
  const real = (parts.length ? path.join(base, ...parts) : base).replace(/^\\\\\?\\/, '');
  return process.platform === 'win32' ? real.toLowerCase() : real;
};

export const sameTarget = (a, b) => norm(a) === norm(b);

// True when `target` sits inside `prefix`; the prefix itself is outside.
export const under = (target, prefix) => norm(target).startsWith(norm(prefix) + (process.platform === 'win32' ? '\\' : '/'));

export const hashFile = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

// A stable hash of a directory's contents, so a directory copy can be told from
// one edited after the install, the same way a single-file copy is. Paths are
// relative to `dir`, sorted, and carry their kind, so a rename changes the hash
// even when the bytes match.
export function hashTree(dir) {
  const hash = crypto.createHash('sha256');
  const walk = (rel) => {
    const base = rel ? path.join(dir, rel) : dir;
    const items = fs
      .readdirSync(base, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const item of items) {
      const inner = rel ? `${rel}/${item.name}` : item.name;
      const at = path.join(base, item.name);
      if (item.isDirectory()) {
        hash.update(`d ${inner}\n`);
        walk(inner);
      } else if (item.isSymbolicLink()) {
        hash.update(`l ${inner} ${fs.readlinkSync(at)}\n`);
      } else {
        hash.update(`f ${inner} ${hashFile(at)}\n`);
      }
    }
  };
  walk('');
  return hash.digest('hex');
}

export const manifestPath = (home) => path.join(home, '.claude', 'do-it', 'install.json');

// The copies an install made, telling "no copies" from "could not read": a
// missing file or a manifest with no list is a home with nothing copied, while
// a truncated or unreadable file comes back as an error for the doctor to
// report. The installer uses `readManifest`, which wants [] either way.
export function readManifestState(home) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(manifestPath(home), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return { copies: [], error: null };
    return { copies: [], error: e.message };
  }
  if (!Array.isArray(data?.copies)) return { copies: [], error: 'no copies list' };
  return { copies: data.copies, error: null };
}

export function readManifest(home) {
  return readManifestState(home).copies;
}

// Record the copies, or remove the manifest (and its directory, when empty)
// once nothing is copied.
export function writeManifest(home, copies) {
  const file = manifestPath(home);
  if (!copies.length) {
    fs.rmSync(file, { force: true });
    try {
      fs.rmdirSync(path.dirname(file));
    } catch {
      /* not empty or absent */
    }
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ version: 1, copies }, null, 2)}\n`);
}
