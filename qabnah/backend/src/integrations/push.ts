import crypto from 'node:crypto';
import http2 from 'node:http2';
import { config } from '../config.js';
import { pool, q } from '../db/pool.js';

/**
 * Push notifications.
 *  - Android → Firebase Cloud Messaging HTTP v1 (service-account OAuth2, RS256 JWT bearer grant)
 *  - iOS     → APNs directly (token-based auth, ES256 JWT, HTTP/2)
 * PUSH_PROVIDER=console (default) only logs. With PUSH_PROVIDER=live, a platform without credentials is skipped.
 * Not verified against live Google/Apple endpoints from this repository (no credentials) — see docs/INTEGRATIONS.md.
 */

export interface PushMessage { title: string; body: string; data: Record<string, string> }
export interface DeviceToken { token: string; platform: 'ios' | 'android' | 'web'; app: 'consumer' | 'captain' | 'merchant' | 'admin' }
export type SendResult = 'sent' | 'invalid_token' | 'failed' | 'skipped';

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** Flatten notification data to string values (both FCM and APNs custom keys accept strings). */
export function toPushData(type: string, data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = { type };
  for (const k of ['orderId', 'deliveryId', 'offerId', 'ticketId', 'number']) if (data[k] != null) out[k] = String(data[k]);
  return out;
}

// ─────────── FCM HTTP v1 ───────────
let fcmToken: { value: string; exp: number } | null = null;

export function fcmServiceAccount(): { client_email: string; private_key: string; project_id: string; token_uri?: string } | null {
  if (!config.FCM_SERVICE_ACCOUNT_JSON_B64) return null;
  return JSON.parse(Buffer.from(config.FCM_SERVICE_ACCOUNT_JSON_B64, 'base64').toString('utf8'));
}

export function fcmAssertion(sa: { client_email: string; private_key: string; token_uri?: string }, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), sa.private_key);
  return `${header}.${claims}.${b64url(sig)}`;
}

async function fcmAccessToken(sa: ReturnType<typeof fcmServiceAccount> & {}) {
  if (fcmToken && fcmToken.exp > Date.now() + 60_000) return fcmToken.value;
  const res = await fetch(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: fcmAssertion(sa) }),
  });
  const j: any = await res.json();
  if (!res.ok) throw new Error(`FCM auth failed: ${j.error_description ?? res.status}`);
  fcmToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return fcmToken.value;
}

export function fcmMessage(token: string, msg: PushMessage, app: string) {
  return {
    message: {
      token,
      notification: { title: msg.title, body: msg.body },
      data: msg.data,
      android: { priority: 'HIGH', notification: { channel_id: app === 'captain' && msg.data.type === 'offer.created' ? 'offers' : msg.data.type?.startsWith('support') ? 'support' : 'orders' } },
    },
  };
}

async function sendFcm(d: DeviceToken, msg: PushMessage): Promise<SendResult> {
  const sa = fcmServiceAccount();
  if (!sa) return 'skipped';
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${await fcmAccessToken(sa)}` },
    body: JSON.stringify(fcmMessage(d.token, msg, d.app)),
  });
  if (res.ok) return 'sent';
  const j: any = await res.json().catch(() => ({}));
  const code = j?.error?.details?.find((x: any) => x.errorCode)?.errorCode ?? j?.error?.status;
  return res.status === 404 || code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT' ? 'invalid_token' : 'failed';
}

// ─────────── APNs ───────────
let apnsJwt: { value: string; iat: number } | null = null;

export function apnsProviderToken(keyP8: string, keyId: string, teamId: string, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = b64url(JSON.stringify({ iss: teamId, iat: now }));
  const sig = crypto.sign('SHA256', Buffer.from(`${header}.${claims}`), { key: keyP8, dsaEncoding: 'ieee-p1363' });
  return `${header}.${claims}.${b64url(sig)}`;
}

export function apnsPayload(msg: PushMessage) {
  return { aps: { alert: { title: msg.title, body: msg.body }, sound: 'default', ...(msg.data.type === 'offer.created' ? { 'interruption-level': 'time-sensitive' } : {}) }, ...msg.data };
}

async function sendApns(d: DeviceToken, msg: PushMessage): Promise<SendResult> {
  if (!config.APNS_KEY_P8_B64 || !config.APNS_KEY_ID || !config.APNS_TEAM_ID) return 'skipped';
  const now = Math.floor(Date.now() / 1000);
  if (!apnsJwt || now - apnsJwt.iat > 50 * 60) {
    apnsJwt = { value: apnsProviderToken(Buffer.from(config.APNS_KEY_P8_B64, 'base64').toString('utf8'), config.APNS_KEY_ID, config.APNS_TEAM_ID, now), iat: now };
  }
  const host = config.APNS_PRODUCTION ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
  const topic = d.app === 'captain' ? config.APNS_BUNDLE_ID_CAPTAIN : config.APNS_BUNDLE_ID_CONSUMER;
  return new Promise<SendResult>((resolve) => {
    const client = http2.connect(host);
    client.on('error', () => resolve('failed'));
    const req = client.request({
      ':method': 'POST', ':path': `/3/device/${d.token}`, authorization: `bearer ${apnsJwt!.value}`,
      'apns-topic': topic, 'apns-push-type': 'alert', 'apns-priority': '10', 'content-type': 'application/json',
    });
    let status = 0;
    let body = '';
    req.on('response', (h) => { status = Number(h[':status']); });
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      client.close();
      if (status === 200) return resolve('sent');
      const reason = (() => { try { return JSON.parse(body).reason; } catch { return ''; } })();
      resolve(status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered' ? 'invalid_token' : 'failed');
    });
    req.on('error', () => { client.close(); resolve('failed'); });
    req.end(JSON.stringify(apnsPayload(msg)));
  });
}

export const transports = { fcm: sendFcm, apns: sendApns };

export async function sendPush(userId: string, title: string, body: string, data: Record<string, string>) {
  const tokens = await q<DeviceToken>(pool, `SELECT token, platform, app FROM device_tokens WHERE user_id = $1`, [userId]);
  if (!tokens.length) return [];
  const msg: PushMessage = { title, body, data };
  if (config.PUSH_PROVIDER === 'console') {
    if (config.NODE_ENV === 'development') console.log(`[push:console] user=${userId} devices=${tokens.length} ${title}: ${body}`);
    return tokens.map(() => 'skipped' as SendResult);
  }
  const results: SendResult[] = [];
  for (const t of tokens) {
    const r = t.platform === 'android' ? await transports.fcm(t, msg) : t.platform === 'ios' ? await transports.apns(t, msg) : 'skipped';
    if (r === 'invalid_token') await q(pool, `DELETE FROM device_tokens WHERE token = $1`, [t.token]);
    await q(pool, `INSERT INTO outbound_messages (channel, provider, to_address, template, payload, status) VALUES ('push',$1,$2,$3,$4,$5)`, [
      t.platform === 'android' ? 'fcm' : t.platform === 'ios' ? 'apns' : 'none', `${t.platform}:${t.token.slice(0, 12)}…`, data.type ?? null, JSON.stringify(data),
      r === 'sent' ? 'sent' : r === 'skipped' ? 'queued' : 'failed',
    ]);
    results.push(r);
  }
  return results;
}
