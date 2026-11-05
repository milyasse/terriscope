import { useMemo, useRef, useState } from 'react';
import type { Map as MlMap } from 'maplibre-gl';
import { coverageColor, MapView } from '../components/MapView';
import { Card, DemoBadge, Kpi, Note, Segmented } from '../components/Ui';
import { DEMO_DATE, nationalCoverage, regionById, REGIONS } from '../lib/demo';
import { downloadBlob, toCsv } from '../lib/export';
import { useI18n } from '../lib/i18n';

export default function Reports() {
  const { t, num, pct, regionName } = useI18n();
  const [km, setKm] = useState(5);
  const map = useRef<MlMap | null>(null);
  const res = useMemo(() => nationalCoverage(km), [km]);
  const fills = useMemo(() => Object.fromEntries(REGIONS.map((r) => [r.id, coverageColor(res.territories.find((x) => x.territory === r.id)?.rate ?? 0)])), [res]);
  const sorted = [...res.territories].sort((a, b) => a.rate - b.rate);
  const lowest = sorted.slice(0, 3).map((x) => regionName(regionById(x.territory)));
  const csv = () => downloadBlob(`terriscope-couverture-${km}km-demo.csv`, new Blob([toCsv([['Mode', 'DEMO, données fictives'], ['Région', 'Population', 'Population couverte', 'Taux'], ...res.territories.map((x) => [regionById(x.territory).name, x.population, x.coveredPopulation, Number((x.rate * 100).toFixed(1))])])], { type: 'text/csv;charset=utf-8' }));
  const png = () => { const m = map.current; if (!m) return; m.once('render', () => m.getCanvas().toBlob((b) => { if (b) downloadBlob(`terriscope-carte-${km}km-demo.png`, b); })); m.triggerRepaint(); };
  return <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-5">
    <div className="no-print flex flex-wrap items-end justify-between gap-3">
      <h1 className="m-0 text-2xl font-extrabold">{t('reportsTitle')}</h1>
      <Segmented label={t('radius')} value={String(km)} onChange={(v) => setKm(Number(v))} options={[1, 3, 5, 10, 15].map((r) => ({ value: String(r), label: `${r} km` }))} />
    </div>
    <div className="no-print flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => window.print()} className="min-h-11 rounded-lg border-0 bg-forest px-4 font-extrabold text-white">{t('exportPdf')}</button>
      <button type="button" onClick={csv} className="min-h-11 rounded-lg border border-line bg-white px-4 font-extrabold text-night">{t('exportCsv')}</button>
      <button type="button" onClick={png} className="min-h-11 rounded-lg border border-line bg-white px-4 font-extrabold text-night">{t('exportPng')}</button>
      <button type="button" disabled title={t('excelSoon')} className="min-h-11 rounded-lg border border-line bg-mist px-4 font-extrabold text-muted">{t('exportExcel')}</button>
      <span className="text-xs font-semibold text-muted">{t('pdfHint')} {t('excelSoon')}.</span>
    </div>
    <Card className="flex flex-col gap-4 p-5 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="m-0 text-2xl font-extrabold">{t('reportHeading')}</h2><p className="m-0 mt-1 font-semibold text-muted">{t('reportSub')} · {km} km</p></div><DemoBadge /></header>
      <div className="h-[340px] overflow-hidden rounded-lg"><MapView label={t('reportHeading')} fills={fills} view="all" onReady={(m) => { map.current = m; }} /></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label={t('rate')} value={pct(res.rate, 1)} /><Kpi label={t('covered')} value={num(res.coveredPopulation)} /><Kpi label={t('uncoveredPop')} value={num(res.uncoveredPopulation)} /><Kpi label={t('deficitT')} value={num(res.deficitTerritories)} /></div>
      <section><h3 className="m-0 mb-1 text-base font-extrabold">{t('methodology')}</h3><p className="m-0 leading-6">{t('methodologyText', { km })}</p></section>
      <section><h3 className="m-0 mb-2 text-base font-extrabold">{t('results')}</h3><div className="overflow-x-auto"><table className="w-full min-w-[420px] border-collapse text-[13px]"><thead><tr><th className="p-2 text-start text-xs font-bold text-muted">{t('region')}</th><th className="p-2 text-start text-xs font-bold text-muted">{t('population')}</th><th className="p-2 text-start text-xs font-bold text-muted">{t('rate')}</th></tr></thead><tbody>{sorted.map((x) => <tr key={x.territory} className="border-t border-[#e6ebef]"><td className="p-2">{regionName(regionById(x.territory))}</td><td className="p-2">{num(x.population)}</td><td className="p-2 font-extrabold">{pct(x.rate, 1)}</td></tr>)}</tbody></table></div></section>
      <section><h3 className="m-0 mb-1 text-base font-extrabold">{t('recommendations')}</h3><p className="m-0 leading-6">{t('recoText', { a: lowest[0] ?? '', b: lowest[1] ?? '', c: lowest[2] ?? '' })}</p></section>
      <section><h3 className="m-0 mb-1 text-base font-extrabold">{t('sources')}</h3><Note>{t('sourcesText', { d: DEMO_DATE })}</Note></section>
    </Card>
  </div>;
}
