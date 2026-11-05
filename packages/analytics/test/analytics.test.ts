import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circle, computeCatchment, computeCoverage, classify, destination, distanceKm, generateDemoDataset, pointInRing, REGIONS, scoreCandidates, DEFAULT_WEIGHTS, buildCandidateMetrics, CANDIDATE_SITES, type PopulationCell } from '../src/index.ts';

const near = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} ± ${tol}`);

test('distance : un degré de latitude vaut environ 111,2 km', () => near(distanceKm([-7, 33], [-7, 34]), 111.19, 0.05));
test('distance : Casablanca-Rabat, ordre de grandeur attendu', () => near(distanceKm([-7.5898, 33.5731], [-6.8498, 34.0209]), 84.6, 0.5));
test('destination : aller à 10 km puis mesurer redonne 10 km', () => near(distanceKm([-7, 33], destination([-7, 33], 73, 10)), 10, 1e-6));
test('cercle : anneau fermé, tous les points au rayon', () => {
  const r = circle([-7, 33], 5, 32);
  assert.deepEqual(r[0], r[r.length - 1]);
  for (const p of r) near(distanceKm([-7, 33], p), 5, 1e-6);
});
test('point dans polygone', () => {
  const sq: [number, number][] = [[0,0],[2,0],[2,2],[0,2],[0,0]];
  assert.equal(pointInRing([1,1], sq), true);
  assert.equal(pointInRing([3,1], sq), false);
});

const cell = (id: string, lng: number, population: number, territory: string): PopulationCell => ({ id, position: [lng, 33], population, households: population / 4, territory });
test('couverture : résultat connu sur un cas construit', () => {
  const km1 = 1 / (111.19 * Math.cos((33 * Math.PI) / 180));
  const cells = [cell('a', -7, 1000, 'T1'), cell('b', -7 + 3 * km1, 1000, 'T1'), cell('c', -7 + 20 * km1, 2000, 'T2')];
  const res = computeCoverage(cells, [{ id: 's', position: [-7, 33] }], 5);
  assert.equal(res.population, 4000);
  assert.equal(res.coveredPopulation, 2000);
  assert.equal(res.uncoveredPopulation, 2000);
  assert.equal(res.rate, 0.5);
  assert.equal(res.coveredHouseholds, 500);
  near(res.meanAccessKm as number, (0 + 3000 + 40000) / 4000, 0.05);
  assert.equal(res.territories.find((t) => t.territory === 'T1')?.coverageClass, 'high');
  assert.equal(res.territories.find((t) => t.territory === 'T2')?.coverageClass, 'none');
  assert.equal(res.deficitTerritories, 1);
  assert.equal(res.servedTerritories, 1);
});
test('couverture : aucun service, aucune couverture et pas de distance', () => {
  const res = computeCoverage([cell('a', -7, 10, 'T')], [], 5);
  assert.equal(res.rate, 0);
  assert.equal(res.meanAccessKm, null);
});
test('couverture : rayon invalide refusé', () => assert.throws(() => computeCoverage([], [], 0), RangeError));
test('classes de couverture', () => {
  assert.equal(classify(0.75), 'high'); assert.equal(classify(0.55), 'medium'); assert.equal(classify(0.1), 'low'); assert.equal(classify(0), 'none');
});
test('chalandise : valeurs croissantes avec le rayon', () => {
  const d = generateDemoDataset();
  const rows = computeCatchment([-7.55, 33.5], d.cells, d.services.filter((s) => s.kind === 'competitor'));
  assert.deepEqual(rows.map((r) => r.radiusKm), [1, 3, 5, 10, 15]);
  for (let i = 1; i < rows.length; i++) assert.ok((rows[i]?.population ?? 0) >= (rows[i - 1]?.population ?? 0));
  assert.ok((rows[4]?.population ?? 0) > 0);
});
test('score : critère sans donnée exclu et poids ramenés à 100 %', () => {
  const res = scoreCandidates([
    { id: 'a', name: 'A', metrics: { density: 100, competition: 1, accessibility: 1, distanceToSimilar: 5, unservedPopulation: 10, customerPotential: 10 } },
    { id: 'b', name: 'B', metrics: { density: 50, competition: 5, accessibility: 9, distanceToSimilar: 1, unservedPopulation: 1, customerPotential: 1 } },
  ]);
  assert.deepEqual(res.excludedCriteria, ['purchasingPower']);
  near(Object.values(res.appliedWeights).reduce((s, v) => s + (v ?? 0), 0), 1, 1e-9);
  assert.equal(res.candidates[0]?.id, 'a');
  near(res.candidates[0]?.score ?? 0, 100, 1e-9);
  near(res.candidates[1]?.score ?? 1, 0, 1e-9);
});
test('score : les poids modifient le classement', () => {
  const metrics = (density: number, competition: number) => ({ density, competition, accessibility: 1, distanceToSimilar: 1, unservedPopulation: 1, customerPotential: 1 });
  const c = [{ id: 'dense', name: 'Dense', metrics: metrics(100, 10) }, { id: 'calme', name: 'Calme', metrics: metrics(10, 1) }];
  assert.equal(scoreCandidates(c, { ...DEFAULT_WEIGHTS, density: 90, competition: 1 }).candidates[0]?.id, 'dense');
  assert.equal(scoreCandidates(c, { ...DEFAULT_WEIGHTS, density: 1, competition: 90 }).candidates[0]?.id, 'calme');
});
test('jeu DEMO : déterministe, 12 régions, totaux exacts, cellules dans leur région', () => {
  assert.equal(REGIONS.length, 12);
  const a = generateDemoDataset(), b = generateDemoDataset();
  assert.deepEqual(a.cells[10], b.cells[10]);
  for (const reg of REGIONS) {
    const cells = a.cells.filter((c) => c.region === reg.id);
    assert.equal(cells.reduce((s, c) => s + c.population, 0), reg.population, reg.id);
    assert.ok(cells.every((c) => c.population >= 0));
    const inside = cells.filter((c) => pointInRing(c.position, reg.ring)).length / cells.length;
    assert.ok(inside > 0.8, `${reg.id} ${inside}`);
  }
  assert.ok(a.services.some((s) => s.kind === 'competitor'));
});
test('jeu DEMO : couverture plausible et non triviale, sites notés', () => {
  const d = generateDemoDataset();
  const services = d.services.filter((s) => s.kind === 'service');
  const res = computeCoverage(d.cells, services, 5);
  console.log('couverture 5 km', res.rate.toFixed(3), res.territories.map((t) => `${t.territory}:${t.rate.toFixed(2)}`).join(' '), 'cells', d.cells.length, 'services', services.length);
  assert.ok(res.rate > 0.3 && res.rate < 0.95);
  assert.ok(computeCoverage(d.cells, services, 10).rate >= res.rate);
  const scored = scoreCandidates(buildCandidateMetrics(CANDIDATE_SITES, d.cells, services, d.services.filter((s) => s.kind === 'competitor')));
  console.log(scored.candidates.map((c) => `${c.name}:${c.score.toFixed(0)}`).join(' '));
  assert.equal(scored.candidates.length, CANDIDATE_SITES.length);
});
