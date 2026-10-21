# Drafting a lane S plan with the planner

Lane S only, and only when the work touches a risk area
([LANES.md](../do-it/LANES.md)) or the user asks for a top-tier plan; lane M
keeps the grill and the plan in the main context. It writes the plan on the
top-tier model while the session stays on the mid tier, at roughly twice the
cost of drafting a small plan in the main context (measured on one request),
so it is not the default.

Call the Agent tool once with the `it-planner` agent (top tier, reply under
300 words) and give it:

- the request or issue ref, the lane, the work id, and the planning directory;
- the scout notes from `do-it` and the user's answers to the 0-3 questions;
- pointers to [SKILL.md](SKILL.md) (it does §3 and the analyze pass),
  [PLAN-FORMAT.md](PLAN-FORMAT.md), [CHECKS.md](CHECKS.md) and
  [STATE.md](../do-it/STATE.md), never the conversation.

Brief: "Do scope-it §3 and the analyze pass for this lane S item. Write only
under the planning directory. Return the plan path, the assumptions, and any
question only the user can answer, each with your recommended answer. Under
300 words."

Once you have chosen it, do not write the plan yourself while the agent is
available. The main session reads the plan file, runs the builder check from
CHECKS.md, and presents the plan for approval as usual (§5). Without the
agent (OpenCode, or an install that skipped it), write the plan in the main
context.
