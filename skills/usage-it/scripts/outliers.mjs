// Main sessions ranked by peak context, flagged when the peak is above FACTOR
// times the median peak of the rows given. Rows without a peak (records from
// before the ledger kept it, rollups) are left out.

export const FACTOR = 2;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

export function contextOutliers(recs, { limit = 10 } = {}) {
  const rows = recs.filter((r) => r.kind === 'session' && r.peak > 0);
  const medianPeak = median(rows.map((r) => r.peak));
  const medianStart = median(rows.filter((r) => r.ctx0 > 0).map((r) => r.ctx0));
  const flagged = rows.filter((r) => r.peak > FACTOR * medianPeak);
  const top = [...rows].sort((a, b) => b.peak - a.peak).slice(0, limit).map((r) => ({ ...r, flagged: r.peak > FACTOR * medianPeak }));
  return { sessions: rows.length, medianPeak, medianStart, flagged: flagged.length, top };
}
