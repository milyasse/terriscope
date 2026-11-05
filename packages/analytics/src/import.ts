import { toWgs84, type CrsCode } from './crs.ts';
import type { LngLat } from './geo.ts';

export type CellValue = string | number | null;
export interface ParsedTable { headers: string[]; rows: CellValue[][]; geometry?: (LngLat | null)[]; convertedGeometries?: number }
export type ImportErrorCode = 'empty' | 'tooManyRows' | 'invalidJson' | 'invalidGeoJson' | 'noFeature' | 'unsupportedFormat' | 'tooLarge' | 'unreadable';
export class ImportError extends Error {
  constructor(public code: ImportErrorCode) { super(code); this.name = 'ImportError'; }
}
export const MAX_ROWS = 50_000;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 10);
  const candidates = [';', ',', '\t', '|'];
  let best = ',', bestScore = 0;
  for (const d of candidates) {
    const counts = sample.map((l) => { let n = 0, q = false; for (const c of l) { if (c === '"') q = !q; else if (c === d && !q) n++; } return n; }).filter((n, i) => i < sample.length - 1 || n > 0);
    const first = counts[0] ?? 0;
    const score = first > 0 && counts.every((n) => n === first) ? first * 10 : first;
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

/** Lit un CSV : séparateur détecté, guillemets, retours à la ligne dans les champs, BOM. */
export function parseCsv(input: string): ParsedTable {
  const text = input.replace(/^﻿/, '');
  if (!text.trim()) throw new ImportError('empty');
  const delimiter = detectDelimiter(text);
  const records: string[][] = [];
  let field = '', record: string[] = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) { record.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      record.push(field); field = '';
      if (record.some((v) => v.trim() !== '')) records.push(record);
      record = [];
    } else field += c;
  }
  record.push(field);
  if (record.some((v) => v.trim() !== '')) records.push(record);
  return tableFromRows(records);
}

/** Construit une table à partir de lignes brutes, la première contenant les en-têtes. */
export function tableFromRows(raw: CellValue[][]): ParsedTable {
  const [head, ...body] = raw;
  if (!head || body.length === 0) throw new ImportError('empty');
  if (body.length > MAX_ROWS) throw new ImportError('tooManyRows');
  const seen = new Map<string, number>();
  const headers = head.map((h, i) => {
    const base = String(h ?? '').trim() || `Colonne ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base} (${n})` : base;
  });
  const rows = body.map((r) => headers.map((_, i) => { const v = r[i]; if (v === undefined || v === null) return null; if (typeof v === 'string') return v.trim() === '' ? null : v.trim(); return v; }));
  return { headers, rows };
}

function flatten(coords: unknown, out: LngLat[]) {
  if (Array.isArray(coords) && typeof coords[0] === 'number') { out.push([coords[0], coords[1] as number]); return; }
  if (Array.isArray(coords)) for (const c of coords) flatten(c, out);
}
/** Centre d'une géométrie GeoJSON : moyenne des sommets, suffisante pour rattacher un élément. */
export function geometryCenter(geometry: { type?: string; coordinates?: unknown; geometries?: { coordinates?: unknown }[] } | null | undefined): LngLat | null {
  if (!geometry) return null;
  const pts: LngLat[] = [];
  if (geometry.type === 'GeometryCollection') for (const g of geometry.geometries ?? []) flatten(g.coordinates, pts);
  else flatten(geometry.coordinates, pts);
  const usable = pts.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (!usable.length) return null;
  return [usable.reduce((s, p) => s + p[0], 0) / usable.length, usable.reduce((s, p) => s + p[1], 0) / usable.length];
}

interface GeoJsonLike { type?: string; features?: { geometry?: { type?: string; coordinates?: unknown } | null; properties?: Record<string, unknown> | null }[] }
/** Transforme un GeoJSON en table. Un élément non ponctuel est ramené à son centre et compté. */
export function tableFromGeoJson(input: string | GeoJsonLike): ParsedTable {
  let json: GeoJsonLike;
  if (typeof input === 'string') { try { json = JSON.parse(input.replace(/^﻿/, '')); } catch { throw new ImportError('invalidJson'); } } else json = input;
  if (json?.type !== 'FeatureCollection' || !Array.isArray(json.features)) throw new ImportError('invalidGeoJson');
  if (json.features.length === 0) throw new ImportError('noFeature');
  if (json.features.length > MAX_ROWS) throw new ImportError('tooManyRows');
  const headers: string[] = [];
  for (const f of json.features) for (const k of Object.keys(f.properties ?? {})) if (!headers.includes(k)) headers.push(k);
  if (!headers.length) headers.push('id');
  const cell = (v: unknown): CellValue => (v === null || v === undefined ? null : typeof v === 'number' ? v : typeof v === 'string' ? v : JSON.stringify(v));
  let converted = 0;
  const geometry = json.features.map((f) => { if (f.geometry && f.geometry.type !== 'Point') converted++; return geometryCenter(f.geometry); });
  return { headers, rows: json.features.map((f) => headers.map((h) => cell(f.properties?.[h]))), geometry, convertedGeometries: converted };
}

