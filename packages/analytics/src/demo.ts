import { distanceToLineKm, pointInRing, type LngLat, type Ring } from './geo.ts';
import type { PopulationCell, ServicePoint } from './coverage.ts';

/**
 * Jeu de données ENTIÈREMENT FICTIF, généré de façon déterministe pour le mode DEMO.
 * Les noms de lieux sont réels ; les chiffres ne sont pas des statistiques officielles.
 * Les contours sont dessinés à la main : ils ne sont pas géoréférencés.
 */
export interface DemoCity { name: string; nameAr: string; province: string; position: LngLat; share: number }
export interface DemoRegion { id: string; name: string; nameAr: string; short: string; population: number; shops: number; color: string; strong: string; team: string; status: 'draft' | 'pending' | 'validated' | 'active'; ring: Ring; label: LngLat; serviceDensity: number; cities: DemoCity[] }
const close = (r: LngLat[]): Ring => [...r, r[0] as LngLat];
const city = (name: string, nameAr: string, province: string, lng: number, lat: number, share: number): DemoCity => ({ name, nameAr, province, position: [lng, lat], share });

export const REGIONS: DemoRegion[] = [
  { id: 'TTA', name: 'Tanger-Tétouan-Al Hoceïma', nameAr: 'طنجة تطوان الحسيمة', short: 'Tanger-Tétouan', population: 3_600_000, shops: 5200, color: '#F0A3A3', strong: '#B3404A', team: 'Équipe Nord', status: 'active', label: [-4.95, 35.05], serviceDensity: 0.9, ring: close([[-3.55,35.2],[-3.95,35.25],[-4.7,35.2],[-5.3,35.85],[-5.9,35.8],[-6.05,35.45],[-6.15,35.2],[-6.25,34.95],[-5.6,34.8],[-4.9,34.85],[-3.9,34.85]]), cities: [city('Tanger','طنجة','Tanger-Assilah',-5.81,35.68,.55),city('Tétouan','تطوان','Tétouan',-5.42,35.48,.3),city('Al Hoceïma','الحسيمة','Al Hoceïma',-4.05,35.08,.15)] },
  { id: 'ORI', name: 'Oriental', nameAr: 'الشرق', short: 'Oriental', population: 2_300_000, shops: 2900, color: '#A9C4F5', strong: '#2F62C4', team: 'Équipe Nord-Est', status: 'pending', label: [-2.55, 33.3], serviceDensity: 0.55, ring: close([[-3.55,35.2],[-2.95,35.25],[-2.2,35.1],[-1.75,34.7],[-1.65,33.9],[-1.3,32.7],[-1.2,32.1],[-2.9,32.1],[-3.6,32.6],[-3.5,33.4],[-3.9,34.85]]), cities: [city('Nador','الناظور','Nador',-2.95,35.02,.35),city('Oujda','وجدة','Oujda-Angad',-1.98,34.55,.55),city('Bouarfa','بوعرفة','Figuig',-1.95,32.53,.1)] },
  { id: 'FMS', name: 'Fès-Meknès', nameAr: 'فاس مكناس', short: 'Fès-Meknès', population: 4_200_000, shops: 6100, color: '#C9B2F2', strong: '#6B46C1', team: 'Équipe Centre', status: 'active', label: [-4.75, 33.6], serviceDensity: 0.8, ring: close([[-3.9,34.85],[-3.5,33.4],[-4.3,33],[-5.3,33],[-5.9,33.6],[-5.8,34.3],[-5.6,34.8],[-4.9,34.85]]), cities: [city('Fès','فاس','Fès',-5.0,34.03,.55),city('Meknès','مكناس','Meknès',-5.5,33.85,.35),city('Taza','تازة','Taza',-4.1,34.2,.1)] },
  { id: 'RSK', name: 'Rabat-Salé-Kénitra', nameAr: 'الرباط سلا القنيطرة', short: 'Rabat-Kénitra', population: 4_600_000, shops: 8300, color: '#F7C98B', strong: '#B35A00', team: 'Équipe Atlantique', status: 'validated', label: [-6.3, 33.55], serviceDensity: 1.2, ring: close([[-6.25,34.95],[-6.7,34.3],[-6.85,34.03],[-7.15,33.82],[-6.6,33.2],[-5.9,33.6],[-5.8,34.3],[-5.6,34.8]]), cities: [city('Rabat','الرباط','Rabat',-6.7,33.92,.6),city('Kénitra','القنيطرة','Kénitra',-6.3,34.35,.3),city('Khémisset','الخميسات','Khémisset',-6.1,33.72,.1)] },
  { id: 'BMK', name: 'Béni Mellal-Khénifra', nameAr: 'بني ملال خنيفرة', short: 'Béni Mellal', population: 2_500_000, shops: 2600, color: '#A8DDB5', strong: '#2E7D4F', team: 'Équipe Centre', status: 'draft', label: [-5.5, 32.6], serviceDensity: 0.5, ring: close([[-5.9,33.6],[-5.3,33],[-4.3,33],[-5,32.2],[-5.9,31.9],[-6.9,32.2],[-6.9,32.9],[-6.6,33.2]]), cities: [city('Béni Mellal','بني ملال','Béni Mellal',-6.36,32.34,.6),city('Khénifra','خنيفرة','Khénifra',-5.67,33.0,.4)] },
  { id: 'CAS', name: 'Casablanca-Settat', nameAr: 'الدار البيضاء سطات', short: 'Casablanca-Settat', population: 6_900_000, shops: 12400, color: '#F5A9C8', strong: '#B8327A', team: 'Équipe Atlantique', status: 'active', label: [-7.9, 32.65], serviceDensity: 1.5, ring: close([[-7.15,33.82],[-7.6,33.62],[-8.35,33.3],[-8.55,33.2],[-9,32.75],[-9.1,32.6],[-8.3,32.2],[-7.2,32.3],[-6.9,32.2],[-6.9,32.9],[-6.6,33.2]]), cities: [city('Casablanca','الدار البيضاء','Casablanca',-7.55,33.5,.65),city('Settat','سطات','Settat',-7.4,32.95,.15),city('El Jadida','الجديدة','El Jadida',-8.3,33.1,.2)] },
  { id: 'MSA', name: 'Marrakech-Safi', nameAr: 'مراكش آسفي', short: 'Marrakech-Safi', population: 4_500_000, shops: 5900, color: '#8FD3D1', strong: '#0F7C7A', team: 'Équipe Sud', status: 'validated', label: [-8.1, 31.2], serviceDensity: 0.7, ring: close([[-9.1,32.6],[-9.25,32.3],[-9.78,31.5],[-9.82,31],[-8.9,30.9],[-7.6,30.95],[-6.9,31.4],[-5.9,31.9],[-6.9,32.2],[-7.2,32.3],[-8.3,32.2]]), cities: [city('Marrakech','مراكش','Marrakech',-8.0,31.63,.7),city('Safi','آسفي','Safi',-9.0,32.2,.2),city('Essaouira','الصويرة','Essaouira',-9.5,31.45,.1)] },
  { id: 'DTA', name: 'Drâa-Tafilalet', nameAr: 'درعة تافيلالت', short: 'Drâa-Tafilalet', population: 1_600_000, shops: 1500, color: '#F3D98B', strong: '#8A6D00', team: 'Non affecté', status: 'draft', label: [-5.2, 31.2], serviceDensity: 0.35, ring: close([[-4.3,33],[-3.5,33.4],[-3.6,32.6],[-2.9,32.1],[-3.8,31.6],[-3.65,30.9],[-5.2,30],[-6.5,29.5],[-7.6,30],[-7.6,30.95],[-6.9,31.4],[-5.9,31.9],[-5,32.2]]), cities: [city('Errachidia','الرشيدية','Errachidia',-4.42,31.93,.5),city('Ouarzazate','ورزازات','Ouarzazate',-6.7,30.75,.5)] },
  { id: 'SMA', name: 'Souss-Massa', nameAr: 'سوس ماسة', short: 'Souss-Massa', population: 2_700_000, shops: 3400, color: '#B7A6E8', strong: '#5A4FB0', team: 'Équipe Sud', status: 'pending', label: [-8.1, 29.95], serviceDensity: 0.7, ring: close([[-9.82,31],[-9.62,30.42],[-9.85,29.75],[-9.1,29.35],[-8,29.5],[-6.5,29.5],[-7.6,30],[-7.6,30.95],[-8.9,30.9]]), cities: [city('Agadir','أكادير','Agadir-Ida-Ou-Tanane',-9.3,30.42,.75),city('Taroudant','تارودانت','Taroudant',-8.5,30.5,.1),city('Tiznit','تيزنيت','Tiznit',-9.4,29.72,.15)] },
  { id: 'GON', name: 'Guelmim-Oued Noun', nameAr: 'كلميم واد نون', short: 'Guelmim', population: 400_000, shops: 500, color: '#A9C4F5', strong: '#2F62C4', team: 'Non affecté', status: 'draft', label: [-9.3, 28.3], serviceDensity: 0.4, ring: close([[-9.85,29.75],[-10.18,29.38],[-11.3,28.5],[-11.5,28.35],[-10.4,27.67],[-8.67,27.67],[-8.67,28.7],[-6.5,29.5],[-8,29.5],[-9.1,29.35]]), cities: [city('Guelmim','كلميم','Guelmim',-9.9,28.95,.7),city('Tan-Tan','طانطان','Tan-Tan',-10.8,28.3,.3)] },
  { id: 'LSH', name: 'Laâyoune-Sakia El Hamra', nameAr: 'العيون الساقية الحمراء', short: 'Laâyoune', population: 400_000, shops: 600, color: '#F7C98B', strong: '#B35A00', team: 'Non affecté', status: 'draft', label: [-11.4, 26.7], serviceDensity: 0.6, ring: close([[-11.5,28.35],[-12.9,27.93],[-13.4,27.1],[-14.5,26.12],[-14.85,25.2],[-12,25.2],[-12,26],[-8.67,26],[-8.67,27.67],[-10.4,27.67]]), cities: [city('Laâyoune','العيون','Laâyoune',-13,27.1,1)] },
  { id: 'DOE', name: 'Dakhla-Oued Ed-Dahab', nameAr: 'الداخلة وادي الذهب', short: 'Dakhla', population: 200_000, shops: 240, color: '#A8DDB5', strong: '#2E7D4F', team: 'Non affecté', status: 'draft', label: [-14.3, 23], serviceDensity: 0.5, ring: close([[-14.85,25.2],[-15.95,23.7],[-16.3,23],[-16.95,21.6],[-17.05,21.33],[-13,21.33],[-13.1,22.8],[-12,23.45],[-12,25.2]]), cities: [city('Dakhla','الداخلة','Oued Ed-Dahab',-15.3,23.75,1)] },
];

