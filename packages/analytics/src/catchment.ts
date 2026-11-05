import { distanceKm, type LngLat } from './geo.ts';
import type { PopulationCell, ServicePoint } from './coverage.ts';

export const STANDARD_RADII_KM = [1, 3, 5, 10, 15] as const;
export interface CatchmentRow { radiusKm: number; population: number; households: number; competitors: number }

/** Population et concurrents dans chaque rayon à vol d'oiseau autour d'un site. */
export function computeCatchment(site: LngLat, cells: PopulationCell[], competitors: ServicePoint[], radii: readonly number[] = STANDARD_RADII_KM): CatchmentRow[] {
  return [...radii].sort((a, b) => a - b).map((radiusKm) => {
    let population = 0, households = 0;
    for (const c of cells) if (distanceKm(site, c.position) <= radiusKm) { population += c.population; households += c.households; }
    return { radiusKm, population, households, competitors: competitors.filter((s) => distanceKm(site, s.position) <= radiusKm).length };
  });
}
