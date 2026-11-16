// The path identity and copy-record helpers the installer and the doctor share:
// how two paths are compared on this platform, and where an install keeps the
// files it had to copy instead of link.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// A path in the shape a comparison wants: absolute, without the \\?\ prefix a
// junction reads back with, lower-cased where the filesystem folds case.
export const norm = (p) => {
  const r = path.resolve(String(p).replace(/^\\\\\?\\/, ''));
  return process.platform === 'win32' ? r.toLowerCase() : r;
};

export const sameTarget = (a, b) => norm(a) === norm(b);

// True when `target` sits inside `prefix`; the prefix itself is outside.
export const under = (target, prefix) => norm(target).startsWith(norm(prefix) + (process.platform === 'win32' ? '\\' : '/'));

export const hashFile = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

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
