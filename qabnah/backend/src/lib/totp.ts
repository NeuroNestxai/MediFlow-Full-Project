import crypto from 'node:crypto';

/** RFC 4648 base32 (no padding) — the format authenticator apps expect. */
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += ALPHA[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHA[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const i = ALPHA.indexOf(c);
    if (i < 0) throw new Error('invalid base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** HOTP (RFC 4226) with HMAC-SHA1, 6 digits. */
export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', secret).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 10 ** digits).padStart(digits, '0');
}

export const TOTP_STEP_S = 30;
export const timeStep = (now = Date.now()) => Math.floor(now / 1000 / TOTP_STEP_S);

/**
 * Verify a TOTP code allowing ±1 step clock drift. Returns the matched step (for replay protection) or null.
 * Steps <= lastUsedStep are rejected so a code can't be reused.
 */
export function verifyTotp(secretB32: string, code: string, opts: { now?: number; lastUsedStep?: number | null; window?: number } = {}): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretB32);
  const step = timeStep(opts.now);
  const w = opts.window ?? 1;
  for (let d = -w; d <= w; d++) {
    const s = step + d;
    if (opts.lastUsedStep != null && s <= opts.lastUsedStep) continue;
    const expected = hotp(secret, s);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return s;
  }
  return null;
}

export const newTotpSecret = () => base32Encode(crypto.randomBytes(20));

export function otpauthUrl(secretB32: string, account: string, issuer = 'Qabnah') {
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${TOTP_STEP_S}`;
}

/** AES-256-GCM with a key derived from the configured secret; output: base64(iv | tag | ciphertext). */
export function encryptSecret(plain: string, keyMaterial: string): string {
  const key = crypto.createHash('sha256').update(keyMaterial).digest();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}

export function decryptSecret(blob: string, keyMaterial: string): string {
  const raw = Buffer.from(blob, 'base64');
  const key = crypto.createHash('sha256').update(keyMaterial).digest();
  const d = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}
