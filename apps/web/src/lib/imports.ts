import { useMemo, useSyncExternalStore } from 'react';
import { distanceKm, pointInRing, type CrsCode, type DatasetKind, type DemoCandidate, type DemoCell, type DemoService, type ImportRecord } from '@terriscope/analytics';
import { competitorPoints, dataset, REGIONS, servicePoints } from './demo';

export interface ImportedDataset { id: string; fileName: string; kind: DatasetKind; crs: CrsCode; records: ImportRecord[]; importedAt: string }

// Données conservées en mémoire pour la session : aucun envoi, aucun stockage durable.
let datasets: ImportedDataset[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export function addDataset(d: Omit<ImportedDataset, 'id' | 'importedAt'>) {
  datasets = [...datasets, { ...d, id: `imp-${Date.now()}-${datasets.length}`, importedAt: new Date().toISOString() }];
  emit();
}
export function removeDataset(id: string) { datasets = datasets.filter((d) => d.id !== id); emit(); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useDatasets = () => useSyncExternalStore(subscribe, () => datasets);

/** Rattache un point à une région, ou à la ville DEMO la plus proche car les contours sont schématiques. */
function locate(p: [number, number]) {
  const region = REGIONS.find((r) => pointInRing(p, r.ring));
  const scoped = region ? [region] : REGIONS;
  let best = { region: scoped[0], city: scoped[0]?.cities[0], d: Infinity };
  for (const r of scoped) for (const c of r.cities) { const d = distanceKm(p, c.position); if (d < best.d) best = { region: r, city: c, d }; }
  return { region: best.region?.id ?? 'CAS', province: best.city?.province ?? '', commune: best.city?.name ?? '' };
}
export function useEffectiveData() {
  const list = useDatasets();
  return useMemo(() => {
    const of = (k: DatasetKind) => list.filter((d) => d.kind === k).flatMap((d) => d.records.map((r, i) => ({ r, id: `${d.id}-${i}` })));
    const toService = (kind: DemoService['kind']) => ({ r, id }: { r: ImportRecord; id: string }): DemoService => ({ id, position: r.position, region: locate(r.position).region, kind });
    const pop = of('population');
    const cells: DemoCell[] = pop.length ? pop.map(({ r, id }) => { const l = locate(r.position); const population = r.population ?? 0; return { id, position: r.position, population, households: r.households ?? Math.round(population / 4.2), territory: l.region, region: l.region, province: l.province, commune: l.commune }; }) : dataset.cells;
    const candidates: DemoCandidate[] = [...dataset.candidates, ...of('candidate').map(({ r, id }) => { const l = locate(r.position); return { id, name: r.name, commune: l.commune, region: l.region, position: r.position, assignee: 'Non affecté' }; })];
    return { datasets: list, cells, candidates, populationReplaced: pop.length > 0, services: [...servicePoints, ...of('service').map(toService('service'))], competitors: [...competitorPoints, ...of('competitor').map(toService('competitor'))] };
  }, [list]);
}
