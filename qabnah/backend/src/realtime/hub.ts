import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import type { WebSocket } from 'ws';
import { config } from '../config.js';
import { pool, one, tx } from '../db/pool.js';
import { hasMerchantPerm, hasPerm, loadAuthContext, verifyAccessTokenClaims, type AuthContext } from '../lib/auth.js';
import { recordLocation } from '../modules/deliveries/service.js';
import { CHANNEL } from './bus.js';

interface Client { ws: WebSocket; auth: AuthContext; channels: Set<string>; lastLocationAt: number }

const subscribers = new Map<string, Set<Client>>();
let listener: pg.Client | null = null;

/** Resolve the client-facing channel name to the internal one and check authorization. */
export async function authorizeChannel(auth: AuthContext, channel: string): Promise<string | null> {
  if (channel === 'user:me') return `user:${auth.userId}`;
  if (channel === 'captain:me') return auth.captainId ? `captain:${auth.captainId}` : null;
  const [kind, id] = channel.split(':');
  if (kind === 'admin' && id === 'ops') return hasPerm(auth, 'deliveries:read') ? channel : null;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  if (kind === 'merchant') return hasMerchantPerm(auth, id, 'merchant.orders:read') ? channel : null;
  if (kind === 'captain') return auth.captainId === id ? channel : null;
  if (kind === 'order' || kind === 'delivery') {
    const row = await one(
      pool,
      kind === 'order'
        ? `SELECT o.customer_user_id, o.merchant_id, d.captain_id FROM orders o LEFT JOIN deliveries d ON d.order_id = o.id WHERE o.id = $1`
        : `SELECT o.customer_user_id, o.merchant_id, d.captain_id FROM deliveries d JOIN orders o ON o.id = d.order_id WHERE d.id = $1`,
      [id],
    );
    if (!row) return null;
    const ok =
      row.customer_user_id === auth.userId ||
      (row.captain_id && row.captain_id === auth.captainId) ||
      (row.merchant_id && hasMerchantPerm(auth, row.merchant_id, 'merchant.orders:read')) ||
      hasPerm(auth, 'orders:read') ||
      hasPerm(auth, 'deliveries:read');
    return ok ? channel : null;
  }
  return null;
}

function send(ws: WebSocket, msg: unknown) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function deliver(evt: { id: number; channels: string[]; event: string; data: unknown }) {
  const sent = new Set<Client>();
  for (const ch of evt.channels) {
    for (const c of subscribers.get(ch) ?? []) {
      if (sent.has(c)) continue;
      sent.add(c);
      // Report the channel name the client subscribed with (captain:me / user:me map back).
      const clientChannel = ch === `user:${c.auth.userId}` ? 'user:me' : ch === `captain:${c.auth.captainId}` && c.channels.has('captain:me') ? 'captain:me' : ch;
      send(c.ws, { type: 'event', channel: clientChannel, event: evt.event, data: evt.data, id: evt.id });
    }
  }
}

export async function startListener() {
  if (listener) return;
  listener = new pg.Client({ connectionString: config.DATABASE_URL });
  await listener.connect();
  await listener.query(`LISTEN ${CHANNEL}`);
  listener.on('notification', async (n) => {
    const id = Number(n.payload);
    if (!id) return;
    const evt = await one(pool, `SELECT id, channels, event, data FROM realtime_events WHERE id = $1`, [id]).catch(() => null);
    if (evt) deliver({ id: Number(evt.id), channels: evt.channels, event: evt.event, data: evt.data });
  });
  listener.on('error', (e) => console.error('realtime listener error', e));
}

export async function stopListener() {
  if (listener) await listener.end().catch(() => {});
  listener = null;
}

export default async function realtimeRoutes(app: FastifyInstance) {
  app.get('/realtime', { websocket: true }, async (socket: WebSocket, req) => {
    let client: Client | null = null;
    const authenticate = async (token: string) => {
      const { userId, mfa } = await verifyAccessTokenClaims(token);
      client = { ws: socket, auth: await loadAuthContext(userId, pool, mfa), channels: new Set(), lastLocationAt: 0 };
      send(socket, { type: 'ready', userId });
    };
    const token = (req.query as any)?.token;
    if (token) {
      try { await authenticate(token); } catch { send(socket, { type: 'error', code: 'unauthorized' }); socket.close(4401, 'unauthorized'); return; }
    }
    socket.on('message', async (raw) => {
      let msg: any;
      try { msg = JSON.parse(String(raw)); } catch { return send(socket, { type: 'error', code: 'bad_json' }); }
      try {
        if (msg.type === 'auth' && typeof msg.token === 'string') return await authenticate(msg.token);
        if (!client) return send(socket, { type: 'error', code: 'unauthorized' });
        const c: Client = client;
        switch (msg.type) {
          case 'ping':
            return send(socket, { type: 'pong' });
          case 'subscribe': {
            const internal = typeof msg.channel === 'string' ? await authorizeChannel(c.auth, msg.channel) : null;
            if (!internal) return send(socket, { type: 'error', code: 'forbidden', channel: msg.channel });
            c.channels.add(msg.channel);
            if (!subscribers.has(internal)) subscribers.set(internal, new Set());
            subscribers.get(internal)!.add(c);
            return send(socket, { type: 'subscribed', channel: msg.channel });
          }
          case 'unsubscribe': {
            const internal = msg.channel === 'user:me' ? `user:${c.auth.userId}` : msg.channel === 'captain:me' ? `captain:${c.auth.captainId}` : msg.channel;
            subscribers.get(internal)?.delete(c);
            c.channels.delete(msg.channel);
            return send(socket, { type: 'unsubscribed', channel: msg.channel });
          }
          case 'location': {
            if (!c.auth.captainId || c.auth.captainStatus !== 'active') return send(socket, { type: 'error', code: 'forbidden' });
            const lat = Number(msg.lat), lng = Number(msg.lng);
            if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return send(socket, { type: 'error', code: 'validation_error' });
            if (Date.now() - c.lastLocationAt < 3000) return; // throttle
            c.lastLocationAt = Date.now();
            await tx((cx) => recordLocation(cx, c.auth.captainId!, { lat, lng, heading: msg.heading, speed: msg.speed, accuracy: msg.accuracy }));
            return;
          }
          default:
            return send(socket, { type: 'error', code: 'unknown_type' });
        }
      } catch (e) {
        send(socket, { type: 'error', code: (e as any).code ?? 'server_error' });
      }
    });
    socket.on('close', () => {
      for (const set of subscribers.values()) if (client) set.delete(client);
    });
  });
}
