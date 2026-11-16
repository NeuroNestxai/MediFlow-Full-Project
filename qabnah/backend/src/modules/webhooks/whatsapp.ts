import type { FastifyInstance } from 'fastify';
import { config } from '../../config.js';
import { pool, one, q } from '../../db/pool.js';
import { verifyMetaSignature } from '../../integrations/whatsapp.js';
import { safeEqual } from '../../lib/crypto.js';
import { AppError } from '../../lib/errors.js';

/** WhatsApp Cloud API webhooks (DECISIONS D-022). Requires the raw body for signature verification. */
export default async function whatsappWebhookRoutes(app: FastifyInstance) {
  app.get('/webhooks/whatsapp', async (req, reply) => {
    const qs = req.query as Record<string, string>;
    const token = config.WHATSAPP_VERIFY_TOKEN;
    if (qs['hub.mode'] === 'subscribe' && token && qs['hub.verify_token'] && safeEqual(qs['hub.verify_token'], token)) {
      reply.type('text/plain');
      return qs['hub.challenge'] ?? '';
    }
    throw new AppError(403, 'forbidden', 'Verification failed');
  });

  app.post('/webhooks/whatsapp', { config: { rawBody: true, rateLimit: { max: 600, timeWindow: '1 minute' } } }, async (req) => {
    const raw = (req as any).rawBody as Buffer | undefined;
    if (!raw || !verifyMetaSignature(raw, req.headers['x-hub-signature-256'] as string | undefined, config.WHATSAPP_APP_SECRET)) {
      throw new AppError(401, 'invalid_signature', 'Invalid signature');
    }
    const body: any = req.body ?? {};
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const v = change.value ?? {};
        const toNumber = v.metadata?.display_phone_number ? `+${String(v.metadata.display_phone_number).replace(/\D/g, '')}` : null;
        for (const m of v.messages ?? []) {
          const from = `+${String(m.from).replace(/\D/g, '')}`;
          const merchant = await one(pool, `SELECT id FROM merchants WHERE whatsapp_phone = $1`, [toNumber]);
          await q(pool, `INSERT INTO inbound_messages (from_address, to_address, body, provider_message_id, payload, merchant_id) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (provider_message_id) DO NOTHING`, [
            from, toNumber, m.text?.body ?? m.button?.text ?? `[${m.type}]`, m.id, JSON.stringify(m), merchant?.id ?? null,
          ]);
        }
        for (const s of v.statuses ?? []) {
          const status = ['sent', 'delivered', 'read', 'failed'].includes(s.status) ? s.status : null;
          if (status) await q(pool, `UPDATE outbound_messages SET status = $2, updated_at = now(), error = COALESCE($3, error) WHERE provider_message_id = $1`, [s.id, status, s.errors?.[0]?.title ?? null]);
        }
      }
    }
    return { received: true };
  });
}
