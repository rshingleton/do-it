// Link helpers for tests that must pass where symlinks are refused (Windows
// without Developer Mode): make a link by symlink, else junction, and read
// what an installed entry stands for whether it is a link or a copy.
import fs from 'node:fs';
import { hashTree, norm } from '../scripts/lib/install-state.mjs';

// A directory link to `target`; the target is created when absent so a
// junction (which needs an absolute, existing directory) can stand in.
export function linkDir(target, at) {
  try {
    fs.symlinkSync(target, at, 'dir');
  } catch (e) {
    if (e.code !== 'EPERM') throw e;
    fs.mkdirSync(target, { recursive: true });
    fs.symlinkSync(target, at, 'junction');
  }
}

// True when `at` is a link to `src`, or an up-to-date copy of it: a file with
// the same bytes, or a directory with the same tree.
export function standsFor(at, src) {
  const st = fs.lstatSync(at, { throwIfNoEntry: false });
  if (!st) return false;
  if (st.isSymbolicLink()) {
    // A temp dir can sit behind a symlink (macOS /var -> /private/var), and
    // the installer links to the physical path, so compare resolved paths.
    try {
      return fs.realpathSync(at) === fs.realpathSync(src);
    } catch {
      return norm(fs.readlinkSync(at)) === norm(src);
    }
  }
  if (st.isDirectory()) {
    try {
      return hashTree(at) === hashTree(src);
    } catch {
      return false;
    }
  }
  return st.isFile() && fs.readFileSync(at).equals(fs.readFileSync(src));
}

export const present = (at) => fs.lstatSync(at, { throwIfNoEntry: false }) !== undefined;
