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
  accretion against the plan. **Should** and **Nice** do not block.
- **One numbering** across groups, Must first, so the user can say "fix 2
  and 5".
- **Four parts**, one or two sentences each: what it is, the problem, the
  smallest fix, the cost of skipping it.
- code-review's Spec and Standards reports go in verbatim under a one-line
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

### Must
1. **`.env` added with a live token** (`config/.env:3`)
   - **What this is:** The change adds `config/.env`, read at startup.
   - **Problem:** Line 3 holds a real token.
   - **Fix:** Delete it, add `config/.env` to `.gitignore`, add `.env.example`.
   - **If we skip it:** The token ships with the first commit.

### Should
2. ...

## Guardrail candidates
- <mechanical rule>: <checks.json pattern or lint rule that would catch it>

## Spec
<code-review Spec report, verbatim>

## Standards
<code-review Standards report, verbatim>

Verdict: FAIL, fix 1 first.
Not checked: <what mattered and could not be checked, or nothing>
```
