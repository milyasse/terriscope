import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../db/migrations');

/** Applique dans l'ordre les migrations manquantes, chacune dans sa transaction. */
export async function migrate(databaseUrl: string): Promise<string[]> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const name of (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(name)) continue;
      await client.query('BEGIN');
      try {
        await client.query(await readFile(join(DIR, name), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        applied.push(name);
      } catch (e) { await client.query('ROLLBACK'); throw e; }
    }
    return applied;
  } finally { await client.end(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL manquante'); process.exit(1); }
  console.log('Migrations appliquées :', (await migrate(url)).join(', ') || 'aucune');
}
