import { computeCoverage, generateDemoDataset, REGIONS, scoreCandidates, DEFAULT_WEIGHTS, type CoverageResult, type DemoCell, type DemoRegion } from '@terriscope/analytics';

export const dataset = generateDemoDataset();
export const servicePoints = dataset.services.filter((s) => s.kind === 'service');
export const competitorPoints = dataset.services.filter((s) => s.kind === 'competitor');
export const DEMO_DATE = '2026-11-04';
export { REGIONS };
export const regionById = (id: string) => REGIONS.find((r) => r.id === id) as DemoRegion;

export interface Filters { region: string; province: string; commune: string }
export const NO_FILTERS: Filters = { region: '', province: '', commune: '' };
export function filterCells(f: Filters): DemoCell[] {
  return dataset.cells.filter((c) => (!f.region || c.region === f.region) && (!f.province || c.province === f.province) && (!f.commune || c.commune === f.commune));
}
export const provincesOf = (region: string) => [...new Set(dataset.cells.filter((c) => !region || c.region === region).map((c) => c.province))].sort((a, b) => a.localeCompare(b, 'fr'));
export const communesOf = (region: string, province: string) => [...new Set(dataset.cells.filter((c) => (!region || c.region === region) && (!province || c.province === province)).map((c) => c.commune))].sort((a, b) => a.localeCompare(b, 'fr'));

const cache = new Map<number, CoverageResult>();
export function nationalCoverage(km: number): CoverageResult {
  let r = cache.get(km);
  if (!r) { r = computeCoverage(dataset.cells, servicePoints, km); cache.set(km, r); }
  return r;
}
export const coverageOf = (id: string, km = 5) => nationalCoverage(km).territories.find((t) => t.territory === id);

/** Potentiel régional calculé par le moteur de score à partir des données DEMO. */
export const regionPotential: Map<string, number> = (() => {
  const cov = nationalCoverage(5);
  const res = scoreCandidates(REGIONS.map((r) => {
    const c = cov.territories.find((t) => t.territory === r.id);
    return { id: r.id, name: r.name, metrics: { density: r.population, competition: r.shops / r.population, accessibility: 1 - (c?.rate ?? 0), distanceToSimilar: 1, unservedPopulation: r.population - (c?.coveredPopulation ?? 0), customerPotential: r.population } };
  }), { ...DEFAULT_WEIGHTS, accessibility: 0, distanceToSimilar: 0 });
  return new Map(res.candidates.map((c) => [c.id, Math.round(c.score)]));
})();
