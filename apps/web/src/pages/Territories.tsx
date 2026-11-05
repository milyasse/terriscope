import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Target, X } from 'lucide-react';
import { distanceKm, scoreCandidates, buildCandidateMetrics, type DemoRegion } from '@terriscope/analytics';
import { coverageColor, MapView, potentialColor, type Bubble, type MapLabel } from '../components/MapView';
import { competitorPoints, coverageOf, dataset, regionById, regionPotential, REGIONS, servicePoints } from '../lib/demo';
import { useI18n, type TKey } from '../lib/i18n';
import { href } from '../lib/router';

type Mode = 'territories' | 'coverage' | 'potential';
const STATUS: [string, TKey][] = [['all', 'statusAll'], ['draft', 'statusDraft'], ['pending', 'statusPending'], ['validated', 'statusValidated'], ['active', 'statusActive']];
const SOUTH = ['GON', 'LSH', 'DOE'];
interface Row { id: string; name: string; commune: string; region: string; type: 'candidate' | 'service' | 'competitor'; lat: number; lng: number; score: number | null; assignee: string }

const nearestCity = (region: DemoRegion, p: [number, number]) => [...region.cities].sort((a, b) => distanceKm(a.position, p) - distanceKm(b.position, p))[0]?.name ?? '';
const scores = new Map(scoreCandidates(buildCandidateMetrics(dataset.candidates, dataset.cells, servicePoints, competitorPoints)).candidates.map((c) => [c.id, Math.round(c.score)]));
const ALL_ROWS: Row[] = [
  ...dataset.candidates.map((c): Row => ({ id: c.id, name: c.name, commune: c.commune, region: c.region, type: 'candidate', lat: c.position[1], lng: c.position[0], score: scores.get(c.id) ?? null, assignee: c.assignee })),
  ...dataset.services.map((s, i): Row => { const r = regionById(s.region); return { id: s.id, name: `${s.kind === 'service' ? 'S' : 'C'}-${String(i + 1).padStart(4, '0')}`, commune: nearestCity(r, s.position), region: s.region, type: s.kind, lat: s.position[1], lng: s.position[0], score: null, assignee: r.team }; }),
];
const TYPE_KEY: Record<Row['type'], TKey> = { candidate: 'typeCandidate', service: 'typeService', competitor: 'typeCompetitor' };

