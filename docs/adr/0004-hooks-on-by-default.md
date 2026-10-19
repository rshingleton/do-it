---
status: accepted
---

# Standards and compliance hooks on by default

do-it ships hooks for Claude Code (SessionStart, SubagentStart, PreToolUse, PostToolUse) and an equivalent OpenCode plugin, enabled by default and disabled with `DO_IT_HOOKS=off`. Rules are split by who can decide them: anything a regex decides (secrets, env files, `.compliance-rules/checks.json`) is enforced by hooks on every edit and every `git commit`; judgement rules in `.compliance-rules/*.md` are checked by `audit-it`. HIGH findings block the edit; MEDIUM and LOW are reported back to the agent. Hooks fail open on crashes so a bug in a hook never blocks work, and a `do-it: allow` marker on a line covers false positives. audit-it's guardrail candidates feed new `checks.json` rules, so judgement findings that keep recurring become mechanical ones.
