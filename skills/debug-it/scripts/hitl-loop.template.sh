#!/usr/bin/env bash
# Person-in-the-loop repro script for debug-it.
# For bugs only a person can trigger (a click, a device, a login you must not
# automate). Copy this file, replace the steps between the markers, and run
# it; the agent runs it and the person answers the prompts in the terminal.
# Run with: bash hitl-loop.template.sh
# Helpers:
#   ask_to "<what to do>"            print an instruction, wait for Enter
#   record NAME "<what to report>"   print a question, store the answer in NAME
# Recorded answers are printed at the end as NAME=value lines for the agent to
# read. They are echoed to the terminal, so record what was observed, never a
# password or token; ask the person to sign in themselves with ask_to.

set -eu -o pipefail

ask_to() {
  printf '\n== %s\n' "$1"
  read -r -p "   (press Enter when done) " _ignored
}

record() {
  local name="$1" prompt="$2" reply
  printf '\n== %s\n' "$prompt"
  read -r -p "   answer: " reply
  printf -v "$name" '%s' "$reply"
  recorded+=("$name")
}

recorded=()

# ---- steps: replace these -------------------------------------------------

ask_to "Start the app locally and sign in as a test user."

record SAW_ERROR "Open Reports and press 'Download CSV'. Did an error appear? (y/n)"

record ERROR_TEXT "Copy the error text shown, or type none:"

# ---- end of steps ---------------------------------------------------------

printf '\n== recorded\n'
# ${a[@]+...} keeps bash 3.2 quiet under set -u when nothing was recorded.
for name in ${recorded[@]+"${recorded[@]}"}; do
  printf '%s=%s\n' "$name" "${!name}"
done
