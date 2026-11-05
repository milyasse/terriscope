import { ImportError, MAX_FILE_BYTES, parseCsv, tableFromGeoJson, tableFromRows, type CellValue, type ParsedTable } from '@terriscope/analytics';

function cellValue(v: unknown): CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[]; error?: unknown };
    if ('result' in o) return cellValue(o.result);
    if (Array.isArray(o.richText)) return o.richText.map((x) => x.text).join('');
    if ('text' in o) return cellValue(o.text);
  }
  return null;
}

/** Lit un fichier local dans le navigateur, sans l'envoyer et sans en exécuter le contenu. */
export async function readTable(file: File): Promise<ParsedTable> {
  if (file.size > MAX_FILE_BYTES) throw new ImportError('tooLarge');
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  try {
    if (ext === 'csv' || ext === 'txt' || ext === 'tsv') return parseCsv(await file.text());
    if (ext === 'geojson' || ext === 'json') return tableFromGeoJson(await file.text());
    if (ext === 'xlsx') {
      const { default: ExcelJS } = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const sheet = wb.worksheets.find((s) => s.rowCount > 0);
      if (!sheet) throw new ImportError('empty');
      const rows: CellValue[][] = [];
      sheet.eachRow((row) => { const out: CellValue[] = []; row.eachCell({ includeEmpty: true }, (c, i) => { out[i - 1] = cellValue(c.value); }); rows.push(Array.from(out, (v) => v ?? null)); });
      return tableFromRows(rows);
    }
    if (ext === 'zip') {
      const { default: shp } = await import('shpjs');
      const res = await shp(await file.arrayBuffer());
      const fc = Array.isArray(res) ? res[0] : res;
      if (!fc) throw new ImportError('noFeature');
      return tableFromGeoJson(fc as Parameters<typeof tableFromGeoJson>[0]);
    }
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError('unreadable');
  }
  throw new ImportError('unsupportedFormat');
}
