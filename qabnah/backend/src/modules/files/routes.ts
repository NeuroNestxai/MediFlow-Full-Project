import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { pool, one, q } from '../../db/pool.js';
import { publicFileUrl, signFileUrl, storage, verifyFileSig } from '../../integrations/storage.js';
import { hasPerm, requireAuth } from '../../lib/auth.js';
import { sha256 } from '../../lib/crypto.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { parse, zIdParam } from '../../lib/validate.js';

const PURPOSES = ['captain_document', 'merchant_document', 'product_image', 'branding', 'proof_of_delivery', 'support_attachment', 'other'] as const;
const PUBLIC_PURPOSES = new Set(['product_image', 'branding']);
const MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const fileUrl = (f: { id: string; visibility: string }) => (f.visibility === 'public' ? publicFileUrl(f.id) : signFileUrl(f.id));

export default async function fileRoutes(app: FastifyInstance) {
  app.post('/files', async (req, reply) => {
    const auth = requireAuth(req);
    const part = await req.file({ limits: { fileSize: MAX_FILE_BYTES } });
    if (!part) throw badRequest('Missing file');
    const purposeField: any = part.fields.purpose;
    const purpose = parse(z.enum(PURPOSES), purposeField?.value);
    const ext = MIME[part.mimetype];
    if (!ext) throw badRequest('Only JPEG, PNG, WebP images and PDF files are allowed');
    const buf = await part.toBuffer();
    if (part.file.truncated) throw badRequest('File is larger than 10 MB');
    // Magic-byte check so the declared type matches the content.
    const sig = buf.subarray(0, 4).toString('hex');
    const okMagic =
      (ext === 'jpg' && sig.startsWith('ffd8')) || (ext === 'png' && sig === '89504e47') || (ext === 'pdf' && sig === '25504446') ||
      (ext === 'webp' && buf.subarray(8, 12).toString() === 'WEBP');
    if (!okMagic) throw badRequest('File content does not match its type');
    const id = crypto.randomUUID();
    const key = `${purpose}/${id.slice(0, 2)}/${id}.${ext}`;
    await storage.put(key, buf);
    const visibility = PUBLIC_PURPOSES.has(purpose) ? 'public' : 'private';
    await q(pool, `INSERT INTO files (id, owner_user_id, purpose, visibility, storage_key, mime_type, size_bytes, sha256) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
      id, auth.userId, purpose, visibility, key, part.mimetype, buf.length, sha256(buf),
    ]);
    reply.code(201);
    return { id, url: fileUrl({ id, visibility }), mimeType: part.mimetype, sizeBytes: buf.length };
  });

  app.get('/files/:id', async (req, reply) => {
    const { id } = parse(zIdParam, req.params);
    const qs = req.query as { exp?: string; sig?: string };
    const f = await one(pool, `SELECT * FROM files WHERE id = $1`, [id]);
    if (!f) throw notFound('File');
    if (f.visibility !== 'public') {
      const allowed =
        verifyFileSig(id, qs.exp, qs.sig) ||
        (req.auth && (req.auth.userId === f.owner_user_id || hasPerm(req.auth, 'captains:review') || hasPerm(req.auth, 'merchants:review')));
      // Everyone else (e.g. ops viewing a proof-of-delivery photo) gets a short-lived signed URL from an endpoint that already checked their permission.
      if (!allowed) throw forbidden('This file is private');
    }
    const data = await storage.get(f.storage_key);
    reply.header('content-type', f.mime_type).header('cache-control', f.visibility === 'public' ? 'public, max-age=86400' : 'private, no-store');
    return reply.send(data);
  });
}