/** Lit un nombre écrit avec une virgule ou un point décimal, et des espaces de milliers. */
export function parseLooseNumber(v: CellValue | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = v.replace(/[\s  ]/g, '');
  if (/^[-+]?\d+(,\d+)?$/.test(s)) return Number(s.replace(',', '.'));
  if (/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return Number(s);
  return null;
}

export interface ColumnMapping { name: number | null; lat: number | null; lng: number | null; population: number | null; households: number | null }
const normalize = (h: string) => h.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const PATTERNS: Record<keyof ColumnMapping, RegExp> = {
  lat: /^(lat|latitude|y|coord_?y|y_?coord|coordonnee_?y|lat_?wgs84|northing|nord)$/,
  lng: /^(lon|lng|long|longitude|x|coord_?x|x_?coord|coordonnee_?x|lon_?wgs84|easting|est)$/,
  name: /^(nom|name|libelle|designation|enseigne|site|etablissement|intitule|commune)$/,
  population: /^(population|pop|habitants|nb_?hab(itants)?|pop_?totale)$/,
  households: /^(menages|nb_?menages|households)$/,
};
/** Propose les colonnes à partir des noms d'en-têtes ; l'utilisateur peut les corriger. */
export function detectColumns(table: ParsedTable): ColumnMapping {
  const names = table.headers.map(normalize);
  const find = (k: keyof ColumnMapping) => { const i = names.findIndex((n) => PATTERNS[k].test(n)); return i < 0 ? null : i; };
  return { name: find('name'), lat: find('lat'), lng: find('lng'), population: find('population'), households: find('households') };
}

export type DatasetKind = 'service' | 'competitor' | 'candidate' | 'population';
export interface ImportRecord { row: number; name: string; position: LngLat; population: number | null; households: number | null }
export type IssueCode = 'missingCoords' | 'invalidCoords' | 'outOfRange' | 'outsideMorocco' | 'duplicate' | 'missingPopulation';
export interface ImportIssue { row: number; code: IssueCode }
export interface ImportReport {
  records: ImportRecord[]; issues: ImportIssue[]; total: number; valid: number; counts: Record<IssueCode, number>;
  hint: 'none' | 'looksProjected' | 'looksSwapped' | 'noCoordinates';
}
const MOROCCO = { minLng: -18, maxLng: -0.9, minLat: 20.5, maxLat: 36.2 };
const inMorocco = (p: LngLat) => p[0] >= MOROCCO.minLng && p[0] <= MOROCCO.maxLng && p[1] >= MOROCCO.minLat && p[1] <= MOROCCO.maxLat;

/** Contrôle chaque ligne sans rien corriger en silence : tout rejet est compté et motivé. */
export function validateImport(table: ParsedTable, mapping: ColumnMapping, opts: { kind: DatasetKind; crs: CrsCode }): ImportReport {
  const issues: ImportIssue[] = [], records: ImportRecord[] = [];
  const counts: Record<IssueCode, number> = { missingCoords: 0, invalidCoords: 0, outOfRange: 0, outsideMorocco: 0, duplicate: 0, missingPopulation: 0 };
  const add = (row: number, code: IssueCode) => { issues.push({ row, code }); counts[code]++; };
  const seen = new Set<string>();
  const hasColumns = mapping.lat !== null && mapping.lng !== null;
  let large = 0, swappable = 0;
  table.rows.forEach((r, i) => {
    const row = i + 2;
    let position: LngLat | null = null;
    if (hasColumns) {
      const rawLat = r[mapping.lat as number], rawLng = r[mapping.lng as number];
      if (rawLat === null || rawLng === null || rawLat === undefined || rawLng === undefined) return add(row, 'missingCoords');
      const a = parseLooseNumber(rawLng), b = parseLooseNumber(rawLat);
      if (a === null || b === null) return add(row, 'invalidCoords');
      if (opts.crs === 'EPSG:4326' && (Math.abs(a) > 180 || Math.abs(b) > 90)) { if (Math.abs(a) > 1000 || Math.abs(b) > 1000) large++; return add(row, 'outOfRange'); }
      try { position = toWgs84(opts.crs, [a, b]); } catch { return add(row, 'invalidCoords'); }
      if (opts.crs === 'EPSG:4326' && !inMorocco(position) && inMorocco([b, a])) swappable++;
    } else {
      position = table.geometry?.[i] ?? null;
      if (!position) return add(row, 'missingCoords');
      if (Math.abs(position[0]) > 180 || Math.abs(position[1]) > 90) return add(row, 'outOfRange');
    }
    if (!Number.isFinite(position[0]) || !Number.isFinite(position[1]) || Math.abs(position[0]) > 180 || Math.abs(position[1]) > 90) return add(row, 'outOfRange');
    // Hors du marché couvert, un point fausserait les normalisations : il est écarté et signalé.
    if (!inMorocco(position)) return add(row, 'outsideMorocco');
    const name = mapping.name !== null && r[mapping.name] !== null ? String(r[mapping.name]) : `Ligne ${row}`;
    const population = mapping.population !== null ? parseLooseNumber(r[mapping.population]) : null;
    if (opts.kind === 'population' && (population === null || population < 0)) return add(row, 'missingPopulation');
    const key = `${name.toLowerCase()}|${position[0].toFixed(5)}|${position[1].toFixed(5)}`;
    if (seen.has(key)) return add(row, 'duplicate');
    seen.add(key);
    const households = mapping.households !== null ? parseLooseNumber(r[mapping.households]) : null;
    records.push({ row, name, position, population, households });
  });
  const total = table.rows.length;
  const hint: ImportReport['hint'] = !hasColumns && !table.geometry ? 'noCoordinates' : large > total / 2 ? 'looksProjected' : swappable > total / 2 ? 'looksSwapped' : 'none';
  return { records, issues, total, valid: records.length, counts, hint };
}
