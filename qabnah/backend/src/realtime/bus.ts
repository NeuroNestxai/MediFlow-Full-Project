import { q, type Queryable } from '../db/pool.js';

export const CHANNEL = 'qabnah_events';

/**
 * Publish a realtime event. Call inside the business transaction: the NOTIFY is only delivered
 * on commit, so clients never see events for rolled-back changes.
 */
export async function publish(db: Queryable, channels: string[], event: string, data: Record<string, unknown>) {
  const rows = await q<{ id: number }>(db, `INSERT INTO realtime_events (channels, event, data) VALUES ($1, $2, $3) RETURNING id`, [
    channels,
    event,
    JSON.stringify(data),
  ]);
  await q(db, `SELECT pg_notify($1, $2)`, [CHANNEL, String(rows[0].id)]);
}
