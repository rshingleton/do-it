# Audit report

## Finding contract

- **Concrete case or no finding.** Every finding names a file and line, an
  input, or a scenario. Re-read the lines before reporting. No "consider", no
  vague worries.
- **Recorded decisions are not findings.** Anything the plan, a linked ADR, an
  approved assumption, or a `shortcut:` marker with its limit records is not
  flagged, unless the change contradicts it; then cite the decision.
- **Groups.** **Must** blocks: a failed mechanical check, a missing or wrong
  requirement, scope creep, a HIGH (or unrated) compliance rule, egregious
  accretion against the plan. **Should** and **Nice** do not block. A Must
  counts only once validated ([VALIDATE.md](VALIDATE.md)); rejected ones are
  listed under **Not confirmed** with the validator's reason.
- **One numbering** across groups, Must first, so the user can say "fix 2
  and 5".
- **One line each**, under 40 words:
  `n. Must|Should|Nice | file:line | claim | case. Fix: <smallest fix>.`
  The user asks for a finding's full write-up when they want it.
- review-it's Spec and Standards reports go in verbatim under a one-line
  verdict; do not rerank them.

## Shape

```markdown
# Audit: <id> (round <n>)

Change: <base_ref>..working tree, <N> files. Date: <ISO date>.

| Check | Result |
|-------|--------|
| Mechanical | PASS: npm test, npm run lint |
| Spec | PASS |
| Standards | NOTES |
| Compliance | PASS: checks.json, 3 rule files |
| Architecture | OK |

## Findings

1. Must | `config/.env:3` | live token committed | read at startup, ships with first commit. Fix: delete it, ignore `config/.env`, add `.env.example`.
2. Should | ...

## Not confirmed
- <claim>: rejected by validation, <reason>. Overrule by saying so.

## Guardrail candidates
- <mechanical rule>: <checks.json pattern or lint rule that would catch it>

## Spec
<review-it Spec report, verbatim>

## Standards
<review-it Standards report, verbatim>

Verdict: FAIL, fix 1 first.
Not checked: <what mattered and could not be checked, or nothing>
```
