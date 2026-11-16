import pg from 'pg';
import { config } from '../config.js';

// int8 (bigint) → number for counts/sums; values stay well within 2^53 for this domain.
pg.types.setTypeParser(20, (v) => Number(v));
// numeric → number
pg.types.setTypeParser(1700, (v) => Number(v));
// date → plain YYYY-MM-DD string (avoid timezone shifts)
pg.types.setTypeParser(1082, (v) => v);

export type Queryable = pg.Pool | pg.PoolClient;

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 20 });

export async function q<T = any>(db: Queryable, text: string, params: unknown[] = []): Promise<T[]> {
  const res = await db.query(text, params as any[]);
  return res.rows as T[];
}

export async function one<T = any>(db: Queryable, text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(db, text, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>, db: pg.Pool = pool): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Run fn inside the given client if it is already a transaction client, else open one. */
export async function inTx<T>(db: Queryable, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  if (db instanceof pg.Pool) return tx(fn, db);
  return fn(db as pg.PoolClient);
}
