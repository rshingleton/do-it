#!/usr/bin/env bash
# Install do-it from this checkout by symlinks, for Claude Code and OpenCode.
#
#   scripts/install.sh [--no-hooks] [--force] [--dry-run] [--uninstall]
#   bash <(curl -fsSL https://raw.githubusercontent.com/rshingleton/do-it/main/scripts/install.sh)
#
# Run from a pipe (no checkout around it), it clones DO_IT_REPO into
# DO_IT_HOME (default ~/.local/share/do-it), or pulls that clone, then runs
# the clone's copy with the same options.
#
# Skills:   skills/<name>    -> ~/.claude/skills/<name> and ~/.agents/skills/<name>
# Agents:   agents/<name>.md -> ~/.claude/agents/<name>.md (Claude Code only)
# Commands: .opencode/command/<name>.md -> ~/.config/opencode/command/<name>.md
# Hooks:    on by default; registered in ~/.claude/settings.json and
#           ~/.config/opencode/opencode.json (backups written alongside).
#
# An existing link or directory that is not ours is left alone unless --force.
# Using the Claude Code plugin instead? Skip this script for Claude; the plugin
# carries skills, agents and hooks itself.
set -euo pipefail

# Piped (`bash <(curl ...)`, `curl | bash`), the source is a pipe or unset.
src="${BASH_SOURCE[0]:-}"
root=""
[ -f "$src" ] && root="$(cd "$(dirname "$src")/.." && pwd)"
hooks=1 force=0 dry=0 uninstall=0
for arg in "$@"; do
  case "$arg" in
    --no-hooks) hooks=0 ;;
    --force) force=1 ;;
    --dry-run) dry=1 ;;
    --uninstall) uninstall=1 ;;
    -h | --help)
      if [ -f "$src" ]; then sed -n '2,20p' "$src"; else echo "usage: install.sh [--no-hooks] [--force] [--dry-run] [--uninstall]"; fi
      exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# No checkout here: we were piped in. Fetch or refresh the clone and hand over.
if [ ! -d "$root/skills" ] || [ ! -f "$root/scripts/install-hooks.mjs" ]; then
  repo="${DO_IT_REPO:-https://github.com/rshingleton/do-it.git}"
  home="${DO_IT_HOME:-$HOME/.local/share/do-it}"
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
  exec bash "$home/scripts/install.sh" "$@"
fi

config_home="${XDG_CONFIG_HOME:-$HOME/.config}"
skill_dirs=("$HOME/.claude/skills" "$HOME/.agents/skills")
command_dir="$config_home/opencode/command"
agent_dir="$HOME/.claude/agents"

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

# unlink_ours <dir> <prefix>: remove every symlink in <dir> that points under
# <prefix>, including links to skills since renamed or removed.
unlink_ours() {
  local entry target
  for entry in "$1"/*; do
    [ -L "$entry" ] || continue
    target="$(readlink "$entry")"
    case "$target" in
      "$2"/*)
        run rm "$entry"
        echo "unlink $entry"
        ;;
    esac
  done
}

if [ "$uninstall" = 1 ]; then
  for dir in "${skill_dirs[@]}"; do
    unlink_ours "$dir" "$root/skills"
  done
  unlink_ours "$agent_dir" "$root/agents"
  unlink_ours "$command_dir" "$root/.opencode/command"
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

run mkdir -p "$agent_dir"
for agent in "$root"/agents/*.md; do
  link "$agent" "$agent_dir/$(basename "$agent")"
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
