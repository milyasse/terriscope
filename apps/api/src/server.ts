import { buildApp } from './app.ts';
import { migrate } from './migrate.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) { console.error('DATABASE_URL manquante'); process.exit(1); }
await migrate(databaseUrl);
const app = await buildApp({
  databaseUrl, logger: true,
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 168),
  valhallaUrl: process.env.VALHALLA_URL || undefined,
});
const shutdown = () => void app.close().then(() => process.exit(0));
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
