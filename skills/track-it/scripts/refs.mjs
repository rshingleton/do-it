// Classify a tracker reference by its shape, so a ref always routes to the
// tracker it came from, whatever the configured default is.

export function parseRef(ref) {
  const s = String(ref || '').trim();
  let m;
  // Any host: github.com and GitHub Enterprise both use /owner/repo/issues/N.
  if ((m = s.match(/^https?:\/\/[^/]+\/([^/]+\/[^/]+)\/issues\/(\d+)/))) {
    return { kind: 'github', repo: m[1], number: Number(m[2]) };
  }
  if ((m = s.match(/^([\w.-]+\/[\w.-]+)#(\d+)$/))) return { kind: 'github', repo: m[1], number: Number(m[2]) };
  if ((m = s.match(/^(?:#|gh-)(\d+)$/i))) return { kind: 'github', number: Number(m[1]) };
  if ((m = s.match(/^https?:\/\/.+\/browse\/([A-Za-z][A-Za-z0-9_]+-\d+)/))) return { kind: 'jira', key: m[1].toUpperCase() };
  if ((m = s.match(/^([A-Za-z][A-Za-z0-9_]+-\d+)$/))) return { kind: 'jira', key: m[1].toUpperCase() };
  if (/\.md$/i.test(s)) return { kind: 'local', path: s };
  return null;
}

export function slugify(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '') || 'issue';
}
