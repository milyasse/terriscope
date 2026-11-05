import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { aggregateCoverage, STANDARD_RADII_KM } from '@terriscope/analytics';
import { Db, type Tx } from './db.ts';
import { DUMMY_HASH, hashPassword, hashToken, newToken, verifyPassword } from './security.ts';
import { fetchIsochrones, RouterUnavailable } from './router.ts';

export interface Config { databaseUrl: string; corsOrigins: string[]; sessionTtlHours: number; valhallaUrl?: string; authRateLimit?: number; logger?: boolean }
type Role = 'owner' | 'analyst' | 'viewer';
interface Auth { userId: string; orgId: string; role: Role }
const METHOD_VERSION = 'postgis-geography-1';
const TRIAL_DAYS = 14;

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const fail = (status: number, code: string, message: string) => new ApiError(status, code, message);

const email = z.string().trim().toLowerCase().email().max(254);
const credentials = z.object({ email, password: z.string().min(1).max(200) });
const register = z.object({ email, password: z.string().min(10, 'Le mot de passe doit compter au moins 10 caractères.').max(200), organization: z.string().trim().min(2).max(120) });
const dataset = z.object({
  name: z.string().trim().min(1).max(200), kind: z.enum(['service', 'competitor', 'candidate', 'population']), source: z.string().trim().min(1).max(300),
  sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  records: z.array(z.object({ name: z.string().max(300), lng: z.number().min(-180).max(180), lat: z.number().min(-90).max(90), population: z.number().nonnegative().nullish(), households: z.number().nonnegative().nullish(), territory: z.string().max(120).nullish() })).min(1).max(50_000),
}).refine((d) => d.kind !== 'population' || d.records.every((r) => typeof r.population === 'number'), { message: 'Chaque ligne d’un jeu de population doit indiquer sa population.' });
const coverage = z.object({ populationDatasetId: z.string().uuid(), serviceDatasetId: z.string().uuid(), radiusKm: z.number().positive().max(200) });
const catchment = z.object({ lng: z.number().min(-180).max(180), lat: z.number().min(-90).max(90), populationDatasetId: z.string().uuid(), competitorDatasetId: z.string().uuid().optional(), radiiKm: z.array(z.number().positive().max(200)).min(1).max(10).default([...STANDARD_RADII_KM]) });
const isochrone = z.object({ lng: z.number().min(-180).max(180), lat: z.number().min(-90).max(90), minutes: z.array(z.number().int().min(1).max(120)).min(1).max(4), profile: z.enum(['auto', 'pedestrian', 'bicycle']).default('auto') });
const idParam = z.object({ id: z.string().uuid() });

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw fail(400, 'invalid_request', r.error.issues[0]?.message ?? 'Requête invalide.');
  return r.data;
}

export interface EffectivePlan { code: string; name: string; status: string; trialEndsAt: string | null; max_members: number | null; max_datasets: number | null; max_features: number | null; monthly_analyses: number | null; can_import: boolean; can_share: boolean }
/** Une période d'essai expirée retombe automatiquement sur l'offre Free. */
async function effectivePlan(c: Tx): Promise<EffectivePlan> {
  const { rows } = await c.query(`
    SELECT p.*, s.status, s.trial_ends_at,
      (s.status = 'canceled' OR (s.status = 'trialing' AND s.trial_ends_at <= now())) AS lapsed
    FROM subscriptions s JOIN plans p ON p.code = s.plan_code`);
  const s = rows[0];
  if (!s) throw fail(403, 'no_subscription', 'Aucun abonnement pour cette organisation.');
  if (s.lapsed) {
    const free = (await c.query("SELECT * FROM plans WHERE code = 'free'")).rows[0];
    return { ...free, status: 'lapsed', trialEndsAt: s.trial_ends_at };
  }
  return { ...s, trialEndsAt: s.trial_ends_at };
}
async function chargeAnalysis(c: Tx, auth: Auth) {
  const plan = await effectivePlan(c);
  if (plan.monthly_analyses !== null) {
    const { rows } = await c.query("SELECT count(*)::int AS n FROM usage_events WHERE kind = 'analysis' AND created_at >= date_trunc('month', now())");
    if (rows[0].n >= plan.monthly_analyses) throw fail(402, 'plan_limit', 'La limite mensuelle d’analyses de votre offre est atteinte.');
  }
  await c.query("INSERT INTO usage_events (organization_id, kind) VALUES ($1, 'analysis')", [auth.orgId]);
}
async function requireDataset(c: Tx, id: string, kinds: string[]) {
  const { rows } = await c.query('SELECT id, kind, name, source, source_date, is_demo FROM datasets WHERE id = $1', [id]);
  const d = rows[0];
  if (!d) throw fail(404, 'not_found', 'Jeu de données introuvable.');
  if (!kinds.includes(d.kind)) throw fail(400, 'invalid_request', `Ce jeu de données est de type ${d.kind}, attendu : ${kinds.join(' ou ')}.`);
  return d;
}

