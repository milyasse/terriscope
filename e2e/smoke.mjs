// Parcours de contrôle : charge chaque écran en desktop et mobile, français et arabe.
// Échoue sur toute erreur de console ou de page, et enregistre des captures.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.BASE_URL ?? 'http://localhost:4173/';
const out = process.env.OUT_DIR ?? 'artifacts/screens';
mkdirSync(out, { recursive: true });
const routes = ['', 'tableau-de-bord', 'territoires', 'analyses', 'donnees', 'rapports'];
const viewports = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const failures = [];
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
    await page.screenshot({ path: `${out}/${lang}-${vp}-${r || 'accueil'}.png`, fullPage: true });
  }
  if (lang === 'fr' && vp === 'desktop') {
    await page.goto(`${base}#/analyses`);
    for (const tab of ['Implantation', 'Chalandise']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${out}/fr-desktop-analyses-${tab.toLowerCase()}.png`, fullPage: true });
    }
    await page.goto(`${base}#/rapports`);
    await page.waitForTimeout(800);
    for (const label of ['CSV', 'PNG']) {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.getByRole('button', { name: label, exact: true }).click()]);
      console.log('export', label, dl.suggestedFilename());
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
  await ctx.close();
}
await browser.close();
if (failures.length) { console.error(`ÉCHECS (${failures.length})\n` + [...new Set(failures)].join('\n')); process.exit(1); }
console.log('Parcours e2e réussi');