export default function Territories() {
  const { t, num, pct, regionName } = useI18n();
  const [mode, setMode] = useState<Mode>('territories');
  const [view, setView] = useState<'north' | 'all'>('north');
  const [sel, setSel] = useState<string | null>('CAS');
  const [status, setStatus] = useState('all');
  const [checked, setChecked] = useState<string[]>([]);
  const [bubblesOn, setBubblesOn] = useState(true);
  const [namesOn, setNamesOn] = useState(() => window.innerWidth >= 1024);
  const [layersOpen, setLayersOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | Row['type']>('all');
  const [high, setHigh] = useState(false);
  const [scope, setScope] = useState(false);
  const [asc, setAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(5);
  const [rowSel, setRowSel] = useState<string[]>([]);
  const pick = (id: string) => { setSel(id); setPage(1); if (SOUTH.includes(id)) setView('all'); };
  const list = REGIONS.filter((r) => status === 'all' || r.status === status);
  const allChecked = list.length > 0 && list.every((r) => checked.includes(r.id));
  const fills = useMemo(() => Object.fromEntries(REGIONS.map((r) => [r.id, mode === 'territories' ? r.color : mode === 'coverage' ? coverageColor(coverageOf(r.id)?.rate ?? 0) : potentialColor(regionPotential.get(r.id) ?? 0)])), [mode]);
  const bubbles = useMemo<Bubble[]>(() => {
    if (!bubblesOn) return [];
    if (mode !== 'territories') return REGIONS.map((r) => ({ id: r.id, position: r.label, text: mode === 'coverage' ? pct(coverageOf(r.id)?.rate ?? 0).replace(/\s/g, '') : num(regionPotential.get(r.id) ?? 0), color: '#fff', dark: true, size: 38, title: regionName(r), region: r.id }));
    return REGIONS.flatMap((r) => r.cities.map((c, i) => { const n = Math.round(r.shops * c.share); return { id: `${r.id}-${i}`, position: c.position, text: num(n), color: r.strong, size: n >= 5000 ? 46 : n >= 1000 ? 40 : 32, title: `${c.name} : ${num(n)} ${t('shops')}`, region: r.id }; }));
  }, [bubblesOn, mode, num, pct, regionName, t]);
  const labels = useMemo<MapLabel[]>(() => (namesOn && mode === 'territories' ? REGIONS.map((r) => ({ id: r.id, position: r.label, text: regionName(r), region: r.id })) : []), [namesOn, mode, regionName]);
  const needle = q.trim().toLowerCase();
  const matched = useMemo(() => ALL_ROWS.filter((r) => (!scope || !sel || r.region === sel) && (type === 'all' || r.type === type) && (!high || (r.score ?? -1) >= 50) && (!needle || `${r.name} ${r.commune}`.toLowerCase().includes(needle))).sort((a, b) => (a.type === 'candidate' ? 0 : 1) - (b.type === 'candidate' ? 0 : 1) || (asc ? 1 : -1) * a.name.localeCompare(b.name, 'fr')), [scope, sel, type, high, needle, asc]);
  const pages = Math.max(1, Math.ceil(matched.length / per));
  const current = Math.min(page, pages);
  const start = (current - 1) * per;
  const rows = matched.slice(start, start + per);
  const rowsAll = rows.length > 0 && rows.every((r) => rowSel.includes(r.id));
  const parts = [high && t('high'), type !== 'all' && t(TYPE_KEY[type]), scope && sel && regionName(regionById(sel)), needle && `« ${q.trim()} »`].filter(Boolean) as string[];
  const cur = sel ? regionById(sel) : null;
  const curCov = cur ? coverageOf(cur.id) : undefined;
  const curHouseholds = cur ? dataset.cells.filter((c) => c.region === cur.id).reduce((s, c) => s + c.households, 0) : 0;
  const curCommunes = cur ? new Set(dataset.cells.filter((c) => c.region === cur.id).map((c) => c.commune)).size : 0;
  const statusKey = cur ? (STATUS.find((s) => s[0] === cur.status)?.[1] ?? 'statusDraft') : 'statusDraft';
  const legend: [string, string][] = mode === 'territories' ? REGIONS.slice(0, 6).map((r) => [regionName(r), r.color]) : mode === 'coverage' ? [[t('legendHigh'), '#075B50'], [t('legendMedium'), '#159B78'], [t('legendLow'), '#A9DCC8']] : [[t('legendPotHigh'), '#142D46'], [t('legendPotMid'), '#3E6A8F'], [t('legendPotLow'), '#93B3CB'], [t('legendPotVery'), '#DCE7EF']];
  const controlBtn = 'min-h-11 rounded-lg border-0 bg-white px-3.5 text-sm font-bold text-night shadow-sm';
  return (
    <div className="flex flex-col lg:flex-row lg:items-stretch">
      <aside aria-label={t('navTerritories')} className="order-2 flex w-full flex-col border-line lg:order-1 lg:w-[310px] lg:flex-none lg:border-e">
        <div className="border-b border-line px-[18px] py-4"><h1 className="m-0 text-[19px] font-extrabold">{t('navTerritories')}</h1></div>
        <div className="flex flex-col gap-3 px-[18px] py-3.5">
          <label className="text-xs font-bold text-muted">{t('scenario')}<select className="mt-0.5 block h-11 w-full rounded-lg border border-line bg-white px-2 text-sm font-bold text-night"><option>{t('scenarioDefault')} · {t('statusDraft')}</option></select></label>
          <div role="group" aria-label={t('status')} className="flex flex-wrap gap-0.5">{STATUS.map(([v, k]) => <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v)} className={`min-h-8 rounded-md border-0 px-2 text-[13px] ${status === v ? 'bg-[#e6ebef] font-extrabold text-night' : 'bg-transparent font-semibold text-muted'}`}>{t(k)}</button>)}</div>
          <div className="border-y border-[#e6ebef] py-2 text-[13px] font-semibold text-muted">{t('territoriesCount', { n: list.length })}</div>
          <div className="flex items-center justify-between gap-2"><h2 className="m-0 text-[15px] font-bold">{t('showBubbles')}</h2><div className="flex overflow-hidden rounded-md border border-line"><button type="button" aria-pressed={bubblesOn} onClick={() => setBubblesOn(true)} className={`min-h-8 border-0 px-2 text-xs font-bold text-night ${bubblesOn ? 'bg-[#e6ebef]' : 'bg-white'}`}>{t('show')}</button><button type="button" aria-pressed={!bubblesOn} onClick={() => setBubblesOn(false)} className={`min-h-8 border-0 px-2 text-xs font-bold text-night ${!bubblesOn ? 'bg-[#e6ebef]' : 'bg-white'}`}>{t('hide')}</button></div></div>
          <a href={href('analyses')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-forest font-extrabold text-white no-underline"><Target size={16} aria-hidden="true" />{t('launch')}</a>
          <div className="flex justify-end"><button type="button" onClick={() => setChecked(allChecked ? [] : list.map((r) => r.id))} className="border-0 bg-transparent p-0 text-[13px] font-semibold text-muted">{t(allChecked ? 'unselectAll' : 'selectAll')}</button></div>
        </div>
        <div className="flex flex-col gap-1.5 px-[18px] pb-4">
          {list.map((r) => <div key={r.id} className={`flex items-center gap-2.5 rounded-lg border px-3 ${sel === r.id ? 'border-forest bg-mint' : 'border-mist bg-mist'}`}>
            <input type="checkbox" aria-label={t('select', { name: regionName(r) })} checked={checked.includes(r.id)} onChange={() => setChecked((c) => (c.includes(r.id) ? c.filter((x) => x !== r.id) : [...c, r.id]))} className="h-[18px] w-[18px] flex-none accent-forest" />
            <button type="button" onClick={() => pick(r.id)} className="flex min-h-[52px] min-w-0 flex-1 items-center gap-2.5 border-0 bg-transparent p-0 text-start text-night"><span aria-hidden="true" className="h-[11px] w-[11px] flex-none rounded-[3px]" style={{ background: r.strong }} /><span className="min-w-0"><span className="block text-sm font-bold leading-5">{regionName(r)}</span><span className="block text-xs font-medium text-muted">{r.team === 'Non affecté' ? t('unassigned') : r.team}</span></span></button>
          </div>)}
        </div>
      </aside>
      <div className="relative order-1 flex min-w-0 flex-1 flex-col lg:order-2">
        <div className="relative h-[52vh] min-h-[340px] lg:h-[580px]">
          <MapView label={t('navTerritories')} fills={fills} fillOpacity={mode === 'territories' ? 0.72 : 1} selected={sel} onSelect={pick} bubbles={bubbles} labels={labels} view={view} />
          <div className="absolute end-3 top-3 flex flex-col items-end gap-1.5">
            <button type="button" aria-expanded={layersOpen} onClick={() => setLayersOpen(!layersOpen)} className={`${controlBtn} inline-flex items-center gap-1`}>{t('layers')}{layersOpen ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}</button>
            {layersOpen && <div className="w-52 rounded-lg bg-white p-3 text-[13px] font-semibold shadow-md"><strong className="font-extrabold">{t('theme')}</strong>{([['territories', 'themeTerritories'], ['coverage', 'themeCoverage'], ['potential', 'themePotential']] as [Mode, TKey][]).map(([m, k]) => <label key={m} className="flex min-h-8 items-center gap-2"><input type="radio" name="theme" checked={mode === m} onChange={() => setMode(m)} className="accent-forest" />{t(k)}</label>)}<strong className="mt-1 block font-extrabold">{t('filters')}</strong><label className="flex min-h-8 items-center gap-2"><input type="checkbox" checked={bubblesOn} onChange={() => setBubblesOn(!bubblesOn)} className="accent-forest" />{t('showBubbles')}</label><label className="flex min-h-8 items-center gap-2"><input type="checkbox" checked={namesOn} onChange={() => setNamesOn(!namesOn)} className="accent-forest" />{t('showNames')}</label></div>}
          </div>
          <div className="absolute start-3 top-3"><button type="button" onClick={() => setView(view === 'north' ? 'all' : 'north')} className={controlBtn}>{t(view === 'north' ? 'zoomAll' : 'zoomNorth')}</button></div>
          <div className="absolute bottom-3 start-3 flex flex-col items-start gap-1.5">
            {legendOpen && <div className="max-w-60 rounded-lg bg-white p-3 text-xs font-semibold shadow-md"><div className="flex flex-col gap-1">{legend.map(([l, c]) => <span key={l} className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3.5 flex-none rounded-sm border border-[#9aa8b4]" style={{ background: c }} />{l}</span>)}</div><p className="mb-0 mt-1.5 font-medium text-muted">{t('mapNote')}</p></div>}
            <button type="button" aria-expanded={legendOpen} onClick={() => setLegendOpen(!legendOpen)} className={`${controlBtn} inline-flex items-center gap-1`}>{t('legend')}{legendOpen ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronUp size={15} aria-hidden="true" />}</button>
          </div>
        </div>
        {cur && <section aria-label={regionName(cur)} className="z-10 flex flex-col gap-2.5 border-y border-line bg-white p-4 lg:absolute lg:end-3 lg:top-[68px] lg:w-[272px] lg:rounded-xl lg:border lg:shadow-lg">
          <div className="flex items-start gap-2"><span aria-hidden="true" className="mt-1.5 h-[11px] w-[11px] flex-none rounded-full" style={{ background: cur.strong }} /><h2 className="m-0 flex-1 text-[15px] font-extrabold leading-5">{regionName(cur)}</h2><button type="button" aria-label={t('close')} onClick={() => setSel(null)} className="grid h-8 w-8 flex-none place-items-center rounded-md border-0 bg-transparent text-night"><X size={17} aria-hidden="true" /></button></div>
          <dl className="m-0 grid grid-cols-2 gap-2 border-b border-[#e6ebef] pb-2.5">{([['population', `${num(cur.population / 1e6, 1)} M`], ['households', num(curHouseholds)], ['communes', num(curCommunes)], ['shops', num(cur.shops)], ['coverage', pct(curCov?.rate ?? 0)], ['uncovered', `${num((cur.population - (curCov?.coveredPopulation ?? 0)) / 1e6, 2)} M`]] as [TKey, string][]).map(([k, v]) => <div key={k}><dt className="text-xs font-semibold text-muted">{t(k)}</dt><dd className="m-0 text-[15px] font-extrabold">{v}</dd></div>)}</dl>
          <div className="flex flex-col gap-1 text-[13px] font-semibold"><span className="flex justify-between gap-2"><span>{t('potentialScore')}</span><strong className="font-extrabold">{num(regionPotential.get(cur.id) ?? 0)} / 100</strong></span><span className="flex justify-between gap-2"><span>{t('status')}</span><strong className="font-extrabold">{t(statusKey)}</strong></span><span className="flex justify-between gap-2"><span>{t('owner')}</span><strong className="font-extrabold">{cur.team === 'Non affecté' ? t('unassigned') : cur.team}</strong></span></div>
          <a href={href('analyses')} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-mint font-extrabold text-forest no-underline">{t('analyzeTerritory')}</a>
        </section>}
        <section aria-label={t('dataPoints')} className="flex flex-1 flex-col bg-white">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#e6ebef] px-4 py-3">
            <h2 className="m-0 text-sm font-bold">{t('dataPoints')} <span className="font-medium text-muted">({t('dataPointsCount', { n: num(ALL_ROWS.length) })})</span></h2>
            <span className="text-[13px] font-semibold text-muted">{t('selected', { n: rowSel.length })}</span>
            <input aria-label={t('searchPoint')} placeholder={t('search')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="h-10 min-w-36 flex-1 rounded-md border border-line px-3 text-[13px] font-medium md:max-w-60" />
            <select aria-label={t('pointType')} value={type} onChange={(e) => { setType(e.target.value as typeof type); setPage(1); }} className="h-10 rounded-md border border-line bg-white px-1.5 text-[13px] font-semibold"><option value="all">{t('typeAll')}</option><option value="candidate">{t('typeCandidate')}</option><option value="service">{t('typeService')}</option><option value="competitor">{t('typeCompetitor')}</option></select>
            <button type="button" aria-pressed={high} onClick={() => { setHigh(!high); setPage(1); }} className={`min-h-10 rounded-md border-0 px-3 text-[13px] font-bold text-night ${high ? 'bg-amber' : 'bg-[#fdefd6]'}`}>{t('high')}</button>
            <button type="button" aria-pressed={scope} onClick={() => { setScope(!scope); setPage(1); }} className={`min-h-10 rounded-md border border-line px-3 text-[13px] font-bold text-night ${scope ? 'bg-mint' : 'bg-white'}`}>{t(scope ? 'thisTerritory' : 'allTerritories')}</button>
          </div>
          {parts.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 bg-mint px-4 py-2 text-[13px] font-bold"><span>{t('activeFilter', { f: parts.join(', ') })}</span><button type="button" onClick={() => { setHigh(false); setType('all'); setScope(false); setQ(''); setPage(1); }} className="border-0 bg-transparent p-0 font-extrabold text-forest">{t('clear')}</button></div>}
          <div className="overflow-x-auto"><table className="w-full min-w-[820px] border-collapse text-[13px]"><thead><tr className="border-b border-[#e6ebef] text-start"><th scope="col" className="w-10 py-2 ps-4"><input type="checkbox" aria-label={t('selectAll')} checked={rowsAll} onChange={() => { const ids = rows.map((r) => r.id); setRowSel((s) => (rowsAll ? s.filter((x) => !ids.includes(x)) : [...new Set([...s, ...ids])])); }} className="h-[17px] w-[17px] accent-forest" /></th><th scope="col" className="p-2 text-start font-bold" aria-sort={asc ? 'ascending' : 'descending'}><button type="button" onClick={() => setAsc(!asc)} className="inline-flex items-center gap-1 border-0 bg-transparent p-0 font-bold text-night">{t('name')}{asc ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}</button></th>{(['commune', 'region', 'type', 'assignment', 'coords'] as TKey[]).map((k) => <th key={k} scope="col" className="p-2 text-start font-bold">{t(k)}</th>)}<th scope="col" className="py-2 pe-4 ps-2 text-end font-bold">{t('score')}</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id} className="border-b border-[#f0f3f5]"><td className="py-2.5 ps-4"><input type="checkbox" aria-label={t('select', { name: r.name })} checked={rowSel.includes(r.id)} onChange={() => setRowSel((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))} className="h-[17px] w-[17px] accent-forest" /></td><td className="p-2 font-bold">{r.name}</td><td className="p-2">{r.commune}</td><td className="p-2">{regionName(regionById(r.region))}</td><td className="p-2">{t(TYPE_KEY[r.type])}</td><td className="p-2 text-muted">{r.assignee === 'Non affecté' ? t('unassigned') : r.assignee}</td><td className="p-2 text-muted" dir="ltr">{num(r.lat, 2)} ; {num(r.lng, 2)}</td><td className="py-2 pe-4 ps-2 text-end font-extrabold">{r.score === null ? '—' : num(r.score)}</td></tr>)}
              {rows.length === 0 && <tr><td colSpan={8} className="p-5 font-semibold text-muted">{t('noPoint')}</td></tr>}</tbody></table></div>
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 py-2.5">
            <span className="text-[13px] font-semibold text-muted">{matched.length ? t('range', { a: num(start + 1), b: num(start + rows.length), n: num(matched.length) }) : t('noResult')}</span>
            <select aria-label={t('rowsPerPage')} value={per} onChange={(e) => { setPer(Number(e.target.value)); setPage(1); }} className="h-10 rounded-md border border-line bg-white px-1.5 text-[13px] font-semibold">{[5, 10, 50].map((n) => <option key={n} value={n}>{t('perPage', { n })}</option>)}</select>
            <span className="ms-auto flex items-center gap-1.5"><button type="button" aria-label={t('prev')} disabled={current <= 1} onClick={() => setPage(current - 1)} className="h-10 w-10 rounded-md border border-line bg-white font-bold text-night disabled:text-[#9aa8b4] rtl:rotate-180">‹</button><span className="text-[13px] font-bold">{t('page', { a: num(current), b: num(pages) })}</span><button type="button" aria-label={t('next')} disabled={current >= pages} onClick={() => setPage(current + 1)} className="h-10 w-10 rounded-md border border-line bg-white font-bold text-night disabled:text-[#9aa8b4] rtl:rotate-180">›</button></span>
          </div>
        </section>
      </div>
    </div>
  );
}
