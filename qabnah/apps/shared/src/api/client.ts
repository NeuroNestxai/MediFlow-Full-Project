import type { FileRef, FilePurpose, Tokens } from './types';
import type { TokenStore } from '../auth/tokenStore';

/** A failed API call, decoded from the `{error:{code,message,details}}` envelope. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field errors from a zod validation failure: `{ "merchant.slug": "lowercase letters…" }`. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) {
      for (const d of this.details as { path?: unknown; message?: unknown }[]) {
        if (d && typeof d.path === 'string' && typeof d.message === 'string' && !(d.path in out)) out[d.path || '_'] = d.message;
      }
    }
    return out;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

export type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
  /** Send the bearer token (default true when a token is available). */
  auth?: boolean;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface ApiClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  fetch?: typeof fetch;
  /** Called once when the session cannot be refreshed (refresh token rejected). */
  onAuthLost?: () => void;
}

export function buildQuery(query?: Query): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function newIdempotencyKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Typed fetch wrapper. Adds the bearer token, decodes the error envelope into ApiError, and on a 401
 * refreshes the session once (single-flight: concurrent 401s share one /auth/refresh call) and retries.
 */
export class ApiClient {
  readonly baseUrl: string;
  readonly tokens: TokenStore;
  private readonly fetchImpl: typeof fetch;
  private readonly onAuthLost?: () => void;
  private refreshing: Promise<boolean> | null = null;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.tokens = opts.tokens;
    this.fetchImpl = opts.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
    this.onAuthLost = opts.onAuthLost;
  }

  url(path: string, query?: Query) {
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}${buildQuery(query)}`;
  }

  /** WebSocket URL for /realtime (ws:// or wss:// derived from the API base URL). */
  realtimeUrl(token: string) {
    const u = new URL(this.url('/realtime'), typeof window !== 'undefined' ? window.location.href : 'http://localhost');
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.searchParams.set('token', token);
    return u.toString();
  }

  get<T>(path: string, opts?: RequestOptions) { return this.request<T>('GET', path, opts); }
  post<T>(path: string, body?: unknown, opts?: RequestOptions) { return this.request<T>('POST', path, { ...opts, body }); }
  patch<T>(path: string, body?: unknown, opts?: RequestOptions) { return this.request<T>('PATCH', path, { ...opts, body }); }
  put<T>(path: string, body?: unknown, opts?: RequestOptions) { return this.request<T>('PUT', path, { ...opts, body }); }
  delete<T = void>(path: string, opts?: RequestOptions) { return this.request<T>('DELETE', path, opts); }

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const useAuth = opts.auth !== false;
    const hadToken = useAuth && !!this.tokens.get()?.accessToken;
    let res = await this.send(method, path, opts, useAuth);
    if (res.status === 401 && hadToken) {
      const ok = await this.refresh();
      if (ok) res = await this.send(method, path, opts, useAuth);
    }
    return this.decode<T>(res);
  }

  /** Upload a file (multipart) for a purpose; returns the stored file reference with its URL. */
  async upload(file: Blob, purpose: FilePurpose, filename = 'upload'): Promise<FileRef> {
    const make = () => {
      const fd = new FormData();
      fd.append('purpose', purpose); // fields before the file so the server sees them
      fd.append('file', file, (file as File).name ?? filename);
      return fd;
    };
    const sendOnce = () => this.fetchImpl(this.url('/files'), { method: 'POST', body: make(), headers: this.authHeader() });
    let res = await sendOnce();
    if (res.status === 401 && this.tokens.get()) {
      if (await this.refresh()) res = await sendOnce();
    }
    return this.decode<FileRef>(res);
  }

  /** Fetch a private file with the bearer token and return an object URL (caller revokes it). */
  async fileObjectUrl(urlOrPath: string): Promise<string> {
    const target = urlOrPath.startsWith('http') ? urlOrPath : this.url(urlOrPath);
    let res = await this.fetchImpl(target, { headers: this.authHeader() });
    if (res.status === 401 && this.tokens.get() && (await this.refresh())) res = await this.fetchImpl(target, { headers: this.authHeader() });
    if (!res.ok) await this.decode(res);
    return URL.createObjectURL(await res.blob());
  }

  /** Rotate the refresh token. Concurrent callers share one in-flight request. */
  refresh(): Promise<boolean> {
    if (this.refreshing) return this.refreshing;
    const current = this.tokens.get();
    if (!current?.refreshToken) return Promise.resolve(false);
    this.refreshing = (async () => {
      try {
        const res = await this.fetchImpl(this.url('/auth/refresh'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken: current.refreshToken }),
        });
        if (!res.ok) {
          // Another tab may have rotated the token meanwhile; only drop the session if nothing changed.
          if (this.tokens.get()?.refreshToken === current.refreshToken) {
            this.tokens.clear();
            this.onAuthLost?.();
          }
          return false;
        }
        const t = (await res.json()) as Tokens;
        this.tokens.set({ accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.expiresIn });
        return true;
      } catch {
        return false;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  async logout() {
    const t = this.tokens.get();
    this.tokens.clear();
    if (t?.refreshToken) {
      await this.fetchImpl(this.url('/auth/logout'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.accessToken}` },
        body: JSON.stringify({ refreshToken: t.refreshToken }),
      }).catch(() => undefined);
    }
  }

  private authHeader(): Record<string, string> {
    const t = this.tokens.get();
    return t?.accessToken ? { authorization: `Bearer ${t.accessToken}` } : {};
  }

  private send(method: string, path: string, opts: RequestOptions, useAuth: boolean) {
    const headers: Record<string, string> = { accept: 'application/json', ...(useAuth ? this.authHeader() : {}), ...opts.headers };
    let body: BodyInit | undefined;
    if (opts.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(opts.body);
    } else if (method !== 'GET' && method !== 'DELETE') {
      headers['content-type'] = 'application/json';
      body = '{}';
    }
    if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;
    return this.fetchImpl(this.url(path, opts.query), { method, headers, body, signal: opts.signal }).catch((e: unknown) => {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      throw new ApiError(0, 'network_error', 'Could not reach the server. Check your connection.');
    });
  }

  private async decode<T>(res: Response): Promise<T> {
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let json: unknown = undefined;
    if (text) {
      try { json = JSON.parse(text); } catch { json = undefined; }
    }
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error;
      throw new ApiError(res.status, err?.code ?? (res.status === 0 ? 'network_error' : `http_${res.status}`), err?.message ?? (res.statusText || 'Request failed'), err?.details);
    }
    return json as T;
  }
}
