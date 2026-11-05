import { useMemo, useState } from 'react';
import { circle, computeCatchment, computeCoverage, buildCandidateMetrics, CRITERIA, DEFAULT_WEIGHTS, scoreCandidates, STANDARD_RADII_KM, type CriterionKey, type Weights } from '@terriscope/analytics';
import { coverageColor, MapView } from '../components/MapView';
import { Card, Kpi, Note, Segmented, Select } from '../components/Ui';
import { competitorPoints, dataset, regionById, REGIONS, servicePoints } from '../lib/demo';
import { useI18n, type TKey } from '../lib/i18n';

type Tab = 'coverage' | 'siting' | 'catchment';
const critKey = (k: CriterionKey) => `crit${k}` as TKey;
const th = 'p-2 text-start text-xs font-bold text-muted';
const td = 'p-2';

function Coverage() {
  const { t, num, pct, regionName } = useI18n();
  const [km, setKm] = useState(5);
  const [region, setRegion] = useState('');
  const cells = useMemo(() => (region ? dataset.cells.filter((c) => c.region === region) : dataset.cells), [region]);
  const res = useMemo(() => computeCoverage(cells, servicePoints, km), [cells, km]);
  const scen = useMemo(() => STANDARD_RADII_KM.map((r) => computeCoverage(cells, servicePoints, r)), [cells]);
  const nat = useMemo(() => computeCoverage(dataset.cells, servicePoints, km), [km]);
  const fills = useMemo(() => Object.fromEntries(REGIONS.map((r) => [r.id, coverageColor(nat.territories.find((x) => x.territory === r.id)?.rate ?? 0)])), [nat]);
  const bubbles = useMemo(() => REGIONS.map((r) => ({ id: r.id, position: r.label, text: pct(nat.territories.find((x) => x.territory === r.id)?.rate ?? 0).replace(/\s/g, ''), color: '#fff', dark: true, size: 38, title: regionName(r), region: r.id })), [nat, pct, regionName]);
  const classLabel: Record<string, TKey> = { high: 'legendHigh', medium: 'legendMedium', low: 'legendLow', none: 'legendNone' };
  return <div className="flex flex-col gap-3.5">
    <div className="flex flex-wrap items-end gap-3">
      <Select label={t('region')} value={region} onChange={setRegion} options={[{ value: '', label: t('all') }, ...REGIONS.map((r) => ({ value: r.id, label: regionName(r) }))]} />
      <div><div className="mb-0.5 text-xs font-bold text-muted">{t('radius')}</div><Segmented label={t('radius')} value={String(km)} onChange={(v) => setKm(Number(v))} options={STANDARD_RADII_KM.map((r) => ({ value: String(r), label: `${r} km` }))} /></div>
    </div>
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi label={t('rate')} value={pct(res.rate, 1)} tone="good" />
      <Kpi label={t('covered')} value={num(res.coveredPopulation)} />
      <Kpi label={t('uncoveredPop')} value={num(res.uncoveredPopulation)} tone="warn" />
      <Kpi label={t('coveredHouseholds')} value={num(res.coveredHouseholds)} />
      <Kpi label={t('meanAccess')} value={res.meanAccessKm === null ? '—' : `${num(res.meanAccessKm, 1)} km`} />
      <Kpi label={t('servedT')} value={num(res.servedTerritories)} />
      <Kpi label={t('deficitT')} value={num(res.deficitTerritories)} tone="warn" />
    </section>
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
      <Card className="overflow-hidden"><div className="h-[380px]"><MapView label={t('tabCoverage')} fills={fills} bubbles={bubbles} selected={region || null} onSelect={setRegion} /></div><div className="flex flex-wrap gap-x-4 gap-y-1 p-3 text-xs font-semibold">{([['legendHigh', '#075B50'], ['legendMedium', '#159B78'], ['legendLow', '#A9DCC8']] as const).map(([k, c]) => <span key={k} className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3.5 rounded-sm" style={{ background: c }} />{t(k)}</span>)}<span className="text-muted">{t('mapNote')}</span></div></Card>
      <div className="flex min-w-0 flex-col gap-3.5">
        <Card className="overflow-x-auto p-3"><h2 className="m-0 mb-2 px-2 text-base font-extrabold">{t('compareScenarios')}</h2><table className="w-full min-w-[420px] border-collapse text-[13px]"><thead><tr><th className={th}>{t('scenarioRadius')}</th><th className={th}>{t('rate')}</th><th className={th}>{t('covered')}</th><th className={th}>{t('deficitT')}</th></tr></thead><tbody>{scen.map((s) => <tr key={s.radiusKm} className={`border-t border-[#e6ebef] ${s.radiusKm === km ? 'bg-mint font-bold' : ''}`}><td className={td}>{s.radiusKm} km</td><td className={td}>{pct(s.rate, 1)}</td><td className={td}>{num(s.coveredPopulation)}</td><td className={td}>{num(s.deficitTerritories)}</td></tr>)}</tbody></table></Card>
        <Card className="max-h-72 overflow-auto p-3"><h2 className="m-0 mb-2 px-2 text-base font-extrabold">{t('byTerritory')}</h2><table className="w-full border-collapse text-[13px]"><thead><tr><th className={th}>{t('region')}</th><th className={th}>{t('rate')}</th><th className={th}>{t('classCol')}</th></tr></thead><tbody>{[...res.territories].sort((a, b) => a.rate - b.rate).map((x) => <tr key={x.territory} className="border-t border-[#e6ebef]"><td className={td}>{regionName(regionById(x.territory))}</td><td className={`${td} font-extrabold`}>{pct(x.rate)}</td><td className={td}>{t(classLabel[x.coverageClass] as TKey)}</td></tr>)}</tbody></table></Card>
      </div>
    </div>
    <Note>{t('straightLine')} {t('demoNotice')}</Note>
  </div>;
}

function Siting() {
  const { t, num, regionName } = useI18n();
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [selected, setSelected] = useState(dataset.candidates[0]?.id ?? '');
  const metrics = useMemo(() => buildCandidateMetrics(dataset.candidates, dataset.cells, servicePoints, competitorPoints), []);
  const result = useMemo(() => scoreCandidates(metrics, weights), [metrics, weights]);
  const first = result.candidates[0], second = result.candidates[1];
  const cur = result.candidates.find((c) => c.id === selected) ?? first;
  const fills = useMemo(() => Object.fromEntries(REGIONS.map((r) => [r.id, r.id === 'CAS' ? '#DDF3EA' : '#ECEFF2'])), []);
  const bubbles = useMemo(() => result.candidates.map((c) => { const s = dataset.candidates.find((x) => x.id === c.id); return { id: c.id, position: s?.position ?? [0, 0] as [number, number], text: String(c.rank), color: c.id === selected ? '#075B50' : '#142D46', size: 30, title: `${c.name} : ${Math.round(c.score)}` }; }), [result, selected]);
  const usable = CRITERIA.filter((c) => !result.excludedCriteria.includes(c.key));
  return <div className="flex flex-col gap-3.5">
    {first && second && <p className="m-0 rounded-xl bg-night p-4 text-base font-bold leading-6 text-white">{t('leads', { a: first.name, s: num(first.score), b: second.name, t: num(second.score) })}</p>}
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Card className="overflow-hidden"><div className="h-[420px]"><MapView label={t('tabSiting')} fills={fills} bubbles={bubbles} view="north" /></div></Card>
      <Card className="flex flex-col gap-2 p-4">
        <h2 className="m-0 text-base font-extrabold">{t('ranking')}</h2>
        {result.candidates.map((c) => <button key={c.id} type="button" aria-pressed={c.id === selected} onClick={() => setSelected(c.id)} className={`flex min-h-14 items-center gap-3 rounded-lg border px-3 py-1.5 text-start ${c.id === selected ? 'border-2 border-forest bg-mint' : 'border-[#e6ebef] bg-white'}`}><span className="text-2xl font-extrabold text-forest">{num(c.score)}</span><span className="text-sm font-extrabold">{c.rank}. {c.name}<span className="block text-xs font-semibold text-muted">{regionName(regionById(dataset.candidates.find((x) => x.id === c.id)?.region ?? 'CAS'))}</span></span></button>)}
      </Card>
    </div>
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
      <Card className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2"><h2 className="m-0 text-base font-extrabold">{t('weights')} · {cur?.name}</h2><button type="button" onClick={() => setWeights(DEFAULT_WEIGHTS)} className="min-h-9 rounded-md border border-line bg-white px-2.5 text-xs font-bold text-night">{t('reset')}</button></div>
        {usable.map((c) => <label key={c.key} className="grid grid-cols-[minmax(0,1fr)_110px_72px] items-center gap-2 text-[13px] font-semibold"><span>{t(critKey(c.key))}</span><input type="range" min={0} max={40} step={5} value={weights[c.key]} aria-label={t('weightOf', { c: t(critKey(c.key)) })} onChange={(e) => setWeights({ ...weights, [c.key]: Number(e.target.value) })} className="w-full accent-forest" /><span className="text-end text-xs"><strong className="font-extrabold">{num(cur?.notes[c.key] ?? 0)}</strong> · {num((result.appliedWeights[c.key] ?? 0) * 100)} %</span></label>)}
        {result.excludedCriteria.map((k) => <Note key={k}>{t('excluded', { c: t(critKey(k)) })}</Note>)}
        <p className="m-0 text-xs font-semibold leading-[18px] text-muted">{t('scoreDisclaimer')}</p>
      </Card>
      <Card className="overflow-x-auto p-3"><h2 className="m-0 mb-2 px-2 text-base font-extrabold">{t('comparison')}</h2><table className="w-full min-w-[460px] border-collapse text-[13px]"><thead><tr><th className={th}>{t('site')}</th><th className={th}>{t('score')}</th><th className={th}>{t('pop5')}</th><th className={th}>{t('comp5')}</th><th className={th}>{t('roadKm')}</th></tr></thead><tbody>{result.candidates.map((c) => { const m = metrics.find((x) => x.id === c.id)?.metrics; return <tr key={c.id} className="border-t border-[#e6ebef]"><td className={`${td} font-bold`}>{c.name}</td><td className={`${td} font-extrabold`}>{num(c.score)}</td><td className={td}>{num(Math.round((m?.density ?? 0) * Math.PI * 25))}</td><td className={td}>{num(m?.competition ?? 0)}</td><td className={td}>{num(m?.accessibility ?? 0, 1)} km</td></tr>; })}</tbody></table></Card>
    </div>
  </div>;
}

function Catchment() {
  const { t, num } = useI18n();
  const [site, setSite] = useState(dataset.candidates[0]?.id ?? '');
  const [km, setKm] = useState(5);
  const candidate = dataset.candidates.find((c) => c.id === site) ?? dataset.candidates[0];
  const position = candidate?.position ?? [-7.6, 33.5];
  const rows = useMemo(() => computeCatchment(position, dataset.cells, competitorPoints), [position]);
  const rings = useMemo(() => STANDARD_RADII_KM.filter((r) => r <= km).map((r) => circle(position, r)), [position, km]);
  const cur = rows.find((r) => r.radiusKm === km);
  const bubbles = useMemo(() => [{ id: 'site', position, text: '1', color: '#142D46', size: 30, title: candidate?.name ?? '' }, ...competitorPoints.filter((c) => Math.abs(c.position[0] - position[0]) < 1 && Math.abs(c.position[1] - position[1]) < 1).slice(0, 80).map((c) => ({ id: c.id, position: c.position, text: '', color: '#F2A541', size: 12, title: t('typeCompetitor') }))], [position, candidate, t]);
  const fills = useMemo(() => Object.fromEntries(REGIONS.map((r) => [r.id, '#ECEFF2'])), []);
  const zoom = km >= 15 ? 9 : km >= 10 ? 9.6 : km >= 5 ? 10.5 : km >= 3 ? 11.2 : 12.6;
  return <div className="flex flex-col gap-3.5">
    <div className="flex flex-wrap items-end gap-3">
      <Select label={t('site')} value={site} onChange={setSite} options={dataset.candidates.map((c) => ({ value: c.id, label: c.name }))} />
      <div><div className="mb-0.5 text-xs font-bold text-muted">{t('method')}</div><Segmented label={t('method')} value="radius" onChange={() => undefined} options={[{ value: 'radius', label: t('methodRadius') }, { value: 'distance', label: t('methodDistance'), disabled: true, title: t('routerOff') }, { value: 'time', label: t('methodTime'), disabled: true, title: t('routerOff') }]} /></div>
      <div><div className="mb-0.5 text-xs font-bold text-muted">{t('radiusKm')}</div><Segmented label={t('radiusKm')} value={String(km)} onChange={(v) => setKm(Number(v))} options={STANDARD_RADII_KM.map((r) => ({ value: String(r), label: String(r) }))} /></div>
    </div>
    <Note>{t('routerOff')}</Note>
    <section className="grid grid-cols-2 gap-3 md:grid-cols-3"><Kpi label={t('population')} value={num(cur?.population ?? 0)} /><Kpi label={t('households')} value={num(cur?.households ?? 0)} /><Kpi label={t('competitors')} value={num(cur?.competitors ?? 0)} tone="warn" /></section>
    <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card className="overflow-hidden"><div className="h-[420px]"><MapView label={t('tabCatchment')} fills={fills} rings={rings} bubbles={bubbles} center={{ center: position, zoom }} /></div></Card>
      <Card className="overflow-x-auto p-3"><h2 className="m-0 mb-2 px-2 text-base font-extrabold">{t('catchmentTable')}</h2><table className="w-full border-collapse text-[13px]"><thead><tr><th className={th}>{t('radiusKm')}</th><th className={th}>{t('population')}</th><th className={th}>{t('households')}</th><th className={th}>{t('competitors')}</th></tr></thead><tbody>{rows.map((r) => <tr key={r.radiusKm} className={`border-t border-[#e6ebef] ${r.radiusKm === km ? 'bg-mint font-bold' : ''}`}><td className={td}>{r.radiusKm} km</td><td className={td}>{num(r.population)}</td><td className={td}>{num(r.households)}</td><td className={td}>{num(r.competitors)}</td></tr>)}</tbody></table><p className="m-0 mt-2 px-2 text-xs font-semibold leading-[18px] text-muted">{t('radiiNote')}</p></Card>
    </div>
  </div>;
}

export default function Analyses() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('coverage');
  return <div className="mx-auto flex max-w-[1400px] flex-col gap-3.5 p-4 md:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="m-0 text-2xl font-extrabold">{t('analysesTitle')}</h1><Segmented label={t('analysesTitle')} value={tab} onChange={setTab} options={[{ value: 'coverage', label: t('tabCoverage') }, { value: 'siting', label: t('tabSiting') }, { value: 'catchment', label: t('tabCatchment') }]} /></div>
    {tab === 'coverage' && <Coverage />}{tab === 'siting' && <Siting />}{tab === 'catchment' && <Catchment />}
  </div>;
}
