import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MlMap, type Marker } from 'maplibre-gl';
import type { LngLat, Ring } from '@terriscope/analytics';
import { REGIONS } from '../lib/demo';
import { useI18n } from '../lib/i18n';

export interface Bubble { id: string; position: LngLat; text: string; color: string; size: number; title: string; region?: string; dark?: boolean }
export interface MapLabel { id: string; position: LngLat; text: string; region: string }
export interface Props {
  fills: Record<string, string>; fillOpacity?: number; selected?: string | null; onSelect?: (id: string) => void;
  bubbles?: Bubble[]; labels?: MapLabel[]; rings?: Ring[]; view?: 'north' | 'all' | 'casablanca'; center?: { center: LngLat; zoom: number } | null; onReady?: (map: MlMap) => void; label: string;
}
const OUTSIDE: Ring = [[-2.2,35.1],[-1.75,34.7],[-1.65,33.9],[-1.3,32.7],[-1.2,32.1],[-2.9,32.1],[-3.8,31.6],[-3.65,30.9],[-5.2,30],[-6.5,29.5],[-8.67,28.7],[-8.67,26],[-12,26],[-12,23.45],[-13.1,22.8],[-13,21.33],[-17.05,21.33],[-16.3,19],[-16.5,8],[30,8],[30,37.5],[-2.2,35.1]];
const SPAIN: Ring = [[-5.6,36.05],[-6.3,36.7],[-7.4,37.2],[-9,37],[-9.5,45],[10,45],[3,39],[-0.5,38],[-2.1,36.75],[-5.6,36.05]];
const BOUNDS: Record<string, [[number, number], [number, number]]> = { north: [[-10.6, 28.6], [-0.9, 36.2]], all: [[-17.8, 20.6], [-0.6, 36.2]], casablanca: [[-8.2, 33.1], [-7.1, 33.8]] };

const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features });
const colorExpr = (fills: Record<string, string>) => ['match', ['get', 'id'], ...REGIONS.flatMap((r) => [r.id, fills[r.id] ?? '#dce2e8']), '#dce2e8'] as unknown as maplibregl.ExpressionSpecification;

export function MapView({ fills, fillOpacity = 1, selected = null, onSelect, bubbles = [], labels = [], rings = [], view = 'north', center = null, onReady, label }: Props) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const select = useRef(onSelect); select.current = onSelect;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!box.current) return;
    let m: MlMap;
    try {
      m = new maplibregl.Map({
        container: box.current, attributionControl: false, canvasContextAttributes: { preserveDrawingBuffer: true }, bounds: BOUNDS[view], fitBoundsOptions: { padding: 12 }, dragRotate: false,
        style: { version: 8, sources: {
          outside: { type: 'geojson', data: fc([OUTSIDE, SPAIN].map((r) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [r] } }))) },
          regions: { type: 'geojson', data: fc(REGIONS.map((r) => ({ type: 'Feature', properties: { id: r.id }, geometry: { type: 'Polygon', coordinates: [r.ring] } }))) },
          rings: { type: 'geojson', data: fc([]) },
        }, layers: [
          { id: 'sea', type: 'background', paint: { 'background-color': '#d3e5ee' } },
          { id: 'outside', type: 'fill', source: 'outside', paint: { 'fill-color': '#eceff2' } },
          { id: 'region-fill', type: 'fill', source: 'regions', paint: { 'fill-color': colorExpr(fills), 'fill-opacity': fillOpacity } },
          { id: 'region-line', type: 'line', source: 'regions', paint: { 'line-color': '#ffffff', 'line-width': 1.2 } },
          { id: 'region-selected', type: 'line', source: 'regions', filter: ['==', ['get', 'id'], selected ?? ''], paint: { 'line-color': '#142d46', 'line-width': 3 } },
          { id: 'ring-fill', type: 'fill', source: 'rings', paint: { 'fill-color': '#142d46', 'fill-opacity': 0.1 } },
          { id: 'ring-line', type: 'line', source: 'rings', paint: { 'line-color': '#142d46', 'line-width': 1.5 } },
        ] },
      });
    } catch { setFailed(true); return; }
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    m.on('load', () => { setReady(true); onReady?.(m); });
    m.on('click', 'region-fill', (e) => { const id = e.features?.[0]?.properties?.id; if (typeof id === 'string') select.current?.(id); });
    m.on('mouseenter', 'region-fill', () => { m.getCanvas().style.cursor = 'pointer'; });
    m.on('mouseleave', 'region-fill', () => { m.getCanvas().style.cursor = ''; });
    map.current = m;
    return () => { m.remove(); map.current = null; setReady(false); };
    // La carte n'est créée qu'une fois ; les changements passent par les effets suivants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    m.setPaintProperty('region-fill', 'fill-color', colorExpr(fills));
    m.setPaintProperty('region-fill', 'fill-opacity', fillOpacity);
    m.setFilter('region-selected', ['==', ['get', 'id'], selected ?? '']);
  }, [fills, fillOpacity, selected, ready]);

  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    (m.getSource('rings') as GeoJSONSource).setData(fc(rings.map((r) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [r] } }))));
  }, [rings, ready]);

  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    if (center) m.easeTo({ center: center.center, zoom: center.zoom, duration: 0 });
    else m.fitBounds(BOUNDS[view] as [[number, number], [number, number]], { padding: 12, duration: 0 });
  }, [view, center, ready]);

  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    markers.current.forEach((x) => x.remove());
    const make = (el: HTMLElement, at: LngLat, region?: string) => {
      el.addEventListener('click', (e) => { e.stopPropagation(); if (region) select.current?.(region); });
      return new maplibregl.Marker({ element: el }).setLngLat(at).addTo(m);
    };
    markers.current = [
      ...bubbles.map((b) => { const el = document.createElement('button'); el.type = 'button'; el.className = 'map-bubble'; el.textContent = b.text; el.title = b.title; el.setAttribute('aria-label', b.title); el.style.width = el.style.height = `${b.size}px`; el.style.background = b.color; if (b.dark) el.style.color = '#142D46'; return make(el, b.position, b.region); }),
      ...labels.map((l) => { const el = document.createElement('button'); el.type = 'button'; el.className = 'map-label'; el.textContent = l.text; return make(el, l.position, l.region); }),
    ];
  }, [bubbles, labels, ready]);

  if (failed) return <div className="flex h-full items-center justify-center bg-mist p-6 text-center font-semibold">{t('mapUnavailable')}</div>;
  return <div ref={box} role="region" aria-label={label} className="h-full w-full" />;
}
export const coverageColor = (rate: number) => (rate >= 0.75 ? '#075B50' : rate >= 0.55 ? '#159B78' : rate > 0 ? '#A9DCC8' : '#F2A541');
export const potentialColor = (s: number) => (s >= 75 ? '#142D46' : s >= 60 ? '#3E6A8F' : s >= 40 ? '#93B3CB' : '#DCE7EF');
