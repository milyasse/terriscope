export interface IsochroneRequest { lng: number; lat: number; minutes: number[]; profile: 'auto' | 'pedestrian' | 'bicycle' }
export class RouterUnavailable extends Error {}

/** Adaptateur vers un serveur Valhalla auto-hébergé, sur données OpenStreetMap. */
export async function fetchIsochrones(baseUrl: string | undefined, q: IsochroneRequest): Promise<unknown> {
  if (!baseUrl) throw new RouterUnavailable('not_configured');
  let res: Response;
  try {
    res = await fetch(new URL('/isochrone', baseUrl), {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ locations: [{ lat: q.lat, lon: q.lng }], costing: q.profile, contours: q.minutes.map((time) => ({ time })), polygons: true, denoise: 0.3, generalize: 50 }),
    });
  } catch { throw new RouterUnavailable('unreachable'); }
  if (!res.ok) throw new RouterUnavailable(`status_${res.status}`);
  const body = (await res.json()) as { type?: string; features?: unknown[] };
  if (body.type !== 'FeatureCollection' || !Array.isArray(body.features)) throw new RouterUnavailable('bad_response');
  return body;
}
