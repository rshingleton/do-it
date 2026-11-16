// What a list of files is, and when two lists share one: the parse and the compare the contract,
// the phase check and a roadmap hint all use, so they cannot drift apart. A path is compared
// exactly, never as a directory prefix, and nothing here reads the filesystem.

// One line of a section: no leading bullet, no backticks, no run of spaces.
export function cleanLine(line) {
  return line.replace(/^[-\s]+/, '').replace(/`/g, '').replace(/\s+/g, ' ').trim();
}

// One repo-relative file per piece. `./x` and `x` are the same path; a comment is not a file.
function fileOf(piece) {
  const text = cleanLine(piece);
  return text && !text.startsWith('#') ? text.replace(/^\.\//, '') : null;
}

// The paths a text lists, in input order with duplicates kept, comma or newline separated. A
// comment line is dropped whole, so a comma in it does not become a path.
// shortcut: a comma always separates, so a path containing one splits; split on newlines only if that appears.
export function parseFileList(text) {
  return text
    .split(/\r?\n/)
    .flatMap((line) => (cleanLine(line).startsWith('#') ? [] : line.split(',')))
    .map(fileOf)
    .filter(Boolean);
}

// The paths both lists name, each once, in `a`'s order. Exact equality: `src/a/x.js` and
// `src/a/y.js` do not overlap.
export function sharedPaths(a, b) {
  const other = new Set(b);
  const seen = new Set();
  return a.filter((p) => {
    if (!other.has(p) || seen.has(p)) return false;
    seen.add(p);
    return true;
  });
}
