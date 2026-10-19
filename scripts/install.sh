#!/usr/bin/env bash
# Install do-it from this checkout by symlinks, for Claude Code and OpenCode.
#
#   scripts/install.sh [--no-hooks] [--force] [--dry-run] [--uninstall]
#
# Skills:   skills/<name>    -> ~/.claude/skills/<name> and ~/.agents/skills/<name>
# Commands: .opencode/command/<name>.md -> ~/.config/opencode/command/<name>.md
# Hooks:    on by default; registered in ~/.claude/settings.json and
#           ~/.config/opencode/opencode.json (backups written alongside).
#
# An existing link or directory that is not ours is left alone unless --force.
# Using the Claude Code plugin instead? Skip this script for Claude; the plugin
# carries skills and hooks itself.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hooks=1 force=0 dry=0 uninstall=0
for arg in "$@"; do
  case "$arg" in
    --no-hooks) hooks=0 ;;
    --force) force=1 ;;
    --dry-run) dry=1 ;;
    --uninstall) uninstall=1 ;;
    -h | --help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

config_home="${XDG_CONFIG_HOME:-$HOME/.config}"
skill_dirs=("$HOME/.claude/skills" "$HOME/.agents/skills")
command_dir="$config_home/opencode/command"

run() {
  if [ "$dry" = 1 ]; then echo "would: $*"; else "$@"; fi
}

# link <source> <target>: create or refresh a symlink we own.
link() {
  local src="$1" dst="$2"
  if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then
    return 0
  fi
  if [ -e "$dst" ] || [ -L "$dst" ]; then
    if [ "$force" = 0 ]; then
      echo "skip  $dst (exists: $(readlink "$dst" 2>/dev/null || echo 'not a link'); --force to replace)"
      return 0
    fi
    run rm -rf "$dst"
  fi
  run ln -s "$src" "$dst"
  echo "link  $dst"
}

# unlink_ours <target> <expected source>
unlink_ours() {
  if [ -L "$1" ] && [ "$(readlink "$1")" = "$2" ]; then
    run rm "$1"
    echo "unlink $1"
  fi
}

if [ "$uninstall" = 1 ]; then
  for dir in "${skill_dirs[@]}"; do
    for skill in "$root"/skills/*/; do
      unlink_ours "$dir/$(basename "$skill")" "${skill%/}"
    done
  done
  for cmd in "$root"/.opencode/command/*.md; do
    unlink_ours "$command_dir/$(basename "$cmd")" "$cmd"
  done
  if [ "$dry" = 1 ]; then
    node "$root/scripts/install-hooks.mjs" claude --remove --dry-run
    node "$root/scripts/install-hooks.mjs" opencode --remove --dry-run
  else
    node "$root/scripts/install-hooks.mjs" claude --remove
    node "$root/scripts/install-hooks.mjs" opencode --remove
  fi
  exit 0
fi

command -v node >/dev/null || { echo "do-it needs Node 18 or later on PATH" >&2; exit 1; }

for dir in "${skill_dirs[@]}"; do
  run mkdir -p "$dir"
  for skill in "$root"/skills/*/; do
    link "${skill%/}" "$dir/$(basename "$skill")"
  done
done

run mkdir -p "$command_dir"
for cmd in "$root"/.opencode/command/*.md; do
  link "$cmd" "$command_dir/$(basename "$cmd")"
done

if [ "$hooks" = 1 ]; then
  extra=()
  [ "$dry" = 1 ] && extra=(--dry-run)
  # ${a[@]+...} keeps bash 3.2 (macOS) quiet about an empty array under set -u.
  node "$root/scripts/install-hooks.mjs" claude ${extra[@]+"${extra[@]}"}
  node "$root/scripts/install-hooks.mjs" opencode ${extra[@]+"${extra[@]}"} || echo "OpenCode hooks not registered; see README"
fi

echo "do-it installed from $root"
