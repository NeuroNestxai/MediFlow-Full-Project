import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { pool, q } from './db/pool.js';
import { authenticate } from './lib/auth.js';
import { AppError } from './lib/errors.js';
import { zoneDto } from './modules/core/zones.js';
import adminRoutes from './modules/admin/routes.js';
import analyticsRoutes from './modules/analytics/routes.js';
import authRoutes from './modules/auth/routes.js';
import captainRoutes from './modules/captains/routes.js';
import catalogRoutes from './modules/catalog/routes.js';
import storefrontRoutes from './modules/catalog/storefront.js';
import fileRoutes from './modules/files/routes.js';
import financeRoutes from './modules/finance/routes.js';
import merchantRoutes from './modules/merchants/routes.js';
import orderRoutes from './modules/orders/routes.js';
import paymentRoutes from './modules/payments/routes.js';
import supportRoutes from './modules/support/routes.js';
import userRoutes from './modules/users/routes.js';
import whatsappWebhookRoutes from './modules/webhooks/whatsapp.js';
import invoiceRoutes from './modules/orders/invoice.js';
import privacyRoutes from './modules/users/privacy.js';
import realtimeRoutes from './realtime/hub.js';

export async function buildApp(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger === false ? false : {
      level: config.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.body.password', 'req.body.code', 'req.body.refreshToken'],
      serializers: {
        // Never log access tokens (the WebSocket passes one in the query string) or file signatures.
        req: (req: any) => ({ method: req.method, url: String(req.url).replace(/([?&](token|sig)=)[^&]+/g, '$1[redacted]'), remoteAddress: req.ip }),
      },
      ...(config.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
    },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  const routes: { method: string; url: string }[] = [];
  (app as any)[Symbol.for('qabnah.routes')] = routes;
  app.addHook('onRoute', (r) => { for (const m of [r.method].flat()) routes.push({ method: String(m), url: r.url }); });

  // Keep the raw JSON body (needed for webhook signature verification).
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body: Buffer, done) => {
    (req as any).rawBody = body;
    if (!body.length) return done(null, {});
    try { done(null, JSON.parse(body.toString('utf8'))); } catch { done(new AppError(400, 'bad_json', 'Malformed JSON body'), undefined); }
  });

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } });
  const origins = config.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  await app.register(cors, { origin: (origin, cb) => cb(null, !origin || origins.includes(origin) || origins.includes('*')), credentials: false });
  await app.register(rateLimit, { global: true, max: config.NODE_ENV === 'test' ? 100000 : 300, timeWindow: '1 minute', allowList: config.NODE_ENV === 'test' ? () => true : undefined });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  await app.register(websocket);

  app.decorateRequest('auth', null);
  app.addHook('onRequest', async (req) => {
    if (req.url.startsWith('/v1/realtime')) return; // websocket authenticates itself
    await authenticate(req);
  });

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof AppError) return reply.code(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    if (err.statusCode === 429) return reply.code(429).send({ error: { code: 'rate_limited', message: 'Too many requests' } });
    if (err.code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send({ error: { code: 'file_too_large', message: 'File is larger than 10 MB' } });
    if (err.code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') return reply.code(400).send({ error: { code: 'validation_error', message: 'Expected multipart/form-data' } });
    if (err.code === '23505') return reply.code(409).send({ error: { code: 'conflict', message: 'Duplicate value' } });
    if (err.code === '23503') return reply.code(400).send({ error: { code: 'validation_error', message: 'Referenced record does not exist' } });
    if (err.validation) return reply.code(400).send({ error: { code: 'validation_error', message: err.message } });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: { code: 'bad_request', message: err.message } });
    req.log.error(err);
    return reply.code(500).send({ error: { code: 'server_error', message: 'Something went wrong' } });
  });
  app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: { code: 'not_found', message: `Route ${req.method} ${req.url.split('?')[0]} not found` } }));

  await app.register(async (v1) => {
    v1.get('/health', async () => ({ status: 'ok' }));
    v1.get('/health/ready', async (req, reply) => {
      try { await q(pool, 'SELECT 1'); return { status: 'ready' }; } catch { reply.code(503); return { status: 'db_unavailable' }; }
    });
    v1.get('/zones', async () => ({
      items: (await q(pool, `SELECT id, code, name_en, name_ar, is_active, ST_AsGeoJSON(boundary)::json AS boundary FROM zones WHERE is_active ORDER BY name_en`)).map(zoneDto),
    }));
    for (const r of [authRoutes, userRoutes, fileRoutes, storefrontRoutes, merchantRoutes, catalogRoutes, orderRoutes, paymentRoutes, captainRoutes,
      financeRoutes, supportRoutes, analyticsRoutes, adminRoutes, whatsappWebhookRoutes, invoiceRoutes, privacyRoutes, realtimeRoutes]) await v1.register(r);
  }, { prefix: '/v1' });

  return app;
}
