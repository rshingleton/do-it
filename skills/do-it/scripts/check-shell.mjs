// The `shell` option for running a verify check. Checks are written in bash
// syntax (`!`, single quotes, `&&`). On Windows cmd.exe cannot read that, so
// use Git Bash, the shell Claude Code's Bash tool runs, when it is installed;
// otherwise fall back to the platform default. Not WSL's bash.exe in System32.
import fs from 'node:fs';
import path from 'node:path';

export function checkShell(platform = process.platform, env = process.env) {
  if (platform !== 'win32') return true;
  const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs')];
  const found = roots
    .filter(Boolean)
    .flatMap((r) => [path.join(r, 'Git', 'bin', 'bash.exe'), path.join(r, 'Git', 'usr', 'bin', 'bash.exe')])
    .find((p) => fs.existsSync(p));
  return found ?? true;
}
