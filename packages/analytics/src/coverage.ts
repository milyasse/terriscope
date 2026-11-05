import { distanceKm, type LngLat } from './geo.ts';

export interface PopulationCell { id: string; position: LngLat; population: number; households: number; territory: string }
export interface ServicePoint { id: string; position: LngLat }
export type CoverageClass = 'high' | 'medium' | 'low' | 'none';

export interface TerritoryCoverage {
  territory: string; population: number; coveredPopulation: number; rate: number; coverageClass: CoverageClass;
}
export interface CoverageResult {
  radiusKm: number; population: number; coveredPopulation: number; uncoveredPopulation: number;
  households: number; coveredHouseholds: number; rate: number; meanAccessKm: number | null;
  servedTerritories: number; deficitTerritories: number; territories: TerritoryCoverage[];
}

/** Seuils de classement, en part de population couverte. */
export function classify(rate: number): CoverageClass {
  if (rate >= 0.75) return 'high';
  if (rate >= 0.55) return 'medium';
  if (rate > 0) return 'low';
  return 'none';
}

export interface CellDistance { cell: Pick<PopulationCell, 'population' | 'households' | 'territory'>; nearestKm: number | null }

/** Agrège des distances déjà calculées, par ce moteur ou par PostGIS, avec les mêmes règles. */
export function aggregateCoverage(rows: Iterable<CellDistance>, radiusKm: number): CoverageResult {
  if (radiusKm <= 0) throw new RangeError('Le rayon doit être strictement positif.');
  const byTerritory = new Map<string, { population: number; covered: number }>();
  let population = 0, covered = 0, households = 0, coveredHouseholds = 0, weightedKm = 0, measured = false;
  for (const { cell, nearestKm } of rows) {
    const isCovered = nearestKm !== null && nearestKm <= radiusKm;
    population += cell.population;
    households += cell.households;
    if (nearestKm !== null) { weightedKm += nearestKm * cell.population; measured = true; }
    if (isCovered) { covered += cell.population; coveredHouseholds += cell.households; }
    const t = byTerritory.get(cell.territory) ?? { population: 0, covered: 0 };
    t.population += cell.population;
    if (isCovered) t.covered += cell.population;
    byTerritory.set(cell.territory, t);
  }
  const territories = [...byTerritory.entries()].map(([territory, t]) => {
    const rate = t.population ? t.covered / t.population : 0;
    return { territory, population: t.population, coveredPopulation: t.covered, rate, coverageClass: classify(rate) };
  });
  return {
    radiusKm, population, coveredPopulation: covered, uncoveredPopulation: population - covered,
    households, coveredHouseholds, rate: population ? covered / population : 0,
    meanAccessKm: population && measured ? weightedKm / population : null,
    servedTerritories: territories.filter((t) => t.coveredPopulation > 0).length,
    deficitTerritories: territories.filter((t) => t.rate < 0.55).length,
    territories,
  };
}

/** Distance moyenne d'accès pondérée par la population, vers le service le plus proche. */
export function computeCoverage(cells: PopulationCell[], services: ServicePoint[], radiusKm: number): CoverageResult {
  if (radiusKm <= 0) throw new RangeError('Le rayon doit être strictement positif.');
  return aggregateCoverage(cells.map((cell) => {
    let nearest = Infinity;
    for (const s of services) {
      // Un degré de latitude dépasse 110 km : ce filtre évite un calcul de distance inutile.
      if (Math.abs(s.position[1] - cell.position[1]) * 110 >= nearest) continue;
      nearest = Math.min(nearest, distanceKm(cell.position, s.position));
    }
    return { cell, nearestKm: Number.isFinite(nearest) ? nearest : null };
  }), radiusKm);
}
