// Lexical routing model for skill descriptions: TF-IDF vectors over the
// descriptions of model-invoked skills, cosine similarity against a prompt.
// Deterministic and dependency-free, so it can gate CI. It approximates how
// well a description's words point at its skill; it is not the host's router.

const STOPWORDS = new Set(
  `a an and any are as at be been but by can could did do does doing done for from had has have how i if in into is it
  its me my need needs not of on once one or our so some such than that the their them then there these this those to
  up us use used uses using was we were what when where which while who why will with would you your yours it's i'm
  just also only other another about over more most very each every all both via per`.split(/\s+/),
);

// Light suffix stripping: enough to join "diagnose/diagnosing/diagnosis",
// "test/tests/testing", "issue/issues". Not a full Porter stemmer.
export function stem(word) {
  let w = word;
  if (w.length <= 3) return w;
  for (const [suffix, repl] of [
    ['ational', 'ate'],
    ['ations', 'ate'],
    ['ation', 'ate'],
    ['nesses', ''],
    ['ness', ''],
    ['ments', ''],
    ['ment', ''],
    ['ingly', ''],
    ['edly', ''],
    ['ings', ''],
    ['ing', ''],
    ['ies', 'y'],
    ['ied', 'y'],
    ['sis', 's'],
    ['ses', 's'],
    ['ed', ''],
    ['es', ''],
    ['ly', ''],
    ['s', ''],
  ]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
      w = w.slice(0, -suffix.length) + repl;
      // debugging -> debugg -> debug, mapped -> mapp -> map.
      if (/^(ing|ings|ed|edly|ingly)$/.test(suffix) && /([b-df-hj-km-np-rtv-z])\1$/.test(w) && !/(ll|ss|zz)$/.test(w)) w = w.slice(0, -1);
      break;
    }
  }
  // live/lives, diagnose/diagnosing: drop a trailing e so the forms meet.
  if (w.length >= 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

export function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[`'"’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t && t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t))
    .map(stem);
}

function counts(tokens) {
  const m = new Map();
  for (const t of tokens) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

// The words a host sees for a skill: its name (minus the "-it" suffix) and description.
export function skillText(skill) {
  const name = String(skill.name).replace(/-it$/, '').replace(/^it-/, '').replace(/-/g, ' ');
  return `${name} ${skill.description}`;
}

export function buildModel(skills) {
  const docs = skills.map((s) => ({ name: s.name, tf: counts(tokenize(skillText(s))) }));
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const n = docs.length;
  const idf = (t) => Math.log((n + 1) / ((df.get(t) || 0) + 1)) + 1;
  const vector = (tf) => {
    const v = new Map();
    let norm = 0;
    for (const [t, c] of tf) {
      const w = (1 + Math.log(c)) * idf(t);
      v.set(t, w);
      norm += w * w;
    }
    return { v, norm: Math.sqrt(norm) || 1 };
  };
  const vectors = docs.map((d) => ({ name: d.name, ...vector(d.tf) }));
  const cosine = (a, b) => {
    let dot = 0;
    for (const [t, w] of a.v) if (b.v.has(t)) dot += w * b.v.get(t);
    return dot / (a.norm * b.norm);
  };
  return {
    names: docs.map((d) => d.name),
    score(prompt) {
      const q = vector(counts(tokenize(prompt)));
      return vectors.map((d) => ({ name: d.name, score: cosine(q, d) })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    },
    similarities() {
      const out = [];
      for (let i = 0; i < vectors.length; i++) {
        for (let j = i + 1; j < vectors.length; j++) out.push({ a: vectors[i].name, b: vectors[j].name, score: cosine(vectors[i], vectors[j]) });
      }
      return out.sort((x, y) => y.score - x.score);
    },
  };
}

// Run the eval. `skills` is [{name, description}] for model-invoked skills;
// `spec` is evals/routing.json.
export function evaluate(skills, spec) {
  const threshold = spec.threshold ?? 0.9;
  const maxSimilarity = spec.maxSimilarity ?? 0.75;
  const model = buildModel(skills);
  const known = new Set(model.names);
  const rows = [];
  const confusions = [];
  const warnings = [];
  const failures = [];
  let positives = 0;
  let firsts = 0;

  for (const name of model.names) {
    const entry = spec.skills?.[name];
    if (!entry) {
      warnings.push(`${name}: no routing entries; add positives and negatives to evals/routing.json`);
      continue;
    }
    const row = { name, positives: 0, first: 0, negatives: 0, negOk: 0 };
    for (const prompt of entry.positive || []) {
      const ranked = model.score(prompt);
      row.positives++;
      positives++;
      if (ranked[0].name === name) {
        row.first++;
        firsts++;
      } else {
        const rank = ranked.findIndex((r) => r.name === name) + 1;
        confusions.push({ kind: 'positive', skill: name, prompt, winner: ranked[0].name, rank, gap: ranked[0].score - ranked[rank - 1].score });
      }
    }
    for (const neg of entry.negative || []) {
      row.negatives++;
      if (!known.has(neg.owner)) {
        warnings.push(`${name}: negative owner "${neg.owner}" is not a model-invoked skill; skipped`);
        continue;
      }
      const ranked = model.score(neg.prompt);
      const own = ranked.find((r) => r.name === neg.owner).score;
      const mine = ranked.find((r) => r.name === name).score;
      if (own > mine) row.negOk++;
      else {
        failures.push(`${name}: negative "${neg.prompt}" scores ${mine.toFixed(3)} here vs ${own.toFixed(3)} for its owner ${neg.owner}`);
        confusions.push({ kind: 'negative', skill: name, prompt: neg.prompt, winner: name, owner: neg.owner, gap: mine - own });
      }
    }
    rows.push(row);
  }

  for (const name of Object.keys(spec.skills || {})) {
    if (!known.has(name)) warnings.push(`${name}: in evals/routing.json but not a model-invoked skill; ignored`);
  }

  const rate = positives ? firsts / positives : 1;
  if (rate < threshold) failures.push(`positives ranked first: ${(rate * 100).toFixed(1)}% (need ${(threshold * 100).toFixed(0)}%)`);

  const similar = model.similarities().filter((s) => s.score >= maxSimilarity);
  for (const s of similar) failures.push(`descriptions too similar: ${s.a} and ${s.b} (cosine ${s.score.toFixed(2)} >= ${maxSimilarity})`);

  confusions.sort((a, b) => b.gap - a.gap);
  return { rows, rate, threshold, confusions, warnings, failures, topSimilar: model.similarities().slice(0, 3), ok: failures.length === 0 };
}
