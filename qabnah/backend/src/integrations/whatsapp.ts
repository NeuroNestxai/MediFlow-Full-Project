import { config } from '../config.js';
import { pool, q } from '../db/pool.js';
import { hmacHex, safeEqual } from '../lib/crypto.js';

/**
 * WhatsApp Business Platform (Cloud API) adapter.
 * Outbound business-initiated messages must use pre-approved templates (DECISIONS D-022).
 * The `console` provider logs instead of sending and is the default when not configured.
 * The template names below must be created and approved in WhatsApp Manager before use.
 */
export const WA_TEMPLATES = {
  'order.placed': 'qabnah_order_placed',
  'order.accepted': 'qabnah_order_accepted',
  'delivery.picked_up': 'qabnah_order_on_the_way',
  'delivery.delivered': 'qabnah_order_delivered',
  'payment_link': 'qabnah_payment_link',
  'test': 'hello_world',
} as const;

export interface WhatsAppMessage {
  to: string; // E.164
  template: string;
  language?: 'ar' | 'en' | 'en_US';
  params?: string[];
  merchantId?: string | null;
}

export async function sendWhatsAppTemplate(msg: WhatsAppMessage): Promise<{ id: string | null; status: string }> {
  const provider = config.WHATSAPP_PROVIDER;
  let providerId: string | null = null;
  let status = 'sent';
  let error: string | null = null;
  const payload = {
    messaging_product: 'whatsapp',
    to: msg.to.replace(/\D/g, ''),
    type: 'template',
    template: {
      name: msg.template,
      language: { code: msg.language ?? 'ar' },
      components: msg.params?.length ? [{ type: 'body', parameters: msg.params.map((text) => ({ type: 'text', text })) }] : undefined,
    },
  };
  if (provider === 'cloud') {
    try {
      if (!config.WHATSAPP_PHONE_NUMBER_ID || !config.WHATSAPP_ACCESS_TOKEN) throw new Error('WhatsApp Cloud API not configured');
      const res = await fetch(`https://graph.facebook.com/${config.WHATSAPP_GRAPH_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}` },
        body: JSON.stringify(payload),
      });
      const j: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message ?? `WhatsApp API error ${res.status}`);
      providerId = j?.messages?.[0]?.id ?? null;
    } catch (e) {
      status = 'failed';
      error = (e as Error).message;
    }
  } else if (config.NODE_ENV !== 'test') {
    console.log(`[whatsapp:console] to=${msg.to} template=${msg.template} params=${JSON.stringify(msg.params ?? [])}`);
  }
  await q(
    pool,
    `INSERT INTO outbound_messages (channel, provider, merchant_id, to_address, template, payload, status, provider_message_id, error)
     VALUES ('whatsapp',$1,$2,$3,$4,$5,$6,$7,$8)`,
    [provider, msg.merchantId ?? null, msg.to, msg.template, JSON.stringify(payload), status, providerId, error],
  );
  return { id: providerId, status };
}

/** Verify Meta's X-Hub-Signature-256 header: "sha256=" + HMAC-SHA256(rawBody, appSecret). */
export function verifyMetaSignature(rawBody: Buffer | string, header: string | undefined, appSecret: string | undefined): boolean {
  if (!appSecret || !header || !header.startsWith('sha256=')) return false;
  return safeEqual(header.slice(7), hmacHex(appSecret, rawBody));
}

export const waShareUrl = (text: string, phone?: string | null) =>
  `https://wa.me/${phone ? phone.replace(/\D/g, '') : ''}?text=${encodeURIComponent(text)}`;
