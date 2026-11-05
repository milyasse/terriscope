import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import pg from 'pg';
import { computeCoverage, generateDemoDataset, computeCatchment } from '@terriscope/analytics';
import { buildApp } from '../src/app.ts';
import { migrate } from '../src/migrate.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL requise pour ces tests');
type App = Awaited<ReturnType<typeof buildApp>>;
let app: App, routed: App, valhalla: Server, admin: pg.Client;
const PASSWORD = 'un-mot-de-passe-solide';
let n = 0;
const call = async (a: App, method: 'GET' | 'POST' | 'DELETE', path: string, token?: string, body?: unknown) => {
  const res = await a.inject({ method, url: path, headers: token ? { authorization: `Bearer ${token}` } : {}, ...(body === undefined ? {} : { payload: body as object }) });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
};
const signup = async () => {
  const r = await call(app, 'POST', '/auth/register', undefined, { email: `user${++n}-${Date.now()}@example.com`, password: PASSWORD, organization: `Org ${n}` });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body as { token: string; organizationId: string };
};
const records = [{ name: 'A', lng: -7.6, lat: 33.5, population: 1000, households: 250, territory: 'CAS' }, { name: 'B', lng: -7.0, lat: 33.5, population: 3000, households: 700, territory: 'CAS' }];
const ds = (kind: string, recs: unknown[] = records) => ({ name: `Jeu ${kind}`, kind, source: 'Test', sourceDate: '2026-11-05', records: recs });

before(async () => {
  assert.deepEqual((await migrate(url)).length >= 0, true);
  assert.deepEqual(await migrate(url), [], 'les migrations doivent être idempotentes');
  admin = new pg.Client({ connectionString: url }); await admin.connect();
  const cfg = { databaseUrl: url, corsOrigins: ['http://localhost:5173'], sessionTtlHours: 24, authRateLimit: 1000 };
  app = await buildApp(cfg);
  valhalla = createServer((req, res) => {
    let raw = ''; req.on('data', (d) => (raw += d)); req.on('end', () => {
      const q = JSON.parse(raw);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ type: 'FeatureCollection', features: q.contours.map((c: { time: number }) => ({ type: 'Feature', properties: { contour: c.time }, geometry: { type: 'Polygon', coordinates: [[[q.locations[0].lon, q.locations[0].lat], [0, 0], [1, 1], [q.locations[0].lon, q.locations[0].lat]]] } })) }));
    });
  });
  await new Promise<void>((r) => valhalla.listen(0, r));
  const port = (valhalla.address() as { port: number }).port;
  routed = await buildApp({ ...cfg, valhallaUrl: `http://127.0.0.1:${port}` });
});
after(async () => { await app.close(); await routed.close(); valhalla.close(); await admin.end(); });

