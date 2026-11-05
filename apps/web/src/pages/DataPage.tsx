import { useMemo, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { CRS_LABELS, detectColumns, ImportError, validateImport, type ColumnMapping, type CrsCode, type DatasetKind, type IssueCode, type ParsedTable } from '@terriscope/analytics';
import { Card, Note, Select } from '../components/Ui';
import { DEMO_DATE, dataset } from '../lib/demo';
import { useI18n, type TKey } from '../lib/i18n';
import { addDataset, removeDataset, useDatasets } from '../lib/imports';
import { readTable } from '../lib/readFile';

const ISSUES: IssueCode[] = ['missingCoords', 'invalidCoords', 'outOfRange', 'duplicate', 'missingPopulation'];
const KINDS: DatasetKind[] = ['service', 'competitor', 'candidate', 'population'];

function Importer() {
  const { t, num } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TKey | null>(null);
  const [done, setDone] = useState(false);
  const [file, setFile] = useState('');
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [kind, setKind] = useState<DatasetKind>('service');
  const [crs, setCrs] = useState<CrsCode>('EPSG:4326');
  const report = useMemo(() => (table && mapping ? validateImport(table, mapping, { kind, crs }) : null), [table, mapping, kind, crs]);
  const reset = () => { setTable(null); setMapping(null); setFile(''); if (input.current) input.current.value = ''; };
  const open = async (f: File | undefined) => {
    if (!f) return;
    setError(null); setDone(false); setBusy(true); reset();
    try {
      const parsed = await readTable(f);
      setTable(parsed); setMapping(detectColumns(parsed)); setFile(f.name); setCrs('EPSG:4326');
    } catch (e) {
      setError(`err${e instanceof ImportError ? e.code : 'unreadable'}` as TKey);
    } finally { setBusy(false); }
  };
  const columnOptions = table ? [{ value: '', label: t('impNone') }, ...table.headers.map((h, i) => ({ value: String(i), label: h }))] : [];
  const field = (key: keyof ColumnMapping, label: TKey) => <Select label={t(label)} value={mapping?.[key] === null || !mapping ? '' : String(mapping[key])} onChange={(v) => mapping && setMapping({ ...mapping, [key]: v === '' ? null : Number(v) })} options={columnOptions} />;
  const usesColumns = !table?.geometry;
  return <section className="flex flex-col gap-3">
    <h2 className="m-0 text-lg font-extrabold">{t('importTitle')}</h2>
    <Card className="flex flex-wrap items-center gap-3 border-dashed p-5" >
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-forest px-4 font-extrabold text-white focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-forest"><Upload size={16} aria-hidden="true" />{t('impChoose')}<input ref={input} type="file" aria-label={t('impFile')} accept=".csv,.txt,.tsv,.xlsx,.geojson,.json,.zip" className="sr-only" onChange={(e) => void open(e.target.files?.[0])} /></label>
      <p className="m-0 flex-1 text-[13px] font-semibold text-muted">{t('impFormats')}</p>
    </Card>
    {busy && <p role="status" className="m-0 font-semibold text-muted">{t('impReading')}</p>}
    {error && <p role="alert" className="m-0 rounded-lg border border-rust bg-[#fdefd6] p-3 font-bold">{t(error)}</p>}
    {done && <p role="status" className="m-0 rounded-lg bg-mint p-3 font-bold">{t('impAdded')}</p>}
    {table && mapping && report && <>
      <Card className="flex flex-col gap-3 p-4">
        <h3 className="m-0 text-base font-extrabold" dir="auto">{t('impFields')} · {file}</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Select label={t('impKind')} value={kind} onChange={(v) => setKind(v as DatasetKind)} options={KINDS.map((k) => ({ value: k, label: t(`kind${k}` as TKey) }))} />
          {usesColumns && <Select label={t('impCrs')} value={crs} onChange={(v) => setCrs(v as CrsCode)} options={(Object.keys(CRS_LABELS) as CrsCode[]).map((c) => ({ value: c, label: CRS_LABELS[c] }))} />}
          {field('name', 'impColName')}
          {usesColumns && field('lat', 'impColLat')}
          {usesColumns && field('lng', 'impColLng')}
          {field('population', 'impColPop')}
          {field('households', 'impColHh')}
        </div>
      </Card>
      <Card className="flex flex-col gap-3 p-4">
        <h3 className="m-0 text-base font-extrabold">{t('impReport')}</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-lg bg-mist p-3"><div className="text-xs font-semibold text-muted">{t('impTotal')}</div><div data-testid="count-total" className="text-xl font-extrabold">{num(report.total)}</div></div>
          <div className="rounded-lg bg-mint p-3"><div className="text-xs font-semibold text-muted">{t('impValid')}</div><div data-testid="count-valid" className="text-xl font-extrabold">{num(report.valid)}</div></div>
          {ISSUES.filter((c) => report.counts[c] > 0).map((c) => <div key={c} className="rounded-lg bg-[#fdefd6] p-3"><div className="text-xs font-semibold">{t(`issue${c}` as TKey)}</div><div data-testid={`count-${c}`} className="text-xl font-extrabold">{num(report.counts[c])}</div><div className="text-xs font-semibold">{t('impFirstRows', { r: report.issues.filter((i) => i.code === c).slice(0, 5).map((i) => i.row).join(', ') })}</div></div>)}
          {report.outsideMorocco > 0 && <div className="rounded-lg bg-[#fdefd6] p-3"><div className="text-xs font-semibold">{t('impOutside')}</div><div data-testid="count-outside" className="text-xl font-extrabold">{num(report.outsideMorocco)}</div></div>}
        </div>
        {report.hint !== 'none' && <p role="alert" className="m-0 rounded-lg border border-rust p-3 font-bold">{t(`hint${report.hint}` as TKey)}</p>}
        {(table.convertedGeometries ?? 0) > 0 && <Note>{t('impConverted', { n: num(table.convertedGeometries ?? 0) })}</Note>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={report.valid === 0} onClick={() => { addDataset({ fileName: file, kind, crs, records: report.records }); reset(); setDone(true); }} className="min-h-11 rounded-lg border-0 bg-forest px-4 font-extrabold text-white disabled:bg-[#9aa8b4]">{report.valid ? t('impAdd', { n: num(report.valid) }) : t('impNothing')}</button>
          <button type="button" onClick={reset} className="min-h-11 rounded-lg border border-line bg-white px-4 font-extrabold text-night">{t('impCancel')}</button>
        </div>
      </Card>
      <Card className="overflow-x-auto p-3">
        <h3 className="m-0 mb-2 px-2 text-base font-extrabold">{t('impPreview')} <span className="text-xs font-semibold text-muted">{t('impPreviewNote', { a: Math.min(8, table.rows.length), b: num(table.rows.length) })}</span></h3>
        <table className="w-full border-collapse text-[13px]"><thead><tr>{table.headers.map((h) => <th key={h} scope="col" className="whitespace-nowrap p-2 text-start text-xs font-bold text-muted">{h}</th>)}</tr></thead><tbody>{table.rows.slice(0, 8).map((r, i) => <tr key={i} className="border-t border-[#e6ebef]">{r.map((v, j) => <td key={j} className="whitespace-nowrap p-2">{v === null ? '—' : String(v)}</td>)}</tr>)}</tbody></table>
      </Card>
    </>}
  </section>;
}

export default function DataPage() {
  const { t, num } = useI18n();
  const imported = useDatasets();
  const th = 'p-3 text-start text-xs font-bold text-muted';
  return <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-5">
    <div><h1 className="m-0 text-2xl font-extrabold">{t('dataTitle')}</h1><p className="m-0 mt-1 font-semibold text-muted">{t('dataIntro')}</p></div>
    <Card className="overflow-x-auto"><table className="w-full min-w-[560px] border-collapse text-sm"><thead><tr className="bg-mist"><th className={th}>{t('datasetName')}</th><th className={th}>{t('source')}</th><th className={th}>{t('records')}</th><th className={th}>{t('updated')}</th></tr></thead><tbody><tr className="border-t border-[#e6ebef]"><td className="p-3 font-extrabold">{t('datasetDemo')}</td><td className="p-3">{t('sourceDemo')}</td><td className="p-3">{num(dataset.cells.length + dataset.services.length + dataset.candidates.length)}</td><td className="p-3" dir="ltr">{DEMO_DATE}</td></tr></tbody></table></Card>
    <Importer />
    <section className="flex flex-col gap-2"><h2 className="m-0 text-lg font-extrabold">{t('impDatasets')}</h2>
      {imported.length === 0 ? <p className="m-0 font-semibold text-muted">{t('impEmpty')}</p> : <Card className="divide-y divide-[#e6ebef]">{imported.map((d) => <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3"><span><strong className="font-extrabold" dir="auto">{d.fileName}</strong><span className="block text-[13px] font-semibold text-muted">{t(`kind${d.kind}` as TKey)} · {num(d.records.length)}</span></span><button type="button" onClick={() => removeDataset(d.id)} className="inline-flex min-h-10 items-center gap-1 rounded-md border border-line bg-white px-3 text-[13px] font-bold text-night"><X size={14} aria-hidden="true" />{t('impRemove')}</button></div>)}</Card>}
      <p className="m-0 text-[13px] font-semibold text-muted">{t('impSession')}</p>
    </section>
  </div>;
}
