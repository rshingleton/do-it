// The checkout's ref as the doctor and the installer both read it: the branch
// and short sha, the commits ahead and behind its upstream and behind
// origin/main, and how fresh the counts are. Its own module, so the doctor,
// which plans its links through install.mjs, and the installer, which prints the
// closing line, do not import each other.

import fs from 'node:fs';
import path from 'node:path';
import { git } from '../../skills/do-it/scripts/git.mjs';
import { sameTarget } from './install-state.mjs';

// The first line of a git error without git's "fatal: " prefix: the reason as a
// person reads it.
export const firstLine = (text) => String(text ?? '').trim().split('\n')[0].replace(/^fatal: /, '');

// Every read is a local one: the remote moves only when `fetch` asks it to. Each
// count comes from a remote-tracking ref, so a checkout that has not fetched
// reports what it knew at its last fetch, or what its clone brought in; which of
// the two is said beside the counts, and so is the age of FETCH_HEAD. A clone
// writes the remote refs and no FETCH_HEAD, while a repository that has never
// fetched has neither: a missing FETCH_HEAD beside a followed ref is the clone's
// own state, not a fetch the user forgot. `unknown` carries the reason git could
// not answer.
export function readRef({ root, fetch = false } = {}) {
  const at = (args) => {
    try {
      return git(root, args);
    } catch (e) {
      return { status: -1, stdout: '', stderr: e.code === 'ENOENT' ? 'git is not installed' : e.message };
    }
  };

  const top = at(['rev-parse', '--show-toplevel']);
  if (top.status !== 0) return { unknown: firstLine(top.stderr) || 'git cannot read this directory' };
  const toplevel = top.stdout.trim();
  // git walks up from a subdirectory; a ref belongs to the checkout only when
  // that checkout is the repository's top level.
  if (!sameTarget(toplevel, root)) return { unknown: `not the root of a git checkout (its top level is ${toplevel})` };

  let fetchError = null;
  if (fetch) {
    const f = at(['fetch', '--quiet']);
    if (f.status !== 0) fetchError = firstLine(f.stderr) || 'fetch failed';
  }

  const sha = at(['rev-parse', '--short', 'HEAD']);
  if (sha.status !== 0) return { unknown: `no commit at HEAD: ${firstLine(sha.stderr)}` };

  const head = at(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
  const up = at(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);

  // `rev-list --left-right --count A...HEAD` prints commits only in A, then
  // only in HEAD: behind, then ahead.
  const count = (left) => {
    const r = at(['rev-list', '--left-right', '--count', `${left}...HEAD`]);
    if (r.status !== 0) return null;
    const [behind, ahead] = r.stdout.trim().split(/\s+/).map(Number);
    return { ahead, behind };
  };

  const upstream = up.status === 0 ? up.stdout.trim() : null;
  const vsUpstream = upstream ? count(upstream) : null;
  const vsMain = at(['rev-parse', '--verify', '--quiet', 'origin/main^{commit}']).status === 0 ? count('origin/main') : null;

  // The one rule for which ref an install follows: origin/main when it
  // resolves, else the branch's own upstream, else none. Both the footer and
  // the installer's closing line read this field instead of picking again.
  const followed = typeof vsMain?.behind === 'number'
    ? { name: 'origin/main', behind: vsMain.behind }
    : upstream && vsUpstream
      ? { name: upstream, behind: vsUpstream.behind }
      : null;

  const common = at(['rev-parse', '--git-common-dir']);
  const gitDir = common.status === 0 ? path.resolve(root, common.stdout.trim()) : path.join(root, '.git');
  const fetched = fs.statSync(path.join(gitDir, 'FETCH_HEAD'), { throwIfNoEntry: false });

  const ref = {
    branch: head && head !== 'HEAD' ? head : null,
    sha: sha.stdout.trim(),
    upstream,
    ahead: vsUpstream ? vsUpstream.ahead : null,
    behind: vsUpstream ? vsUpstream.behind : null,
    behindMain: vsMain ? vsMain.behind : null,
    followed,
    fetchedAt: fetched ? fetched.mtime.toISOString() : null,
    cloned: !fetched && followed !== null,
  };
  if (fetchError) ref.fetchError = fetchError;
  return ref;
}

// The age of the last fetch, as an age alone: `fetchText` puts the words in
// front of it.
export const ageOf = (fetchedAt) => {
  if (!fetchedAt) return 'never';
  const mins = Math.max(0, Math.floor((Date.now() - Date.parse(fetchedAt)) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
};

// Where the counts the ref carries came from, in the words the footer and the
// install line share: a fetch, the clone that has not fetched, or neither.
export function fetchText(ref) {
  if (ref.fetchedAt) return `fetched ${ageOf(ref.fetchedAt)}`;
  if (ref.cloned) return 'cloned, not yet fetched';
  return 'never fetched';
}

// One number with its word: the ref footer and the install line both read a
// count of commits this way.
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
