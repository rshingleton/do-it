---
status: accepted
---

# Lanes over a fixed six-step chain

The Doc Cycle in rshingleton/skills ran issue, plan, implement, audit, verify and commit for every change, so a one-line fix paid for a plan directory, a grill and an audit report. do-it sizes each piece of work into a lane (XS, S, M, L) and runs only the steps that lane needs, with `/do-it` as the single entry. Each step stays callable on its own. The cost is a sizing judgement on every request; the rule "when unsure, pick the larger lane" and a list of risk areas that force at least S keep that judgement on the safe side.
