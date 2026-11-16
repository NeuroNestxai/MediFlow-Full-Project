import { config } from '../config.js';
import { pool, q } from '../db/pool.js';

/** Push provider stub. FCM/APNs credentials are not configured in this repository. */
export async function sendPush(userId: string, title: string, body: string, data: Record<string, unknown>) {
  const tokens = await q(pool, `SELECT token, platform FROM device_tokens WHERE user_id = $1`, [userId]);
  if (!tokens.length) return;
  if (config.NODE_ENV === 'development') console.log(`[push:console] user=${userId} devices=${tokens.length} ${title}: ${body}`);
  void data;
}
