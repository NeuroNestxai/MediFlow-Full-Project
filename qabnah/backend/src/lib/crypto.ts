import crypto from 'node:crypto';

export const sha256 = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex');
export const hmacHex = (secret: string, data: string | Buffer) => crypto.createHmac('sha256', secret).update(data).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const randomDigits = (n: number) => Array.from({ length: n }, () => crypto.randomInt(0, 10)).join('');
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const shortCode = (n = 8) => Array.from({ length: n }, () => ALPHABET[crypto.randomInt(0, ALPHABET.length)]).join('');
