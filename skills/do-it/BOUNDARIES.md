# Between steps

Each step hands off through the state block, so the conversation is never
the record. Decide what to do with the context only at a step boundary,
never in the middle of a step.

| At the boundary | Do |
|-----------------|----|
| Lane XS or S, context still small | Continue in the same session |
| Plan approved on lane M (the grill filled the context) | Suggest a fresh session: the user clears, then runs `/do-it <id>`; build starts from the plan alone |
| Between M phases built in place, context getting long | Same: fresh session, `/do-it <id>` resumes from the frontier |
| Lane M build done, before the audit; or any step with the context past about 100k tokens | Same: fresh session, `/do-it <id>` resumes at `prove-it`. The reviewers start cold from pointers, so nothing in this conversation is needed |
| Switching agent or host (Claude Code to OpenCode, or another person) | Follow [pass-it](../pass-it/SKILL.md): it points at the work item instead of restating it |
| Audit | Nothing to do: prove-it's reviewers already run in fresh subagents |

Rules:

- Suggest, do not force: one line in the closing message, e.g. "Plan
  approved. A fresh session keeps the build focused: clear, then
  `/do-it login-rate-limit`."
- Before suggesting a fresh session, make sure the state block holds
  everything the next step needs (approvals, assumptions, blocker).
- Compaction is the last resort: it keeps a summary of the conversation, not
  the plan. Prefer a fresh session that reads the plan.

## Models

The steps run by reading their files, so a step's own `model:` frontmatter
never applies inside this flow, and a skill's model override lasts only for
the turn it is set in. The session model runs the whole flow. Set it to the
mid-tier model for everyday work and pick the top tier yourself for a lane M
grill; the agents the steps start pin their own tiers, so a cheap session can
still use the top tier where a skill names one (planning, with `it-planner`,
is opt-in: see [PLANNER.md](../scope-it/PLANNER.md)).
