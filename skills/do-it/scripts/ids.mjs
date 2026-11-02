// Work ids, roadmap slugs and the `<work id>#<n>` keys a run record keeps for assumptions. One
// pattern, so items.mjs, digest.mjs, run.mjs and runs.mjs agree on what an id is.

// A slug or a work id: letters, digits, `_`, `.` and `-`, starting with a letter or digit.
export const ID = '[A-Za-z0-9][A-Za-z0-9_.-]*';
const ID_ONLY = new RegExp(`^${ID}$`);
export const isId = (s) => typeof s === 'string' && ID_ONLY.test(s);

// A recorded assumption or rejection, `<work id>#<n>` with an optional `: text`.
export function splitKey(s) {
  const m = new RegExp(`^(${ID})#(\\d+)(?:: (.*))?$`, 's').exec(s ?? '');
  return m ? { id: m[1], n: Number(m[2]), text: m[3] } : null;
}
