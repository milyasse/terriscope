// Parcours de contrôle : charge chaque écran en desktop et mobile, français et arabe.
// Échoue sur toute erreur de console ou de page, et enregistre des captures.
import { chromium } from 'playwright';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeShapefileZip } from './fixtures.mjs';

const base = process.env.BASE_URL ?? 'http://localhost:4173/';
const out = process.env.OUT_DIR ?? 'artifacts/screens';
mkdirSync(out, { recursive: true });
const routes = ['', 'tableau-de-bord', 'territoires', 'analyses', 'donnees', 'rapports'];
const viewports = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const failures = [];
let xlsxPath = '';
const tmp = (n, c) => { const p = join(tmpdir(), n); writeFileSync(p, c); return p; };
for (const lang of ['fr', 'ar']) for (const [vp, viewport] of Object.entries(viewports)) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  await ctx.addInitScript((l) => localStorage.setItem('ts-lang', l), lang);
  const page = await ctx.newPage();
  const where = () => `${lang}/${vp} ${page.url()}`;
  page.on('pageerror', (e) => failures.push(`${where()} : ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') failures.push(`${where()} console : ${m.text()}`); });
  for (const r of routes) {
    await page.goto(`${base}#/${r}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(r === '' || r === 'donnees' ? 200 : 1500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) failures.push(`${where()} : débordement horizontal de ${overflow} px`);
    if (lang === 'ar' && (await page.evaluate(() => document.documentElement.dir)) !== 'rtl') failures.push(`${where()} : dir différent de rtl`);
    if (await page.getByText(/La carte ne peut pas|تعذر عرض الخريطة/).count()) failures.push(`${where()} : carte indisponible`);
    const unfit = await page.evaluate(() => [...document.querySelectorAll('.maplibregl-map')].some((m) => { const c = m.querySelector('canvas'); return !c || Math.abs(c.getBoundingClientRect().width - m.getBoundingClientRect().width) > 2; }));
    if (unfit) failures.push(`${where()} : la carte ne remplit pas son conteneur`);
    await page.screenshot({ path: `${out}/${lang}-${vp}-${r || 'accueil'}.png`, fullPage: true });
  }
  if (lang === 'fr') {
    await page.goto(`${base}#/analyses`);
    for (const tab of ['Implantation', 'Chalandise']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(1200);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 1) failures.push(`${vp} ${tab} : débordement horizontal de ${over} px`);
      await page.screenshot({ path: `${out}/fr-${vp}-analyses-${tab.toLowerCase()}.png`, fullPage: true });
    }
  }
  if (lang === 'fr' && vp === 'desktop') {
    await page.goto(`${base}#/rapports`);
    await page.waitForTimeout(800);
    for (const label of ['CSV', 'PNG', 'Excel']) {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.getByRole('button', { name: label, exact: true }).click()]);
      const saved = await dl.path();
      if (!statSync(saved).size) failures.push(`export ${label} vide`);
      console.log('export', label, dl.suggestedFilename());
      if (label === 'Excel') xlsxPath = join(tmpdir(), 'ts-export.xlsx'), await dl.saveAs(xlsxPath);
    }
    await page.goto(`${base}#/territoires`);
    await page.waitForTimeout(800);
    await page.locator('.map-label').first().waitFor({ timeout: 15000 });
    await page.getByRole('complementary').getByRole('button', { name: /^Oriental/ }).click();
    await page.getByRole('heading', { name: 'Oriental' }).waitFor();
    await page.getByLabel('Rechercher un point').fill('Tamansourt');
    await page.getByText('Filtre actif').waitFor();
    if (!(await page.getByRole('cell', { name: 'Tamansourt' }).count())) failures.push('recherche : Tamansourt absent du tableau');
  }
  if (lang === 'fr' && vp === 'desktop') {
    const count = async (id) => (await page.getByTestId(`count-${id}`).innerText()).trim();
    const expect = (label, got, want) => { if (got !== want) failures.push(`import ${label} : obtenu ${got}, attendu ${want}`); };
    await page.goto(`${base}#/donnees`);
    const file = page.getByLabel('Fichier à importer');
    // Fichier non pris en charge : message compréhensible.
    await file.setInputFiles(tmp('donnees.gpkg', 'x'));
    await page.getByRole('alert').filter({ hasText: 'Format non pris en charge' }).waitFor();
    // CSV avec erreurs : chaque rejet est compté.
    await file.setInputFiles(tmp('sites.csv', 'nom;latitude;longitude\nSite Test A;33,57;-7,59\nSite Test B;34,02;-6,84\nSite Test A;33,57;-7,59\nSite C;;-6\nSite D;abc;-5\nSite E;99;-5\nSite F;48,85;2,35\n'));
    await page.getByTestId('count-total').waitFor();
    for (const [k, v] of [['total', '7'], ['valid', '2'], ['duplicate', '1'], ['missingCoords', '1'], ['invalidCoords', '1'], ['outOfRange', '1'], ['outsideMorocco', '1']]) expect(k, await count(k), v);
    await page.screenshot({ path: `${out}/fr-desktop-import-rapport.png`, fullPage: true });
    await page.getByLabel('Type de données').selectOption('candidate');
    await page.getByRole('button', { name: 'Intégrer 2 lignes' }).click();
    await page.getByText('Données intégrées').waitFor();
    // CSV en Merchich : conseil de projection, puis conversion.
    await file.setInputFiles(tmp('services-merchich.csv', 'nom;x;y\nS1;295600;322500\nS2;296000;323000\n'));
    await page.getByText('ressemblent à des coordonnées projetées').waitFor();
    await page.getByLabel('Système de coordonnées').selectOption('EPSG:26191');
    await page.getByLabel('Type de données').selectOption('service');
    expect('merchich', await count('valid'), '2');
    if (await page.getByTestId('count-outsideMorocco').count()) failures.push('merchich : points hors du Maroc');
    await page.getByRole('button', { name: 'Intégrer 2 lignes' }).click();
    await page.getByText('Données intégrées').waitFor();
    // GeoJSON avec polygone.
    await file.setInputFiles(tmp('zones.geojson', JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { nom: 'Z1', population: 1000 }, geometry: { type: 'Polygon', coordinates: [[[-7.7, 33.4], [-7.5, 33.4], [-7.5, 33.6], [-7.7, 33.6], [-7.7, 33.4]]] } }] })));
    await page.getByText('ramenées à leur centre').waitFor();
    expect('geojson', await count('valid'), '1');
    await page.getByRole('button', { name: 'Annuler' }).click();
    // Shapefile en ZIP.
    await file.setInputFiles(tmp('points.zip', makeShapefileZip()));
    await page.getByTestId('count-total').waitFor();
    expect('shapefile', await count('valid'), '2');
    await page.getByRole('button', { name: 'Annuler' }).click();
    // Le fichier Excel exporté se relit ; il n'a pas de coordonnées, et le dit.
    await file.setInputFiles(xlsxPath);
    await page.getByText('Aucune colonne de coordonnées reconnue').waitFor({ timeout: 20000 }).catch(async () => { failures.push('xlsx : indication de coordonnées absente'); });
    expect('xlsx lignes', await count('total').catch(() => 'absent'), '8');
    await page.getByRole('button', { name: 'Annuler' }).click();
    await page.screenshot({ path: `${out}/fr-desktop-import-liste.png`, fullPage: true });
    // Intégration : le site importé entre dans le classement, sans rechargement de page.
    await page.getByRole('link', { name: 'Analyses' }).first().click();
    await page.getByText('Ces résultats incluent vos données importées').waitFor();
    await page.getByRole('button', { name: 'Implantation', exact: true }).click();
    await page.getByRole('button', { name: /Site Test A/ }).first().waitFor();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/fr-desktop-analyses-import.png`, fullPage: true });
    await page.getByRole('link', { name: 'Données' }).first().click();
    await page.getByRole('button', { name: 'Retirer' }).first().click();
    await page.getByRole('button', { name: 'Retirer' }).first().click();
    await page.getByText('Aucun fichier importé').waitFor();
  }
  await ctx.close();
}
await browser.close();
if (failures.length) { console.error(`ÉCHECS (${failures.length})\n` + [...new Set(failures)].join('\n')); process.exit(1); }
console.log('Parcours e2e réussi');
