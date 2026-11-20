---
status: accepted
---

# The version bumps once per release, never per slice

Claude Code decides a plugin update from `version` in
`.claude-plugin/plugin.json`, so a change under `skills/`, `agents/` or
`hooks/` must move it or plugin users never receive it
([0013](0013-routes-and-the-version-gate.md)). The gate enforcing that ran
inside `npm run check`, which every slice runs, so each slice that touched a
gated path bumped both manifests itself. In a run with parallel lanes that is
two lanes editing the same line of the same file: the plans name
`plugin.json`, the pre-flight reads that as a shared file and refuses to pair
them, so the run serialises, and one shipment collects a bump from each slice
and another at release.

The version is a release fact, so it moves once per release. The gate stays,
as a release check: CI runs it on a pull request and on a push to `main`;
`npm run check` no longer runs it. A slice never names a release version in
its plan, and the commit that lands the branch sets it, keeping
`.claude-plugin/plugin.json` and `package.json` equal.

## Options considered

- Keep the gate in the local check and settle the shared bump at land
  (rejected): the plans still name the same file, the pre-flight still
  serialises every pair, and the merge still conflicts on one line.
- Let a merge driver take `ours` for the two files (rejected): it needs local
  git config on every clone and hides a real difference when two releases
  land out of order.
- Omit `version` and let the commit SHA be the version (already rejected in
  [0013](0013-routes-and-the-version-gate.md#options-considered)): a published
  route needs a number a release can name.
- Bump once when the run branch is created (rejected): a long run may hold
  more than one release, and the number is chosen before the release exists.

## Consequences

- A pull request that changes `skills/`, `agents/` or `hooks/` still fails CI
  without a bump, so the release commit carries it. `npm run check` alone no
  longer catches that, which is the point: the local loop answers for the
  slice, the release answers for the version.
- Two lanes never contend for the manifest, and the only shared files that
  serialise a run are real overlaps.
- The `package.json` equality check also moves to the release boundary.
