---
name: guard-it
description: Check a change against the repo's compliance rules, security policy, secret and dependency policy, and report findings by severity. Use for a compliance or security pre-flight, before a PR is marked ready, when prove-it runs its compliance reviewer, or when the user asks to add or tune a compliance rule.
---

# guard-it

Two layers, one rule set:

| Layer | Where | Enforced by |
|-------|-------|-------------|
| Mechanical (a regex decides) | `.compliance-rules/checks.json` plus built-in secret rules | do-it hooks, on every edit and every `git commit` |
| Judgement | `.compliance-rules/*.md`, `SECURITY_POLICY.md`, `docs/agents/compliance/` | this skill, run by `prove-it` or on request |

`DO_IT_COMPLIANCE_DIR` moves the rules directory (see the track-it skill's
CONFIG.md).

## Check a change

1. **Scope.** The change under review: from `prove-it`, its diff and untracked
   files; on request, `git diff HEAD` plus untracked files, or the range the
   user names.
2. **Mechanical.** Run the hook scanner over the same change so nothing the
   hooks would catch is missed:

   ```bash
   node <this skill's dir>/scripts/scan.mjs [--since <ref>]
   ```

3. **Rules.** Read every `*.md`, `*.yaml` and `*.yml` in the rules directory,
   plus `SECURITY_POLICY.md` (root or `docs/`) when present. Apply each rule to
   the change. A rule's stated severity sets the group: HIGH or none stated is
   **Must**, MEDIUM is **Should**, LOW is **Nice**. A breach of the security
   policy is **Must**.
4. **Dependencies.** For changed manifests: no `*` or unbounded `>=` ranges,
   no unofficial registries, cross-check `.dependency-audit.json` when it
   exists.

Report in prove-it's finding contract
([REPORT.md](../prove-it/REPORT.md)): concrete `file:line`, never the secret
value itself, the smallest fix.

## Add a mechanical rule

When a judgement rule keeps failing the same way, or prove-it lists a
guardrail candidate, propose a `checks.json` entry:

```json
[
  {
    "id": "no-console-log",
    "severity": "MEDIUM",
    "pattern": "console\\.log\\(",
    "files": [".ts", ".tsx"],
    "message": "Use the project logger."
  },
  { "id": "jwt", "disabled": true }
]
```

- `severity`: HIGH blocks the edit; MEDIUM and LOW are reported to the agent.
- `filePattern` instead of `pattern` matches the edited path.
- `{"id": "<built-in id>", "disabled": true}` turns off a built-in rule.
- A line containing `do-it: allow` is skipped; say why whenever you use it.

Show the entry and a line it would catch; add it only when the user agrees.
