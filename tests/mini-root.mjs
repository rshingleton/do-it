// A one-skill, one-agent checkout the two link suites install from, with the
// two helpers they share: a refused symlink and a silenced install's chatter.
import fs from 'node:fs';
import path from 'node:path';
import { tmpDir } from './env.mjs';

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
