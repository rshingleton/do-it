// The host binary as this machine installs it. npm writes a shim on Windows: a
// bare `claude` or `opencode` beside `claude.cmd` and `claude.ps1`, and a spawn
// by the bare name misses it (ENOENT, or EINVAL once Node refused to run a .cmd
// without a shell). The doctor asks `claude` what it holds and the installer asks
// `opencode` which config form to write, so the lookup is here rather than in
// either one.

import fs from 'node:fs';
import path from 'node:path';

// Every PATH entry checked directly, with quotes stripped: a copy-pasted quoted
// value leaves one inside the entry, and the shell then misses a binary `where`
// finds. A .cmd or .bat needs the shell to run it, an .exe does not. Elsewhere
// the bare name is the answer, since the platform resolves it itself.
export function hostBin(name, { platform = process.platform, env = process.env } = {}) {
  const bare = { cmd: name, shell: false };
  if (platform !== 'win32') return bare;
  const files = [`${name}.exe`, `${name}.cmd`, `${name}.bat`];
  for (const entry of String(env.PATH ?? '').split(path.delimiter)) {
    const dir = entry.replaceAll('"', '').trim();
    if (!dir) continue;
    for (const file of files) {
      if (!fs.existsSync(path.join(dir, file))) continue;
      return { cmd: path.join(dir, file), shell: !/\.exe$/i.test(file) };
    }
  }
  return bare;
}
