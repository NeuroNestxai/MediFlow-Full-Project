import { z } from 'zod';
import { badRequest } from './errors.js';

export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    throw badRequest('Invalid request', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return r.data;
}

export const zLatLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export const zUuid = z.string().uuid();
export const zPaging = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export const zIdParam = z.object({ id: zUuid });
export const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');
