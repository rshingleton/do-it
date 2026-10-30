// The reasons a complete run stops or parks a slice. One table: the gate in
// gate.mjs returns these codes, and finish-it's STOPS.md names the same ones
// (a test compares them). `how` says who decides: the script ("gate") or the
// model's judgment ("judgment", named in STOPS.md because no script can see it).
// `action`: park the slice and go on, or stop the whole run.

export const STOPS = {
  STALE_VERIFY: { how: 'gate', action: 'park', note: 'code changed since the last passing verify-phase' },
  UNVERIFIED: { how: 'gate', action: 'park', note: 'no passing verify-phase recorded for the slice' },
  FLAKY: { how: 'gate', action: 'park', note: 'a check failed, then passed on its one rerun' },
  SLICE_CAP: { how: 'gate', action: 'park', note: 'the slice ran past its wall-clock cap' },
  MAX_SLICES: { how: 'gate', action: 'stop', note: 'the run shipped its slice cap' },
  AUDIT_CAP: { how: 'gate', action: 'stop', note: 'the run spent every audit round its cap allows' },
  OUTCOME_CONFLICT: { how: 'judgment', action: 'park', note: 'the slice conflicts with the outcome or a non-goal' },
  IRREVERSIBLE: { how: 'judgment', action: 'park', note: 'the next step cannot be undone' },
  AUDIT_FAILED_3: { how: 'judgment', action: 'park', note: 'third failed audit in a row' },
  DEFERRED_DECISION: { how: 'judgment', action: 'park', note: 'the slice needs a decision deferred up front' },
  USER_INTERRUPT: { how: 'judgment', action: 'stop', note: 'the user interrupted' },
};
