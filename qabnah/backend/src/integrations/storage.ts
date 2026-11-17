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

/**
 * S3-compatible object storage (AWS S3, MinIO, Cloudflare R2, regional providers). Bucket stays private:
 * files are always streamed through the API, which enforces ownership/role checks or signed URLs.
 */
export class S3Storage implements Storage {
  private client: import('@aws-sdk/client-s3').S3Client | null = null;
  constructor(private bucket = config.S3_BUCKET ?? '') {}
  private async c() {
    if (!this.client) {
      const { S3Client } = await import('@aws-sdk/client-s3');
      this.client = new S3Client({
        region: config.S3_REGION,
        endpoint: config.S3_ENDPOINT || undefined,
        forcePathStyle: config.S3_FORCE_PATH_STYLE,
        credentials: { accessKeyId: config.S3_ACCESS_KEY_ID ?? '', secretAccessKey: config.S3_SECRET_ACCESS_KEY ?? '' },
      });
    }
    return this.client;
  }
  async put(key: string, data: Buffer) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await (await this.c()).send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ServerSideEncryption: config.S3_ENDPOINT ? undefined : 'AES256' }));
  }
  async get(key: string) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const r = await (await this.c()).send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  async remove(key: string) {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await (await this.c()).send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export const storage: Storage = config.STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage();

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