export const SIMPLIFIED_ROADS: LngLat[][] = [
  [[-5.81,35.68],[-6.3,34.35],[-6.7,33.92],[-7.55,33.5],[-7.4,32.95],[-8.0,31.63],[-9.3,30.42],[-9.9,28.95],[-13,27.1],[-15.3,23.75]],
  [[-6.7,33.92],[-5.5,33.85],[-5.0,34.03],[-4.1,34.2],[-1.98,34.55]],
  [[-7.55,33.5],[-6.36,32.34],[-5.67,33.0],[-5.0,34.03]],
];

function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

export interface DemoCell extends PopulationCell { region: string; province: string; commune: string }
export interface DemoService extends ServicePoint { region: string; kind: 'service' | 'competitor' }
export interface DemoCandidate { id: string; name: string; commune: string; region: string; position: LngLat; assignee: string }
export interface DemoDataset { cells: DemoCell[]; services: DemoService[]; candidates: DemoCandidate[] }

function bbox(ring: Ring) {
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
function sampleNear(region: DemoRegion, center: LngLat, sigma: number, r: () => number): LngLat {
  for (let i = 0; i < 40; i++) {
    const p: LngLat = [center[0] + gauss(r) * sigma, center[1] + gauss(r) * sigma * 0.85];
    if (pointInRing(p, region.ring)) return p;
  }
  return center;
}

export const CANDIDATE_SITES: DemoCandidate[] = [
  { id: 'c1', name: 'Bouskoura Nord', commune: 'Bouskoura', region: 'CAS', position: [-7.65, 33.45], assignee: 'Équipe Atlantique' },
  { id: 'c2', name: 'Deroua Centre', commune: 'Deroua', region: 'CAS', position: [-7.54, 33.37], assignee: 'Équipe Atlantique' },
  { id: 'c3', name: 'Had Soualem Est', commune: 'Had Soualem', region: 'CAS', position: [-7.8, 33.42], assignee: 'Non affecté' },
  { id: 'c4', name: 'Témara Sud', commune: 'Témara', region: 'RSK', position: [-6.92, 33.9], assignee: 'Équipe Atlantique' },
  { id: 'c5', name: 'Tamansourt', commune: 'Marrakech', region: 'MSA', position: [-8.1, 31.72], assignee: 'Équipe Sud' },
  { id: 'c6', name: 'Gzenaya', commune: 'Tanger', region: 'TTA', position: [-5.93, 35.7], assignee: 'Équipe Nord' },
];

/** Génère le jeu DEMO : même graine, mêmes données, et totaux régionaux exacts. */
export function generateDemoDataset(seed = 20261104): DemoDataset {
  const r = mulberry32(seed);
  const cells: DemoCell[] = [];
  const services: DemoService[] = [];
  for (const region of REGIONS) {
    const weights: { city: DemoCity; position: LngLat; weight: number }[] = [];
    for (const c of region.cities) {
      const n = Math.max(12, Math.round(70 * c.share * Math.sqrt(region.population / 2_000_000)));
      for (let i = 0; i < n; i++) weights.push({ city: c, position: sampleNear(region, c.position, 0.09 + 0.1 * r(), r), weight: 0.6 + r() });
    }
    const box = bbox(region.ring);
    for (let i = 0; i < 40; i++) {
      const p: LngLat = [box.minX + r() * (box.maxX - box.minX), box.minY + r() * (box.maxY - box.minY)];
      if (!pointInRing(p, region.ring)) continue;
      const c = [...region.cities].sort((a, b) => Math.hypot(a.position[0] - p[0], a.position[1] - p[1]) - Math.hypot(b.position[0] - p[0], b.position[1] - p[1]))[0] as DemoCity;
      weights.push({ city: c, position: p, weight: 0.08 });
    }
    const total = weights.reduce((s, w) => s + w.weight, 0);
    let left = region.population;
    weights.forEach((w, i) => {
      const population = i === weights.length - 1 ? left : Math.round((region.population * w.weight) / total);
      left -= population;
      cells.push({ id: `${region.id}-${i}`, position: w.position, population, households: Math.round(population / 4.2), territory: region.id, region: region.id, province: w.city.province, commune: w.city.name });
    });
    const nServices = Math.max(4, Math.round((region.population / 40_000) * region.serviceDensity));
    const nCompetitors = Math.max(3, Math.round(region.shops / 250));
    for (let i = 0; i < nServices + nCompetitors; i++) {
      const c = region.cities[Math.floor(r() * region.cities.length)] as DemoCity;
      const anchor = r() < 0.82 ? (weights[Math.floor(r() * weights.length)] as { position: LngLat }).position : c.position;
      services.push({ id: `${region.id}-s${i}`, position: sampleNear(region, anchor, 0.02, r), region: region.id, kind: i < nServices ? 'service' : 'competitor' });
    }
  }
  return { cells, services, candidates: CANDIDATE_SITES };
}

export function accessibilityKm(p: LngLat): number {
  return Math.min(...SIMPLIFIED_ROADS.map((l) => distanceToLineKm(p, l)));
}
