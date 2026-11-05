import { distanceKm, type LngLat } from './geo.ts';
import type { PopulationCell, ServicePoint } from './coverage.ts';
import type { Candidate } from './scoring.ts';
import { accessibilityKm, type DemoCandidate } from './demo.ts';

const POP_RADIUS_KM = 5;
const CUSTOMER_RADIUS_KM = 10;

/** Calcule les indicateurs réels d'un site à partir du jeu de données fourni. Le pouvoir d'achat reste absent. */
export function buildCandidateMetrics(sites: DemoCandidate[], cells: PopulationCell[], services: ServicePoint[], competitors: ServicePoint[], serviceRadiusKm = 5): Candidate[] {
  const area = Math.PI * POP_RADIUS_KM ** 2;
  return sites.map((site) => {
    let near = 0, customers = 0, unserved = 0;
    for (const c of cells) {
      const d = distanceKm(site.position, c.position);
      if (d <= POP_RADIUS_KM) near += c.population;
      if (d <= CUSTOMER_RADIUS_KM) {
        customers += c.population;
        if (!services.some((s) => distanceKm(s.position, c.position) <= serviceRadiusKm)) unserved += c.population;
      }
    }
    const dists = competitors.map((s) => distanceKm(site.position, s.position));
    return { id: site.id, name: site.name, metrics: {
      density: near / area,
      competition: dists.filter((d) => d <= POP_RADIUS_KM).length,
      accessibility: accessibilityKm(site.position as LngLat),
      distanceToSimilar: dists.length ? Math.min(...dists) : 0,
      unservedPopulation: unserved,
      customerPotential: customers,
    } };
  });
}
