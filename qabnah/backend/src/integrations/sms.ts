import { config } from '../config.js';
import { pool, q } from '../db/pool.js';

export interface SmsProvider { name: string; send(to: string, body: string): Promise<{ id?: string }> }

class ConsoleSms implements SmsProvider {
  name = 'console';
  async send(to: string, body: string) {
    if (config.NODE_ENV !== 'test') console.log(`[sms:console] to=${to} body=${body}`);
    return {};
  }
}

/**
 * Generic HTTP SMS gateway adapter: POST {to, from, text} with Bearer token.
 * No Omani SMS provider is contracted yet (DECISIONS D-023) — adjust the payload to the chosen provider.
 */
class HttpSms implements SmsProvider {
  name = 'http';
  async send(to: string, body: string) {
    if (!config.SMS_HTTP_URL) throw new Error('SMS_HTTP_URL not configured');
    const res = await fetch(config.SMS_HTTP_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.SMS_HTTP_TOKEN ?? ''}` },
      body: JSON.stringify({ to, from: config.SMS_SENDER_ID, text: body }),
    });
    if (!res.ok) throw new Error(`SMS gateway error ${res.status}`);
    const j: any = await res.json().catch(() => ({}));
    return { id: j.id };
  }
}

export const sms: SmsProvider = config.SMS_PROVIDER === 'http' ? new HttpSms() : new ConsoleSms();

export async function sendSms(to: string, body: string, opts: { logBody?: boolean } = {}) {
  const r = await sms.send(to, body);
  await q(pool, `INSERT INTO outbound_messages (channel, provider, to_address, body, status, provider_message_id) VALUES ('sms',$1,$2,$3,'sent',$4)`, [
    sms.name,
    to,
    opts.logBody === false ? '[redacted]' : body,
    r.id ?? null,
  ]);
}
