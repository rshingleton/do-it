# Standards while building

Mechanical rules are enforced by the do-it hooks as you edit (secrets,
`.compliance-rules/checks.json`, the configured lint command). Judgement-call
standards are enforced by `prove-it`. This file is what the builder does.

## 1. Discover (once per session)

| Source | Use for |
|--------|---------|
| `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md` | Process and conventions |
| `CODING_STANDARDS.md`, `STANDARDS.md`, `STYLE.md` | Explicit style rules |
| `.compliance-rules/*.md` | Org rules prove-it will check |
| `GLOSSARY.md`, `docs/adr/` near the change | Vocabulary and constraints |
| The `Commands:` line in `AGENTS.md` (written by setup-it), and `DO_IT_LINT_CMD` | The test, lint, format and type-check commands |

Read the commands from there first. Only when they are missing, find them in
lint and format configs, `package.json` scripts, the `Makefile` or the CI
workflow, and mention `/setup-it` once in the closing message. Run them
rather than checking by eye.

## 2. While coding

Follow the `it-core` posture. In addition:

- The phase file (or the S plan) and its linked ADRs are the contract. No
  drive-by refactors outside the phase's scope.
- Tests and identifiers use `GLOSSARY.md` terms.
- A hook that blocks an edit is right until shown otherwise: fix the edit, do
  not work around the hook. If the rule is wrong for this case, stop and say
  which rule and why.

## 3. Self-check before marking a unit done

```text
[ ] Every "→ verify:" check in the unit passes
[ ] No behaviour beyond the unit's scope and linked ADRs
[ ] Test, lint, format, type-check green
[ ] No secrets, credential comments, or .env files in the change
[ ] Every known limit carries `shortcut: <the limit>, <when to upgrade>`
[ ] New files are listed in the closing message (untracked files hide from git diff)
```
