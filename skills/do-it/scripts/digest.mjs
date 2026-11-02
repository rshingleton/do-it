// The run digest: counted facts from a run record, rendered as markdown.
// Pure: work.mjs gathers the git tags and the optional inputs. No estimates of
// time or money; every figure is a count or a value read from the record.

import { ID, splitKey } from './ids.mjs';

// The only tag the digest prints: `do-it/<work id>/phase-<n>`, as the run commit makes it.
const TAG = new RegExp(`^do-it/${ID}/phase-\\d+$`);

const RETRO = ['Worked', 'Failed', 'Change', 'Next'];
// Free text from the agent, the user or a tool (a reason, a limit, an assumption, a finding, a retro line): one
// line, so it cannot open a heading or a bullet of its own.
const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();
const bullets = (items, none = 'none') => (items.length ? items.map((x) => `- ${oneLine(x)}`) : [`- ${none}`]);

// An assumption from a work item is stored `<id>#<n>: text`; show the id and the
// item-local n that `work.mjs run reject-assumption <slug> <id>#<n>` takes.
const origin = (a) => {
  const k = splitKey(a);
  return k?.text === undefined ? a : `${k.id} #${k.n}: ${k.text}`;
};

// A marker is `marker: <path> <text>`, the text being `shortcut: <limit>, <upgrade trigger>`.
export function ledger(limits) {
  const marks = limits.filter((l) => l.startsWith('marker:')).map((l) => l.slice(7).trim());
  return marks.map((m) => (/shortcut:\s*[^,]+,\s*\S/.test(m) ? m : `${m} (no-trigger)`));
}

// `tags`: the do-it/<id>/phase-N tags, `usage`: {input, output} from usage-it or null.
export function buildDigest({ record, tags = [], usage = null, findings = [], retro = [] }) {
  const by = (s) => record.slices.filter((x) => x.status === s);
  const why = (x) => `${x.id}${x.reason ? `: ${oneLine(x.reason)}` : ''}${x.needs ? ` (needs ${x.needs})` : ''}`;
  const marks = ledger(record.limits);
  // Only this run's rollback: tags of every work item its slices started (a resumed slice may have had
  // several), and only a well-formed phase tag, since the tag is printed into a command line.
  const mine = new Set((record.gates ?? []).flatMap((g) => [g.work, ...(g.works ?? [])]).filter(Boolean));
  const runTags = tags.filter((t) => TAG.test(t) && mine.has(t.split('/')[1]));
  const now = (id) => {
    const s = record.slices.find((x) => x.id === id);
    return s ? `${s.status}${s.reason ? ` (${oneLine(s.reason)})` : ''}` : 'not run again yet';
  };
  const retried = (record.retries ?? []).map((r) => `${r.id}: was ${r.was}${r.reason ? ` (${oneLine(r.reason)})` : ''}, now ${now(r.id)}`);
  const limits = record.limits.filter((l) => !l.startsWith('marker:'));
  const out = [`# Run digest: ${record.id}`, '', `Level ${record.level}, commit ${record.commit}, started ${record.started}.`, ''];
  const sec = (title, lines) => out.push(`## ${title}`, '', ...lines, '');
  // The audit limit that last refused a round: the slice, the final review or the run total.
  if (record.audit_stop) sec('Limit fired', [`- AUDIT_CAP, ${oneLine(record.audit_stop)}`]);
  sec(`Shipped (${by('shipped').length})`, bullets(by('shipped').map((x) => x.id)));
  sec(`Parked (${by('parked').length})`, bullets(by('parked').map(why)));
  sec(`Blocked (${by('blocked').length})`, bullets(by('blocked').map(why)));
  sec(`Retried (${retried.length})`, bullets(retried));
  sec(`Assumptions taken (${record.assumptions.length})`, bullets(record.assumptions.map(origin)));
  sec(`Assumptions rejected (${record.rejected.length})`, bullets(record.rejected.map(origin)));
  sec(`Verification limits (${limits.length})`, bullets(limits));
  sec(`Findings and defects filed (${findings.length})`, bullets(findings));
  sec(`Shortcut ledger (${marks.length}, ${marks.filter((m) => m.endsWith('(no-trigger)')).length} no-trigger)`, bullets(marks));
  sec('Tokens', [usage ? `- input ${usage.input ?? 0}, output ${usage.output ?? 0}` : '- not recorded']);
  sec(`Rollback (${runTags.length})`, bullets(runTags.map((t) => `\`git revert --no-edit ${t}\``)));
  sec('Retro', RETRO.map((k, i) => `- ${k}: ${oneLine(retro[i] ?? 'none')}`));
  return `${out.join('\n').trimEnd()}\n`;
}
