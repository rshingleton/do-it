// True when the calling module is the script node was started on.
// Compare real paths: Node resolves symlinks for import.meta.url but not
// argv[1]. argv[1] may not be a file at all (stdin, -e), so a failure means
// "imported, not run". Call it as isMain(import.meta.url).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function isMain(metaUrl) {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}
