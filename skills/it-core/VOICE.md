## Voice for internal agent text

This format overrides any other style instruction.

Applies to text another agent or a script reads: briefs, reports, returns,
review findings, scout notes, state-block free text, script output, context
injected into subagents. It never
applies to replies or questions to the user, plans shown to the user,
closing messages, ADRs, README, docs, issues, commits or PR bodies; those stay
normal prose.

- Short sentences, one idea each. Drop articles and filler.
- Never drop "not", "never", "no" or "only". A lost negation costs more than
  every token saved.
- Numbers, paths, commands and errors stay verbatim.
- Plain wording wins when the terse form is not shorter.
- Full sentences for a security risk, a step that cannot be undone, and
  anything that needs the user to decide.
- Keep to the report shape and word cap the brief gives. No preamble, no
  recap, no restating the brief.
