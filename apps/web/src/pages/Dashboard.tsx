import { Suspense, lazy, useMemo, useState } from 'react';
import { computeCoverage } from '@terriscope/analytics';
import { GlobalFilters } from '../components/Filters';
import { coverageColor, MapView } from '../components/MapView';
import { Bar, Card, Kpi, Note } from '../components/Ui';
import { filterCells, NO_FILTERS, coverageOf, regionPotential, REGIONS, servicePoints, type Filters } from '../lib/demo';
import { useI18n } from '../lib/i18n';
import { href } from '../lib/router';

const ChartLine = lazy(() => import('../components/ChartLine').then((m) => ({ default: m.ChartLine })));
const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'];

export default function Dashboard() {
  const { t, num, pct, regionName, lang } = useI18n();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const cells = useMemo(() => filterCells(filters), [filters]);
  const cov = useMemo(() => computeCoverage(cells, servicePoints, 5), [cells]);
  const regionIds = new Set(cells.map((c) => c.region));
  const scope = REGIONS.filter((r) => regionIds.has(r.id));
  const shops = scope.reduce((s, r) => s + r.shops * (cells.filter((c) => c.region === r.id).reduce((a, c) => a + c.population, 0) / r.population), 0);
  const communes = new Set(cells.map((c) => c.commune)).size;
  const fills = useMemo(() => Object.fromEntries(REGIONS.map((r) => [r.id, coverageColor(coverageOf(r.id)?.rate ?? 0)])), []);
  const bubbles = useMemo(() => REGIONS.map((r) => ({ id: r.id, position: r.label, text: pct(coverageOf(r.id)?.rate ?? 0).replace(/\s/g, ''), color: '#fff', dark: true, size: 38, title: regionName(r), region: r.id })), [pct, regionName]);
  const top = [...REGIONS].sort((a, b) => (regionPotential.get(b.id) ?? 0) - (regionPotential.get(a.id) ?? 0)).slice(0, 6);
  const end = cov.rate * 100;
  const series = useMemo(() => MONTHS.map((_, i) => Math.max(0, end - (MONTHS.length - 1 - i) * 0.45)), [end]);
  const total = REGIONS.reduce((s, r) => s + r.shops, 0);
  const shares = [...REGIONS].sort((a, b) => b.shops - a.shops).slice(0, 3);
  const rest = total - shares.reduce((s, r) => s + r.shops, 0);
  const potentialCount = scope.filter((r) => (regionPotential.get(r.id) ?? 0) >= 70).length;
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-3.5 p-4 md:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><h1 className="m-0 text-2xl font-extrabold">{t('navDashboard')}</h1><GlobalFilters value={filters} onChange={setFilters} /></div>
      <section aria-label={t('filters')} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label={t('population')} value={`${num(cov.population / 1e6, 2)} M`} note={t('kpiScope')} />
        <Kpi label={t('communes')} value={num(communes)} note={t('kpiScope')} />
        <Kpi label={t('shops')} value={num(Math.round(shops))} note={t('kpiScope')} />
        <Kpi label={t('coverage')} value={pct(cov.rate, 1)} note={t('coverageAt', { km: 5 })} tone="good" />
        <Kpi label={t('deficitZones')} value={num(cov.deficitTerritories)} note={t('under55')} tone="warn" />
        <Kpi label={t('potentialSites')} value={num(potentialCount)} note={t('score70')} tone="good" />
      </section>
      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"><h2 className="m-0 text-base font-extrabold">{t('coverageAt', { km: 5 })}</h2><a href={href('territoires')} className="text-[13px] font-extrabold text-forest">{t('openTerritories')}</a></div>
          <div className="h-[340px] md:h-[440px]"><MapView label={t('coverageAt', { km: 5 })} fills={fills} bubbles={bubbles} selected={filters.region || null} onSelect={(region) => setFilters({ region, province: '', commune: '' })} /></div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 py-2.5 text-xs font-semibold">{([['legendHigh', '#075B50'], ['legendMedium', '#159B78'], ['legendLow', '#A9DCC8']] as const).map(([k, c]) => <span key={k} className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3.5 rounded-sm" style={{ background: c }} />{t(k)}</span>)}<span className="text-muted">{t('mapNote')}</span></div>
        </Card>
        <Card className="flex flex-col gap-2 p-4">
          <h2 className="m-0 mb-1 text-base font-extrabold">{t('potentialZones')}</h2>
          {top.map((r, i) => <button key={r.id} type="button" aria-pressed={filters.region === r.id} onClick={() => setFilters({ region: r.id, province: '', commune: '' })} className={`rounded-lg border px-2.5 py-2 text-start ${filters.region === r.id ? 'border-forest bg-mint' : 'border-[#e6ebef] bg-white'}`}><span className="mb-1.5 flex justify-between gap-2 text-[13px] font-bold"><span>{i + 1}. {regionName(r)}</span><strong className="font-extrabold">{num(regionPotential.get(r.id) ?? 0)}</strong></span><Bar value={regionPotential.get(r.id) ?? 0} /></button>)}
          <p className="m-0 mt-1 text-xs leading-[18px] text-muted">{t('scoreNote')}</p>
        </Card>
      </div>
      <div className="grid gap-3.5 lg:grid-cols-[2fr_1.4fr_1fr]">
        <Card className="p-4"><h2 className="m-0 text-base font-extrabold">{t('evolution')}</h2><p className="m-0 text-xs font-semibold text-muted">{t('evolutionNote')}</p><Suspense fallback={<div className="h-44" />}><ChartLine labels={MONTHS} values={series} name={t('coverage')} rtl={lang === 'ar'} label={`${t('evolution')} · ${t('evolutionNote')}`} /></Suspense></Card>
        <Card className="p-4"><h2 className="m-0 mb-3 text-base font-extrabold">{t('shopsByRegion')}</h2><div className="flex flex-col gap-2.5">{[...shares.map((r) => ({ n: regionName(r), v: r.shops })), { n: t('otherRegions'), v: rest }].map((s) => <div key={s.n} className="text-[13px] font-semibold"><div className="mb-1 flex justify-between gap-2"><span>{s.n}</span><strong className="font-extrabold">{pct(s.v / total)}</strong></div><Bar value={(s.v / total) * 100} color="var(--color-night)" /></div>)}</div></Card>
        <section className="flex flex-col gap-2.5 rounded-xl bg-night p-4 text-white"><h2 className="m-0 text-base font-extrabold">{t('lastReport')}</h2><p className="m-0 text-sm leading-6">{t('lastReportText')}</p><a href={href('rapports')} className="mt-auto inline-flex min-h-11 items-center justify-center rounded-lg bg-white font-extrabold text-night no-underline">{t('seeReports')}</a></section>
      </div>
      <Note>{t('demoNotice')}</Note>
    </div>
  );
}
