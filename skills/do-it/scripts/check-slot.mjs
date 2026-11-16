// A run's check slot: one check at a time per run, so two tracks running the same heavy suite queue
// instead of fighting for CPU. The slot is a file, `<planning dir>/<slug>.run/checks.lock`, created
// exclusively; its mtime is its age. A holder that dies leaves the file behind, so a lock older than
// STALE_MS is taken over, and the caller says so.
// shortcut: a dead holder is only released when its lock ages past STALE_MS, so a waiter can queue
// that long; upgrade to a heartbeat or a pid liveness check if a check can outlive 30 min.

import fs from 'node:fs';
import path from 'node:path';

export const STALE_MS = 30 * 60000;
const POLL_MS = 50;

export function lockPath(planningDir, slug) {
  return path.join(planningDir, `${slug}.run`, 'checks.lock');
}

// A synchronous sleep: the CLI waits for the slot in one process, and its check runs synchronously.
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// The lock's stat, or null when the file is gone (it went away between the attempt and the read).
function statOf(file) {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}

// Take the slot, waiting for a live holder. Returns `{ waited_ms, note, release }`: `waited_ms` is the
// time spent queuing, `note` is set when a stale lock was taken over (the caller says it), and
// `release` removes the lock and must run on every exit path.
export function lockChecks(planningDir, slug, { now = Date.now, staleMs = STALE_MS, pollMs = POLL_MS } = {}) {
  const file = lockPath(planningDir, slug);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const from = now();
  let note = null;
  for (;;) {
    try {
      const fd = fs.openSync(file, 'wx');
      fs.writeSync(fd, `${process.pid}\n`);
      fs.closeSync(fd);
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const held = statOf(file);
      if (!held) continue;
      if (now() - held.mtimeMs <= staleMs) {
        sleep(pollMs);
        continue;
      }
      // Take the stale lock out of the way, then check it is the one that was read: another process
      // may have taken it over and made a fresh one in between, and that fresh one goes back.
      const aside = `${file}.${process.pid}.stale`;
      try {
        fs.renameSync(file, aside);
      } catch (err) {
        if (err.code === 'ENOENT') continue;
        throw err;
      }
      const moved = statOf(aside);
      if (moved && moved.mtimeMs !== held.mtimeMs) {
        try {
          fs.renameSync(aside, file);
        } catch {
          // A third process holds the slot now: leave it where it is and queue like any waiter.
        }
        sleep(pollMs);
        continue;
      }
      fs.rmSync(aside, { force: true });
      note = `check lock older than ${Math.round(staleMs / 60000)} min: taken over`;
    }
  }
  const waited = now() - from;
  return { waited_ms: waited, note, release: () => fs.rmSync(file, { force: true }) };
}
