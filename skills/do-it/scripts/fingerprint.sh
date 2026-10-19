#!/usr/bin/env bash
# Print a hash of the change since a base ref: tracked edits plus untracked
# files, excluding the planning directory. prove-it records it; ship-it
# compares it to detect code that moved after the audit.
#
# Usage: fingerprint.sh <base_ref> [planning_dir]
# Runs from the repo root whatever the current directory, so the hash is the
# same from anywhere. Exits non-zero when the base does not resolve.
set -euo pipefail

base="${1:?usage: fingerprint.sh <base_ref> [planning_dir]}"
planning="${2:-docs/planning}"

cd "$(git rev-parse --show-toplevel)"

# Before the first commit there is nothing to diff against but the empty tree.
if git rev-parse --verify --quiet "$base^{commit}" >/dev/null; then
  :
elif ! git rev-parse --verify --quiet HEAD >/dev/null; then
  base="$(git hash-object -t tree /dev/null)"
else
  echo "fingerprint.sh: unknown base ref: $base" >&2
  exit 2
fi

{
  git diff --binary "$base" -- . ":(exclude)$planning"
  git ls-files -z --others --exclude-standard -- . ":(exclude)$planning" |
    while IFS= read -r -d '' f; do
      printf '%s\n' "$f"
      # Symlinks hash by target; directories (nested repos) by name only.
      if [ -L "$f" ]; then
        readlink -- "$f"
      elif [ -f "$f" ]; then
        cat -- "$f"
      fi
    done
} | git hash-object --stdin
