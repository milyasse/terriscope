import proj4 from 'proj4';
import type { LngLat } from './geo.ts';

/**
 * Systèmes de coordonnées pris en charge à l'import. Les zones Sahara de Merchich
 * (EPSG:26194 et 26195) restent exclues tant que leurs paramètres n'ont pas été vérifiés.
 */
const CLARKE_IGN = '+a=6378249.2 +b=6356515 +towgs84=31,146,47,0,0,0,0 +units=m +no_defs';
export const CRS_DEFINITIONS = {
  'EPSG:4326': '+proj=longlat +datum=WGS84 +no_defs',
  'EPSG:3857': '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs',
  'EPSG:26191': `+proj=lcc +lat_1=33.3 +lat_0=33.3 +lon_0=-5.4 +k_0=0.999625769 +x_0=500000 +y_0=300000 ${CLARKE_IGN}`,
  'EPSG:26192': `+proj=lcc +lat_1=29.7 +lat_0=29.7 +lon_0=-5.4 +k_0=0.999615596 +x_0=500000 +y_0=300000 ${CLARKE_IGN}`,
} as const;
export type CrsCode = keyof typeof CRS_DEFINITIONS;
export const CRS_LABELS: Record<CrsCode, string> = {
  'EPSG:4326': 'WGS 84, latitude et longitude (EPSG:4326)',
  'EPSG:3857': 'Web Mercator (EPSG:3857)',
  'EPSG:26191': 'Merchich, Nord Maroc (EPSG:26191)',
  'EPSG:26192': 'Merchich, Sud Maroc (EPSG:26192)',
};

/** Convertit un couple X, Y du système indiqué vers longitude et latitude WGS 84. */
export function toWgs84(code: CrsCode, xy: [number, number]): LngLat {
  if (code === 'EPSG:4326') return xy;
  const [lng, lat] = proj4(CRS_DEFINITIONS[code], CRS_DEFINITIONS['EPSG:4326'], xy);
  return [lng as number, lat as number];
}
export function fromWgs84(code: CrsCode, lngLat: LngLat): [number, number] {
  if (code === 'EPSG:4326') return lngLat;
  const [x, y] = proj4(CRS_DEFINITIONS['EPSG:4326'], CRS_DEFINITIONS[code], lngLat);
  return [x as number, y as number];
}
