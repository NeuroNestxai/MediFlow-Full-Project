import pg from 'pg';
import { migrate } from '../../src/db/migrate.js';

export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/qabnah_test');
  const dbName = url.pathname.slice(1);
  const admin = new URL(url.toString());
  admin.pathname = '/postgres';
  const c = new pg.Client({ connectionString: admin.toString() });
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await c.query(`CREATE DATABASE "${dbName}"`);
  await c.end();
  await migrate(url.toString(), () => {});
}
