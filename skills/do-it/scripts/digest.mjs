// The run digest: counted facts from a run record, rendered as markdown.
// Pure: work.mjs gathers the git tags and the optional inputs. No estimates of
// time or money; every figure is a count or a value read from the record.

const RETRO = ['Worked', 'Failed', 'Change', 'Next'];
const bullets = (items, none = 'none') => (items.length ? items.map((x) => `- ${x}`) : [`- ${none}`]);

// An assumption from a work item is stored `<id>#<n>: text`; show the id and the
// item-local n that `work.mjs run reject-assumption <slug> <id>#<n>` takes.
const origin = (a) => {
  const m = /^([A-Za-z0-9][A-Za-z0-9_.-]*)#(\d+): (.*)$/s.exec(a);
  return m ? `${m[1]} #${m[2]}: ${m[3]}` : a;
};

// A marker is `marker: <path> <text>`, the text being `shortcut: <limit>, <upgrade trigger>`.
export function ledger(limits) {
  const marks = limits.filter((l) => l.startsWith('marker:')).map((l) => l.slice(7).trim());
  return marks.map((m) => (/shortcut:\s*[^,]+,\s*\S/.test(m) ? m : `${m} (no-trigger)`));
}

// `tags`: the do-it/<id>/phase-N tags, `usage`: {input, output} from usage-it or null.
export function buildDigest({ record, tags = [], usage = null, findings = [], retro = [] }) {
  const by = (s) => record.slices.filter((x) => x.status === s);
  const why = (x) => `${x.id}${x.reason ? `: ${x.reason}` : ''}${x.needs ? ` (needs ${x.needs})` : ''}`;
  const marks = ledger(record.limits);
  // Only this run's rollback: tags of the work items its slices started, not every run's in the repo.
  const mine = new Set((record.gates ?? []).map((g) => g.work).filter(Boolean));
  const runTags = tags.filter((t) => mine.has(t.split('/')[1]));
  const now = (id) => {
    const s = record.slices.find((x) => x.id === id);
    return s ? (s.status === 'shipped' ? 'shipped' : `${s.status}${s.reason ? ` (${s.reason})` : ''}`) : 'not run again yet';
  };
  const retried = (record.retries ?? []).map((r) => `${r.id}: was ${r.was}${r.reason ? ` (${r.reason})` : ''}, now ${now(r.id)}`);
  const limits = record.limits.filter((l) => !l.startsWith('marker:'));
  const out = [`# Run digest: ${record.id}`, '', `Level ${record.level}, commit ${record.commit}, started ${record.started}.`, ''];
  const sec = (title, lines) => out.push(`## ${title}`, '', ...lines, '');
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
  sec('Retro', RETRO.map((k, i) => `- ${k}: ${retro[i] ?? 'none'}`));
  return `${out.join('\n').trimEnd()}\n`;
}
