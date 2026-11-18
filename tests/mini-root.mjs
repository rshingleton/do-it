// A one-skill, one-agent checkout the link suites install from, and the
// fixtures and helpers they share: a seed pushed to a bare remote, a clone of
// it, a refused symlink and a silenced install's chatter.
import fs from 'node:fs';
import path from 'node:path';
import { tmpDir } from './env.mjs';
import { gitOut } from '../skills/do-it/scripts/git.mjs';

export const eperm = () => Object.assign(new Error('EPERM: operation not permitted, symlink'), { code: 'EPERM' });

// A one-skill, one-agent checkout, so a source can change between runs.
export function miniRoot() {
  const root = tmpDir('do-it-mini-');
  fs.mkdirSync(path.join(root, 'skills', 'a-it'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills', 'a-it', 'SKILL.md'), 'a');
  fs.mkdirSync(path.join(root, 'agents'));
  fs.writeFileSync(path.join(root, 'agents', 'x.md'), 'v1');
  return root;
}

export function quiet(fn) {
  const log = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
  }
}

// A one-skill checkout pushed to a bare remote.
export function seed() {
  const dir = tmpDir('do-it-seed-');
  const remote = tmpDir('do-it-ref-remote-');
  gitOut(dir, ['init', '-q', '-b', 'main']);
  gitOut(dir, ['config', 'user.name', 't']);
  gitOut(dir, ['config', 'user.email', 't@t']);
  gitOut(dir, ['config', 'commit.gpgsign', 'false']);
  fs.mkdirSync(path.join(dir, 'skills', 'a-it'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'skills', 'a-it', 'SKILL.md'), 'a');
  gitOut(dir, ['add', '-A']);
  gitOut(dir, ['commit', '-qm', 'init']);
  gitOut(remote, ['init', '-q', '--bare', '-b', 'main']);
  gitOut(dir, ['remote', 'add', 'origin', remote]);
  gitOut(dir, ['push', '-q', 'origin', 'main']);
  return { dir, remote };
}

// A clone of `remote`, which is where an installer or the doctor reads a ref from.
export function clone(remote) {
  const dir = path.join(tmpDir('do-it-ref-clone-'), 'repo');
  gitOut(path.dirname(dir), ['clone', '-q', remote, dir]);
  gitOut(dir, ['config', 'user.name', 't']);
  gitOut(dir, ['config', 'user.email', 't@t']);
  gitOut(dir, ['config', 'commit.gpgsign', 'false']);
  return dir;
}
