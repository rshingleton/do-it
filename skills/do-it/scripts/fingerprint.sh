#!/usr/bin/env bash
# Print a hash of the change since a base ref: tracked edits plus untracked
# files, excluding the planning directory. audit-it records it; ship-it
# compares it to detect code that moved after the audit.
#
# Usage: fingerprint.sh <base_ref> [planning_dir]
set -euo pipefail

base="${1:?usage: fingerprint.sh <base_ref> [planning_dir]}"
planning="${2:-docs/planning}"

{
  git diff --binary "$base" -- . ":(exclude)$planning"
  git ls-files -z --others --exclude-standard -- . ":(exclude)$planning" |
    while IFS= read -r -d '' f; do
      printf '%s\n' "$f"
      cat -- "$f"
    done
} | git hash-object --stdin
