---
name: doubt-it
description: Adversarially check a claim before acting on it, using a fresh-context subagent that tries to prove it wrong. Use before a risky or hard-to-reverse step, when a diagnosis or "this is safe" conclusion rests on reasoning rather than evidence, or when the user asks to double-check or sanity-check a conclusion.
---

# doubt-it

A conclusion reached in a long context tends to defend itself. Check it from
outside.

1. **Claim.** State it in one sentence, falsifiable: "Removing `retryCount`
   changes no behaviour: nothing reads it outside `Client`."
2. **Evidence.** List what it rests on: files read, commands run, outputs
   seen. Mark anything inferred rather than observed.
3. **Doubt.** Start one `it-skeptic` agent (top tier: a cheaper model checks less
   well, which defeats the point) with only the claim, the evidence list and
   pointers to the code. Not your reasoning. Brief: "Try to show this claim
   is false. Check each piece of evidence yourself. Report a concrete
   counterexample (file and line, input, command output), or say none was
   found and what you checked. Under 200 words."
4. **Reconcile.**
   - Counterexample: the claim is wrong or narrower. Restate it, fix the
     plan, and say what changed.
   - None found: proceed, and name what the subagent could not check under
     Not checked.
5. **Stop.** One round. A second round only when the first found a
   counterexample and the claim was restated.

Use it sparingly: on the claim a risky step depends on, not on every step.
