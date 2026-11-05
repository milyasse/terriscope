export type CriterionKey = 'density' | 'purchasingPower' | 'competition' | 'accessibility' | 'distanceToSimilar' | 'unservedPopulation' | 'customerPotential';

export interface Criterion { key: CriterionKey; higherIsBetter: boolean }
export const CRITERIA: Criterion[] = [
  { key: 'density', higherIsBetter: true },
  { key: 'purchasingPower', higherIsBetter: true },
  { key: 'competition', higherIsBetter: false },
  { key: 'accessibility', higherIsBetter: false },
  { key: 'distanceToSimilar', higherIsBetter: true },
  { key: 'unservedPopulation', higherIsBetter: true },
  { key: 'customerPotential', higherIsBetter: true },
];
export type Weights = Record<CriterionKey, number>;
export const DEFAULT_WEIGHTS: Weights = { density: 20, purchasingPower: 10, competition: 15, accessibility: 15, distanceToSimilar: 10, unservedPopulation: 15, customerPotential: 15 };

export interface Candidate { id: string; name: string; metrics: Partial<Record<CriterionKey, number>> }
export interface ScoredCandidate { id: string; name: string; score: number; rank: number; notes: Partial<Record<CriterionKey, number>> }
export interface ScoringResult { candidates: ScoredCandidate[]; excludedCriteria: CriterionKey[]; appliedWeights: Partial<Record<CriterionKey, number>> }

/**
 * Note chaque critère de 0 à 100 par normalisation min-max entre candidats, puis calcule
 * une moyenne pondérée. Un critère sans donnée pour au moins un candidat est exclu et
 * signalé : il n'est jamais estimé. Les poids restants sont ramenés à 100 %.
 */
export function scoreCandidates(candidates: Candidate[], weights: Weights = DEFAULT_WEIGHTS): ScoringResult {
  const usable = CRITERIA.filter((c) => candidates.length > 0 && candidates.every((k) => Number.isFinite(k.metrics[c.key])));
  const excludedCriteria = CRITERIA.filter((c) => !usable.includes(c)).map((c) => c.key);
  for (const c of usable) if (weights[c.key] < 0) throw new RangeError('Les poids doivent être positifs ou nuls.');
  const total = usable.reduce((sum, c) => sum + weights[c.key], 0);
  const appliedWeights: Partial<Record<CriterionKey, number>> = {};
  for (const c of usable) appliedWeights[c.key] = total ? weights[c.key] / total : 0;
  const notesFor = (candidate: Candidate) => {
    const notes: Partial<Record<CriterionKey, number>> = {};
    for (const c of usable) {
      const values = candidates.map((k) => k.metrics[c.key] as number);
      const min = Math.min(...values), max = Math.max(...values);
      const v = candidate.metrics[c.key] as number;
      const scaled = max === min ? 50 : ((v - min) / (max - min)) * 100;
      notes[c.key] = c.higherIsBetter ? scaled : 100 - scaled;
    }
    return notes;
  };
  const scored = candidates.map((candidate) => {
    const notes = notesFor(candidate);
    const score = usable.reduce((sum, c) => sum + (notes[c.key] as number) * (appliedWeights[c.key] as number), 0);
    return { id: candidate.id, name: candidate.name, score, notes };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'fr'));
  return { candidates: scored.map((s, i) => ({ ...s, rank: i + 1 })), excludedCriteria, appliedWeights };
}