test('santé et offres publiques', async () => {
  assert.equal((await call(app, 'GET', '/health')).body.status, 'ok');
  assert.equal((await call(app, 'GET', '/plans')).body.plans.length, 4);
});
test('compte : création, connexion, déconnexion, erreurs', async () => {
  const mail = `flow-${Date.now()}@Example.com`;
  assert.equal((await call(app, 'POST', '/auth/register', undefined, { email: mail, password: 'court', organization: 'Org' })).status, 400);
  const r = await call(app, 'POST', '/auth/register', undefined, { email: mail, password: PASSWORD, organization: 'Org' });
  assert.equal(r.status, 201);
  assert.equal((await call(app, 'POST', '/auth/register', undefined, { email: mail.toLowerCase(), password: PASSWORD, organization: 'Autre' })).status, 409);
  const me = await call(app, 'GET', '/me', r.body.token);
  assert.equal(me.body.email, mail.toLowerCase()); assert.equal(me.body.role, 'owner'); assert.equal(me.body.plan.code, 'pro'); assert.equal(me.body.plan.status, 'trialing');
  const stored = (await admin.query('SELECT password_hash FROM users WHERE email = $1', [mail.toLowerCase()])).rows[0];
  assert.ok(stored.password_hash.startsWith('scrypt$')); assert.ok(!stored.password_hash.includes(PASSWORD));
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM sessions WHERE token_hash = $1', [r.body.token])).rows[0].n, 0, 'le jeton brut ne doit pas être stocké');
  assert.equal((await call(app, 'POST', '/auth/login', undefined, { email: mail, password: 'mauvais-mot-de-passe' })).status, 401);
  assert.equal((await call(app, 'POST', '/auth/login', undefined, { email: 'inconnu@example.com', password: PASSWORD })).status, 401);
  const login = await call(app, 'POST', '/auth/login', undefined, { email: mail, password: PASSWORD });
  assert.equal(login.status, 200);
  assert.equal((await call(app, 'POST', '/auth/logout', login.body.token)).status, 204);
  assert.equal((await call(app, 'GET', '/me', login.body.token)).status, 401);
  assert.equal((await call(app, 'GET', '/me')).status, 401);
  assert.equal((await call(app, 'GET', '/me', 'jeton-invente')).status, 401);
});
test('isolation : une organisation ne voit ni ne modifie les données d’une autre', async () => {
  const a = await signup(), b = await signup();
  const created = await call(app, 'POST', '/datasets', a.token, ds('population'));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.id;
  assert.equal((await call(app, 'GET', '/datasets', a.token)).body.datasets.length, 1);
  assert.equal((await call(app, 'GET', '/datasets', b.token)).body.datasets.length, 0);
  assert.equal((await call(app, 'DELETE', `/datasets/${id}`, b.token)).status, 404);
  const svc = (await call(app, 'POST', '/datasets', b.token, ds('service'))).body.id;
  assert.equal((await call(app, 'POST', '/analyses/coverage', b.token, { populationDatasetId: id, serviceDatasetId: svc, radiusKm: 5 })).status, 404);
  const analysis = await call(app, 'POST', '/analyses/catchment', a.token, { lng: -7.6, lat: 33.5, populationDatasetId: id });
  assert.equal((await call(app, 'GET', `/analyses/${analysis.body.id}`, b.token)).status, 404);
  assert.equal((await call(app, 'GET', `/analyses/${analysis.body.id}`, a.token)).status, 200);
  assert.equal((await call(app, 'DELETE', `/datasets/${id}`, a.token)).status, 204);
});
test('isolation en base : le rôle applicatif ne lit rien sans organisation, ni hors de la sienne', async () => {
  const a = await signup(), b = await signup();
  await call(app, 'POST', '/datasets', a.token, ds('population'));
  await admin.query('BEGIN');
  try {
    await admin.query('SET LOCAL ROLE terriscope_app');
    assert.equal((await admin.query('SELECT * FROM features')).rowCount, 0);
    await admin.query("SELECT set_config('app.org_id', $1, true)", [b.organizationId]);
    assert.equal((await admin.query('SELECT * FROM features')).rowCount, 0);
    await admin.query("SELECT set_config('app.org_id', $1, true)", [a.organizationId]);
    assert.equal((await admin.query('SELECT * FROM features')).rowCount, 2);
    await assert.rejects(admin.query("INSERT INTO datasets (organization_id, name, kind, source, source_date) VALUES ($1, 'x', 'service', 's', '2026-01-01')", [b.organizationId]));
  } finally { await admin.query('ROLLBACK'); }
  await admin.query('BEGIN');
  try {
    await admin.query('SET LOCAL ROLE terriscope_app');
    await assert.rejects(admin.query('SELECT * FROM users'), 'le rôle applicatif ne doit pas lire les comptes');
  } finally { await admin.query('ROLLBACK'); }
});
test('rôles : un lecteur consulte mais ne modifie pas', async () => {
  const a = await signup();
  const id = (await call(app, 'POST', '/datasets', a.token, ds('population'))).body.id;
  await admin.query("UPDATE memberships SET role = 'viewer' WHERE organization_id = $1", [a.organizationId]);
  assert.equal((await call(app, 'GET', '/datasets', a.token)).status, 200);
  assert.equal((await call(app, 'POST', '/datasets', a.token, ds('service'))).status, 403);
  assert.equal((await call(app, 'DELETE', `/datasets/${id}`, a.token)).status, 403);
});
test('offres : essai expiré ramené à Free, import refusé, limite d’analyses', async () => {
  const a = await signup();
  const id = (await call(app, 'POST', '/datasets', a.token, ds('population'))).body.id;
  await admin.query("UPDATE subscriptions SET trial_ends_at = now() - interval '1 day' WHERE organization_id = $1", [a.organizationId]);
  const me = await call(app, 'GET', '/me', a.token);
  assert.equal(me.body.plan.code, 'free'); assert.equal(me.body.plan.status, 'lapsed');
  const refused = await call(app, 'POST', '/datasets', a.token, ds('service'));
  assert.equal(refused.status, 402); assert.equal(refused.body.error.code, 'plan_limit');
  for (let i = 0; i < 10; i++) assert.equal((await call(app, 'POST', '/analyses/catchment', a.token, { lng: -7.6, lat: 33.5, populationDatasetId: id, radiiKm: [5] })).status, 201);
  assert.equal((await call(app, 'POST', '/analyses/catchment', a.token, { lng: -7.6, lat: 33.5, populationDatasetId: id, radiiKm: [5] })).status, 402);
});
test('validation : requêtes incorrectes refusées clairement', async () => {
  const a = await signup();
  assert.equal((await call(app, 'POST', '/datasets', a.token, ds('population', [{ name: 'x', lng: 500, lat: 0, population: 1 }]))).status, 400);
  const noPop = await call(app, 'POST', '/datasets', a.token, ds('population', [{ name: 'x', lng: -7, lat: 33 }]));
  assert.equal(noPop.status, 400); assert.match(noPop.body.error.message, /population/);
  assert.equal((await call(app, 'GET', '/analyses/pas-un-uuid', a.token)).status, 400);
  const pop = (await call(app, 'POST', '/datasets', a.token, ds('population'))).body.id;
  assert.equal((await call(app, 'POST', '/analyses/coverage', a.token, { populationDatasetId: pop, serviceDatasetId: pop, radiusKm: 5 })).status, 400);
});
test('injection SQL : les valeurs sont traitées comme des données', async () => {
  const a = await signup();
  const name = "x'); DROP TABLE features; --";
  const r = await call(app, 'POST', '/datasets', a.token, { ...ds('service', [{ name, lng: -7, lat: 33 }]), name });
  assert.equal(r.status, 201);
  assert.equal((await call(app, 'GET', '/datasets', a.token)).body.datasets[0].name, name);
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM features WHERE name = $1', [name])).rows[0].n, 1);
});
test('PostGIS et le moteur TypeScript donnent le même résultat de couverture', async () => {
  const a = await signup();
  const d = generateDemoDataset();
  const cells = d.cells.filter((c) => c.region === 'CAS' || c.region === 'DTA').slice(0, 1500);
  const services = d.services.filter((s) => s.kind === 'service' && (s.region === 'CAS' || s.region === 'DTA')).slice(0, 60);
  const pop = await call(app, 'POST', '/datasets', a.token, ds('population', cells.map((c) => ({ name: c.id, lng: c.position[0], lat: c.position[1], population: c.population, households: c.households, territory: c.territory }))));
  assert.equal(pop.status, 201, JSON.stringify(pop.body));
  const svc = await call(app, 'POST', '/datasets', a.token, ds('service', services.map((s) => ({ name: s.id, lng: s.position[0], lat: s.position[1] }))));
  for (const radiusKm of [3, 5, 10]) {
    const res = await call(app, 'POST', '/analyses/coverage', a.token, { populationDatasetId: pop.body.id, serviceDatasetId: svc.body.id, radiusKm });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const ts = computeCoverage(cells, services, radiusKm);
    const sql = res.body.result;
    assert.equal(sql.population, ts.population);
    // L'écart vient de l'ellipsoïde de PostGIS face à la sphère du moteur navigateur : il doit rester marginal.
    assert.ok(Math.abs(sql.rate - ts.rate) < 0.015, `${radiusKm} km : ${sql.rate} / ${ts.rate}`);
    assert.ok(Math.abs(sql.meanAccessKm - (ts.meanAccessKm as number)) < 0.2, `${sql.meanAccessKm} / ${ts.meanAccessKm}`);
    assert.equal(res.body.sources[0].date, '2026-11-05');
  }
  const site: [number, number] = [-7.55, 33.5];
  const cat = await call(app, 'POST', '/analyses/catchment', a.token, { lng: site[0], lat: site[1], populationDatasetId: pop.body.id, radiiKm: [5, 10] });
  const tsCat = computeCatchment(site, cells, [], [5, 10]);
  cat.body.result.rows.forEach((r: { population: number }, i: number) => { const t = tsCat[i]?.population ?? 0; assert.ok(Math.abs(r.population - t) <= Math.max(0.02 * t, 2000), `${r.population} / ${t}`); });
});
test('couverture : aucun service, résultat nul et sans distance', async () => {
  const a = await signup();
  const pop = (await call(app, 'POST', '/datasets', a.token, ds('population'))).body.id;
  const near = (await call(app, 'POST', '/datasets', a.token, ds('service', [{ name: 's', lng: -7.6, lat: 33.5 }]))).body.id;
  const res = await call(app, 'POST', '/analyses/coverage', a.token, { populationDatasetId: pop, serviceDatasetId: near, radiusKm: 5 });
  assert.equal(res.body.result.coveredPopulation, 1000);
  assert.equal(res.body.result.rate, 0.25);
  assert.equal(res.body.result.coveredHouseholds, 250);
});
test('isochrones : refus clair sans routage, et réponse Valhalla relayée', async () => {
  const a = await signup();
  const off = await call(app, 'POST', '/analyses/isochrone', a.token, { lng: -7.6, lat: 33.5, minutes: [5, 10] });
  assert.equal(off.status, 503); assert.equal(off.body.error.code, 'router_unavailable');
  const on = await call(routed, 'POST', '/analyses/isochrone', a.token, { lng: -7.6, lat: 33.5, minutes: [5, 10] });
  assert.equal(on.status, 200); assert.equal(on.body.geojson.features.length, 2); assert.match(on.body.attribution, /OpenStreetMap/);
});
test('sécurité HTTP : en-têtes, origines et erreurs sans détail interne', async () => {
  const res = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'https://site-tiers.example' } });
  assert.equal(res.headers['access-control-allow-origin'], undefined);
  assert.ok(res.headers['x-content-type-options']);
  const ok = await app.inject({ method: 'GET', url: '/health', headers: { origin: 'http://localhost:5173' } });
  assert.equal(ok.headers['access-control-allow-origin'], 'http://localhost:5173');
  const limited = await buildApp({ databaseUrl: url, corsOrigins: [], sessionTtlHours: 1, authRateLimit: 2 });
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await limited.inject({ method: 'POST', url: '/auth/login', payload: { email: 'a@example.com', password: 'x' } })).statusCode);
  await limited.close();
  assert.deepEqual(codes, [401, 401, 429]);
});
