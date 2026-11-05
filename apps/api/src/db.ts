import pg from 'pg';

pg.types.setTypeParser(pg.types.builtins.INT8, Number);
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export type Tx = pg.PoolClient;
export class Db {
  pool: pg.Pool;
  constructor(url: string) { this.pool = new pg.Pool({ connectionString: url, max: 10 }); }
  close() { return this.pool.end(); }
  private async tx<T>(setup: (c: Tx) => Promise<unknown>, fn: (c: Tx) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      await setup(c);
      const out = await fn(c);
      await c.query('COMMIT');
      return out;
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
  /** Transaction limitée à une organisation : la Row Level Security s'applique à chaque requête. */
  withOrg<T>(orgId: string, fn: (c: Tx) => Promise<T>) {
    return this.tx(async (c) => { await c.query('SET LOCAL ROLE terriscope_app'); await c.query("SELECT set_config('app.org_id', $1, true)", [orgId]); }, fn);
  }
  /** Transaction système, réservée aux comptes et aux sessions, avant qu'une organisation soit connue. */
  system<T>(fn: (c: Tx) => Promise<T>) { return this.tx(async () => undefined, fn); }
}
