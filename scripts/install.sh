#!/usr/bin/env bash
# Install do-it from this checkout by links, for Claude Code and OpenCode.
#
#   scripts/install.sh [--no-hooks] [--force] [--dry-run] [--uninstall]
#   bash <(curl -fsSL https://raw.githubusercontent.com/rshingleton/do-it/main/scripts/install.sh)
#
# This is only the bootstrap. Run from a pipe (no checkout around it), it
# clones DO_IT_REPO into DO_IT_HOME (default ~/.local/share/do-it), or pulls
# that clone. Either way it then hands over to scripts/install.mjs, which does
# the linking on every platform; see that file for what goes where.
#
# An existing link or directory that is not ours is left alone unless --force.
# Using the Claude Code plugin instead? Skip this script for Claude; the plugin
# carries skills, agents and hooks itself.
set -euo pipefail

# Piped (`bash <(curl ...)`, `curl | bash`), the source is a pipe or unset.
src="${BASH_SOURCE[0]:-}"
root=""
[ -f "$src" ] && root="$(cd "$(dirname "$src")/.." && pwd)"
dry=0 uninstall=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry=1 ;;
    --uninstall) uninstall=1 ;;
    -h | --help)
      if [ -f "$src" ]; then sed -n '2,14p' "$src"; else echo "usage: install.sh [--no-hooks] [--force] [--dry-run] [--uninstall]"; fi
      exit 0 ;;
  esac
done

command -v node >/dev/null || { echo "do-it needs Node 18 or later on PATH" >&2; exit 1; }

# No checkout here: we were piped in. Fetch or refresh the clone and hand over.
if [ ! -d "$root/skills" ] || [ ! -f "$root/scripts/install.mjs" ]; then
  repo="${DO_IT_REPO:-https://github.com/rshingleton/do-it.git}"
  home="${DO_IT_HOME:-$HOME/.local/share/do-it}"
  # Git Bash: give node and git a path they both read (C:/...), not /c/...
  if command -v cygpath >/dev/null; then home="$(cygpath -m "$home")"; fi
  command -v git >/dev/null || { echo "do-it needs git on PATH" >&2; exit 1; }
  if [ -d "$home/.git" ]; then
    if [ "$dry" = 0 ] && [ "$uninstall" = 0 ]; then
      echo "updating $home"
      git -C "$home" pull --ff-only --quiet
    fi
  elif [ "$dry" = 1 ] || [ "$uninstall" = 1 ]; then
    echo "would clone $repo into $home; nothing installed from there yet"
    exit 0
  else
    echo "cloning $repo into $home"
    mkdir -p "$(dirname "$home")"
    git clone --quiet "$repo" "$home"
  fi
  root="$home"
fi

exec node "$root/scripts/install.mjs" "$@"
