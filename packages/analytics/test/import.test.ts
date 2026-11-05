import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectColumns, fromWgs84, geometryCenter, ImportError, parseCsv, parseLooseNumber, tableFromGeoJson, tableFromRows, toWgs84, validateImport } from '../src/index.ts';

const FIXTURE = 'nom;latitude;longitude\nSite A;33,57;-7,59\nSite B;34,02;-6,84\nSite A;33,57;-7,59\nSite C;;-6\nSite D;abc;-5\nSite E;99;-5\nSite F;48,85;2,35\n';

test('CSV : point-virgule, virgule décimale, BOM, guillemets', () => {
  const t = parseCsv('﻿nom;val\n"Dupont; fils";"a ""b"""\n');
  assert.deepEqual(t.headers, ['nom', 'val']);
  assert.deepEqual(t.rows[0], ['Dupont; fils', 'a "b"']);
});
test('CSV : virgule comme séparateur et fin de ligne Windows', () => assert.deepEqual(parseCsv('a,b\r\n1,2\r\n').rows, [['1', '2']]));
test('CSV : fichier vide refusé', () => assert.throws(() => parseCsv('  \n'), (e: ImportError) => e.code === 'empty'));
test('CSV : en-têtes dupliqués rendus uniques', () => assert.deepEqual(tableFromRows([['a', 'a', ''], [1, 2, 3]]).headers, ['a', 'a (2)', 'Colonne 3']));
test('nombres souples', () => {
  assert.equal(parseLooseNumber('33,57'), 33.57); assert.equal(parseLooseNumber('-7.59'), -7.59); assert.equal(parseLooseNumber('1 200'), 1200); assert.equal(parseLooseNumber('abc'), null); assert.equal(parseLooseNumber(''), null); assert.equal(parseLooseNumber('1,2,3'), null);
});
test('détection des colonnes, avec accents et variantes', () => {
  const m = detectColumns(parseCsv('Libellé;LAT;Lng;Nb_habitants;Ménages\na;1;2;3;4\n'));
  assert.deepEqual(m, { name: 0, lat: 1, lng: 2, population: 3, households: 4 });
});
test('validation : chaque rejet est compté', () => {
  const t = parseCsv(FIXTURE);
  const r = validateImport(t, detectColumns(t), { kind: 'candidate', crs: 'EPSG:4326' });
  assert.equal(r.total, 7); assert.equal(r.valid, 3);
  assert.deepEqual(r.counts, { missingCoords: 1, invalidCoords: 1, outOfRange: 1, duplicate: 1, missingPopulation: 0 });
  assert.equal(r.outsideMorocco, 1);
  assert.equal(r.valid + r.issues.length, r.total);
  assert.deepEqual(r.records[0]?.position, [-7.59, 33.57]);
  assert.equal(r.issues.find((i) => i.code === 'duplicate')?.row, 4);
});
test('validation : population obligatoire pour un jeu de population', () => {
  const t = parseCsv('lat;lon;population\n33;-7;100\n34;-6;\n35;-5;-4\n');
  const r = validateImport(t, detectColumns(t), { kind: 'population', crs: 'EPSG:4326' });
  assert.equal(r.valid, 1); assert.equal(r.counts.missingPopulation, 2);
});
test('validation : coordonnées projetées et inversées signalées', () => {
  const p = parseCsv('x;y\n296000;322000\n300000;330000\n');
  assert.equal(validateImport(p, detectColumns(p), { kind: 'service', crs: 'EPSG:4326' }).hint, 'looksProjected');
  const s = parseCsv('lat;lon\n-7,6;33,5\n-8;31,6\n');
  assert.equal(validateImport(s, detectColumns(s), { kind: 'service', crs: 'EPSG:4326' }).hint, 'looksSwapped');
  const n = tableFromRows([['nom'], ['a']]);
  assert.equal(validateImport(n, detectColumns(n), { kind: 'service', crs: 'EPSG:4326' }).hint, 'noCoordinates');
});
test('GeoJSON : points, polygones ramenés au centre, erreurs explicites', () => {
  const t = tableFromGeoJson(JSON.stringify({ type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { nom: 'P', population: 5 }, geometry: { type: 'Point', coordinates: [-7, 33] } },
    { type: 'Feature', properties: { nom: 'Q' }, geometry: { type: 'Polygon', coordinates: [[[-6, 32], [-4, 32], [-4, 34], [-6, 34]]] } },
    { type: 'Feature', properties: { nom: 'R' }, geometry: null },
  ] }));
  assert.equal(t.convertedGeometries, 1);
  assert.deepEqual(t.geometry?.[1], [-5, 33]);
  const r = validateImport(t, detectColumns(t), { kind: 'service', crs: 'EPSG:4326' });
  assert.equal(r.valid, 2); assert.equal(r.counts.missingCoords, 1); assert.equal(r.records[0]?.name, 'P');
  assert.throws(() => tableFromGeoJson('{oops'), (e: ImportError) => e.code === 'invalidJson');
  assert.throws(() => tableFromGeoJson('{"type":"Point"}'), (e: ImportError) => e.code === 'invalidGeoJson');
  assert.throws(() => tableFromGeoJson('{"type":"FeatureCollection","features":[]}'), (e: ImportError) => e.code === 'noFeature');
  assert.equal(geometryCenter(null), null);
});
test('projection Merchich Nord : position cohérente avec les paramètres de la projection', () => {
  const [x, y] = fromWgs84('EPSG:26191', [-7.6, 33.5]);
  assert.ok(Math.abs(x - 295_600) < 1500, String(x));
  // 300 km à l'origine, 0,2° au nord, plus environ 2,2 km de courbure du cône à 2,2° du méridien central.
  assert.ok(Math.abs(y - 324_400) < 800, String(y));
  const back = toWgs84('EPSG:26191', [x, y]);
  assert.ok(Math.abs(back[0] + 7.6) < 1e-7 && Math.abs(back[1] - 33.5) < 1e-7);
});
test('projection Merchich Sud : position cohérente avec les paramètres de la projection', () => {
  const [x, y] = fromWgs84('EPSG:26192', [-9.6, 30.42]);
  assert.ok(Math.abs(x - 96_000) < 3000, String(x));
  // 300 km à l'origine, 0,72° au nord, plus environ 7,4 km de courbure du cône à 4,2° du méridien central.
  assert.ok(Math.abs(y - 387_200) < 800, String(y));
});
test('Web Mercator : point de référence', () => {
  const [lng, lat] = toWgs84('EPSG:3857', [-845_000, 3_962_000]);
  assert.ok(Math.abs(lng + 7.591) < 0.01 && Math.abs(lat - 33.47) < 0.05, `${lng} ${lat}`);
});
test('CSV projeté importé via Merchich arrive au Maroc', () => {
  const t = parseCsv('x;y\n295600;322500\n');
  const r = validateImport(t, detectColumns(t), { kind: 'service', crs: 'EPSG:26191' });
  assert.equal(r.valid, 1); assert.equal(r.outsideMorocco, 0);
  assert.ok(Math.abs((r.records[0]?.position[0] ?? 0) + 7.6) < 0.02);
});