export async function buildApp(cfg: Config) {
  const db = new Db(cfg.databaseUrl);
  const app = Fastify({ logger: cfg.logger ?? false, bodyLimit: 25 * 1024 * 1024 });
  await app.register(helmet);
  await app.register(cors, { origin: cfg.corsOrigins, credentials: false, methods: ['GET', 'POST', 'DELETE'] });
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute' });
  app.addHook('onClose', () => db.close());

  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, req, reply) => {
    if (err instanceof ApiError) return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
    if (err.statusCode === 429) return reply.status(429).send({ error: { code: 'rate_limited', message: 'Trop de requêtes. Réessayez dans un instant.' } });
    if (err.statusCode && err.statusCode < 500) return reply.status(err.statusCode).send({ error: { code: 'invalid_request', message: 'Requête invalide.' } });
    req.log.error(err);
    return reply.status(500).send({ error: { code: 'internal', message: 'Une erreur interne est survenue.' } });
  });

  const authenticate = async (req: FastifyRequest): Promise<Auth> => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw fail(401, 'unauthenticated', 'Connexion requise.');
    const { rows } = await db.system((c) => c.query(`
      SELECT s.user_id, s.organization_id, m.role FROM sessions s
      JOIN memberships m ON m.user_id = s.user_id AND m.organization_id = s.organization_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`, [hashToken(token)]));
    const s = rows[0];
    if (!s) throw fail(401, 'unauthenticated', 'Session expirée ou invalide.');
    return { userId: s.user_id, orgId: s.organization_id, role: s.role };
  };
  const canWrite = (a: Auth) => { if (a.role === 'viewer') throw fail(403, 'forbidden', 'Votre rôle permet seulement la consultation.'); };
  const openSession = async (c: Tx, userId: string, orgId: string) => {
    const token = newToken();
    await c.query("INSERT INTO sessions (token_hash, user_id, organization_id, expires_at) VALUES ($1, $2, $3, now() + make_interval(hours => $4))", [hashToken(token), userId, orgId, cfg.sessionTtlHours]);
    return token;
  };
  const authLimit = { config: { rateLimit: { max: cfg.authRateLimit ?? 10, timeWindow: '1 minute' } } };

  app.get('/health', async () => {
    await db.system((c) => c.query('SELECT 1'));
    return { status: 'ok', router: cfg.valhallaUrl ? 'configured' : 'not_configured' };
  });
  app.get('/plans', async () => ({ plans: (await db.system((c) => c.query('SELECT * FROM plans ORDER BY max_datasets NULLS LAST'))).rows }));

  app.post('/auth/register', authLimit, async (req, reply) => {
    const body = parse(register, req.body);
    const passwordHash = await hashPassword(body.password);
    const out = await db.system(async (c) => {
      const exists = await c.query('SELECT 1 FROM users WHERE email = $1', [body.email]);
      if (exists.rowCount) throw fail(409, 'email_taken', 'Cette adresse e-mail est déjà utilisée.');
      const org = (await c.query('INSERT INTO organizations (name) VALUES ($1) RETURNING id', [body.organization])).rows[0];
      const user = (await c.query('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id', [body.email, passwordHash])).rows[0];
      await c.query("INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'owner')", [user.id, org.id]);
      await c.query("INSERT INTO subscriptions (organization_id, plan_code, status, trial_ends_at) VALUES ($1, 'pro', 'trialing', now() + make_interval(days => $2))", [org.id, TRIAL_DAYS]);
      return { token: await openSession(c, user.id, org.id), organizationId: org.id };
    });
    return reply.status(201).send(out);
  });
  app.post('/auth/login', authLimit, async (req) => {
    const body = parse(credentials, req.body);
    const user = (await db.system((c) => c.query(`
      SELECT u.id, u.password_hash, m.organization_id FROM users u
      LEFT JOIN memberships m ON m.user_id = u.id WHERE u.email = $1 ORDER BY m.created_at LIMIT 1`, [body.email]))).rows[0];
    const ok = await verifyPassword(body.password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok || !user.organization_id) throw fail(401, 'invalid_credentials', 'Adresse e-mail ou mot de passe incorrect.');
    return { token: await db.system((c) => openSession(c, user.id, user.organization_id)), organizationId: user.organization_id };
  });
  app.post('/auth/logout', async (req, reply) => {
    await authenticate(req);
    await db.system((c) => c.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken((req.headers.authorization ?? '').slice(7))]));
    return reply.status(204).send();
  });
  app.get('/me', async (req) => {
    const auth = await authenticate(req);
    const user = (await db.system((c) => c.query('SELECT email FROM users WHERE id = $1', [auth.userId]))).rows[0];
    const plan = await db.withOrg(auth.orgId, effectivePlan);
    return { email: user.email, organizationId: auth.orgId, role: auth.role, plan };
  });

  app.get('/datasets', async (req) => {
    const auth = await authenticate(req);
    return { datasets: (await db.withOrg(auth.orgId, (c) => c.query('SELECT id, name, kind, source, source_date, is_demo, feature_count, created_at FROM datasets ORDER BY created_at DESC'))).rows };
  });
  app.post('/datasets', async (req, reply) => {
    const auth = await authenticate(req);
    canWrite(auth);
    const body = parse(dataset, req.body);
    const id = await db.withOrg(auth.orgId, async (c) => {
      const plan = await effectivePlan(c);
      if (!plan.can_import) throw fail(402, 'plan_limit', 'L’import de données n’est pas inclus dans votre offre.');
      const u = (await c.query('SELECT count(*)::int AS datasets, coalesce(sum(feature_count), 0)::int AS features FROM datasets')).rows[0];
      if (plan.max_datasets !== null && u.datasets >= plan.max_datasets) throw fail(402, 'plan_limit', 'Le nombre maximal de jeux de données de votre offre est atteint.');
      if (plan.max_features !== null && u.features + body.records.length > plan.max_features) throw fail(402, 'plan_limit', 'Le nombre maximal d’éléments de votre offre serait dépassé.');
      const d = (await c.query('INSERT INTO datasets (organization_id, name, kind, source, source_date, feature_count) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [auth.orgId, body.name, body.kind, body.source, body.sourceDate, body.records.length])).rows[0];
      const r = body.records;
      await c.query(`
        INSERT INTO features (organization_id, dataset_id, name, population, households, territory, geom)
        SELECT $1, $2, name, population, households, territory, ST_SetSRID(ST_MakePoint(lng, lat), 4326)
        FROM unnest($3::text[], $4::float8[], $5::float8[], $6::text[], $7::float8[], $8::float8[]) AS t(name, population, households, territory, lng, lat)`,
      [auth.orgId, d.id, r.map((x) => x.name), r.map((x) => x.population ?? null), r.map((x) => x.households ?? null), r.map((x) => x.territory ?? null), r.map((x) => x.lng), r.map((x) => x.lat)]);
      await c.query("INSERT INTO usage_events (organization_id, kind) VALUES ($1, 'import')", [auth.orgId]);
      return d.id as string;
    });
    return reply.status(201).send({ id, featureCount: body.records.length });
  });
  app.delete('/datasets/:id', async (req, reply) => {
    const auth = await authenticate(req);
    canWrite(auth);
    const { id } = parse(idParam, req.params);
    const res = await db.withOrg(auth.orgId, (c) => c.query('DELETE FROM datasets WHERE id = $1', [id]));
    if (!res.rowCount) throw fail(404, 'not_found', 'Jeu de données introuvable.');
    return reply.status(204).send();
  });

  const saveAnalysis = async (c: Tx, auth: Auth, kind: string, parameters: unknown, datasetIds: string[], result: unknown) => (await c.query(
    'INSERT INTO analyses (organization_id, kind, parameters, method_version, dataset_ids, result, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at',
    [auth.orgId, kind, parameters, METHOD_VERSION, datasetIds, result, auth.userId])).rows[0];
  const reply201 = (reply: FastifyReply, payload: unknown) => reply.status(201).send(payload);

  app.post('/analyses/coverage', async (req, reply) => {
    const auth = await authenticate(req);
    canWrite(auth);
    const body = parse(coverage, req.body);
    const payload = await db.withOrg(auth.orgId, async (c) => {
      const pop = await requireDataset(c, body.populationDatasetId, ['population']);
      const svc = await requireDataset(c, body.serviceDatasetId, ['service', 'competitor']);
      await chargeAnalysis(c, auth);
      const { rows } = await c.query(`
        SELECT p.population, coalesce(p.households, 0) AS households, coalesce(p.territory, 'non_rattache') AS territory, n.km
        FROM features p LEFT JOIN LATERAL (
          SELECT ST_Distance(p.geom::geography, s.geom::geography) / 1000 AS km FROM features s
          WHERE s.dataset_id = $2 ORDER BY p.geom::geography <-> s.geom::geography LIMIT 1
        ) n ON true WHERE p.dataset_id = $1`, [pop.id, svc.id]);
      const result = aggregateCoverage(rows.map((r) => ({ cell: { population: r.population, households: r.households, territory: r.territory }, nearestKm: r.km === null ? null : Number(r.km) })), body.radiusKm);
      const saved = await saveAnalysis(c, auth, 'coverage', body, [pop.id, svc.id], result);
      return { id: saved.id, methodVersion: METHOD_VERSION, sources: [pop, svc].map((d) => ({ name: d.name, source: d.source, date: d.source_date, isDemo: d.is_demo })), result };
    });
    return reply201(reply, payload);
  });
  app.post('/analyses/catchment', async (req, reply) => {
    const auth = await authenticate(req);
    canWrite(auth);
    const body = parse(catchment, req.body);
    const payload = await db.withOrg(auth.orgId, async (c) => {
      const pop = await requireDataset(c, body.populationDatasetId, ['population']);
      const comp = body.competitorDatasetId ? await requireDataset(c, body.competitorDatasetId, ['competitor']) : null;
      await chargeAnalysis(c, auth);
      const site = 'ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography';
      const rows = [];
      for (const radiusKm of [...new Set(body.radiiKm)].sort((a, b) => a - b)) {
        const p = (await c.query(`SELECT coalesce(sum(population), 0) AS population, coalesce(sum(households), 0) AS households FROM features WHERE dataset_id = $1 AND ST_DWithin(geom::geography, ${site}, $4)`, [pop.id, body.lng, body.lat, radiusKm * 1000])).rows[0];
        const k = comp ? (await c.query(`SELECT count(*)::int AS n FROM features WHERE dataset_id = $1 AND ST_DWithin(geom::geography, ${site}, $4)`, [comp.id, body.lng, body.lat, radiusKm * 1000])).rows[0].n : null;
        rows.push({ radiusKm, population: Number(p.population), households: Number(p.households), competitors: k });
      }
      const saved = await saveAnalysis(c, auth, 'catchment', body, [pop.id, ...(comp ? [comp.id] : [])], { rows });
      return { id: saved.id, methodVersion: METHOD_VERSION, result: { rows } };
    });
    return reply201(reply, payload);
  });
  app.post('/analyses/isochrone', async (req) => {
    const auth = await authenticate(req);
    canWrite(auth);
    const body = parse(isochrone, req.body);
    try {
      const geojson = await fetchIsochrones(cfg.valhallaUrl, body);
      await db.withOrg(auth.orgId, (c) => chargeAnalysis(c, auth));
      return { source: 'valhalla-openstreetmap', attribution: '© OpenStreetMap contributors', geojson };
    } catch (e) {
      if (e instanceof RouterUnavailable) throw fail(503, 'router_unavailable', 'Le moteur de routage n’est pas disponible. Aucune zone n’a été calculée.');
      throw e;
    }
  });
  app.get('/analyses/:id', async (req) => {
    const auth = await authenticate(req);
    const { id } = parse(idParam, req.params);
    const a = (await db.withOrg(auth.orgId, (c) => c.query('SELECT id, kind, parameters, method_version, dataset_ids, result, created_at FROM analyses WHERE id = $1', [id]))).rows[0];
    if (!a) throw fail(404, 'not_found', 'Analyse introuvable.');
    return a;
  });
  return app;
}
