import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { hmacHex, safeEqual } from '../lib/crypto.js';

/** Local-disk storage for development. Swap for an S3-compatible implementation in production. */
export interface Storage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

export class LocalStorage implements Storage {
  constructor(private root = path.resolve(config.STORAGE_DIR)) {}
  private p(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root)) throw new Error('invalid key');
    return full;
  }
  async put(key: string, data: Buffer) {
    await fs.mkdir(path.dirname(this.p(key)), { recursive: true });
    await fs.writeFile(this.p(key), data);
  }
  get(key: string) { return fs.readFile(this.p(key)); }
  async remove(key: string) { await fs.rm(this.p(key), { force: true }); }
}

export const storage: Storage = new LocalStorage();

export function signFileUrl(fileId: string, ttlS = 300): string {
  const exp = Math.floor(Date.now() / 1000) + ttlS;
  const sig = hmacHex(config.FILE_SIGNING_SECRET, `${fileId}.${exp}`);
  return `${config.PUBLIC_API_URL}/v1/files/${fileId}?exp=${exp}&sig=${sig}`;
}

export function verifyFileSig(fileId: string, exp: string | undefined, sig: string | undefined): boolean {
  if (!exp || !sig) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  return safeEqual(hmacHex(config.FILE_SIGNING_SECRET, `${fileId}.${exp}`), sig);
}

export const publicFileUrl = (fileId: string) => `${config.PUBLIC_API_URL}/v1/files/${fileId}`;
