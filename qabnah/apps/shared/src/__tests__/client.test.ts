import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '../api/client';
import { createTokenStore } from '../auth/tokenStore';

const json = (status: number, body: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function setup(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const tokens = createTokenStore(`t-${Math.random()}`);
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init ?? {}));
  const onAuthLost = vi.fn();
  const api = new ApiClient({ baseUrl: 'http://api.test/v1', tokens, fetch: fetchMock as unknown as typeof fetch, onAuthLost });
  return { api, tokens, fetchMock, onAuthLost };
}

const fail = (p: Promise<unknown>) => p.then(() => { throw new Error('expected a failure'); }, (e: unknown) => e as ApiError);
const authOf = (init: RequestInit) => (init.headers as Record<string, string> | undefined)?.authorization;

describe('ApiClient', () => {
  beforeEach(() => localStorage.clear());

  it('sends the bearer token and JSON body, and builds query strings', async () => {
    const { api, tokens, fetchMock } = setup(() => json(200, { ok: true }));
    tokens.set({ accessToken: 'A1', refreshToken: 'R1' });
    await api.post('/things', { a: 1 }, { query: { limit: 20, q: '', status: 'active' }, idempotencyKey: 'k1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/v1/things?limit=20&status=active');
    expect(authOf(init!)).toBe('Bearer A1');
    expect((init!.headers as Record<string, string>)['idempotency-key']).toBe('k1');
    expect(init!.body).toBe('{"a":1}');
  });

  it('decodes the error envelope into ApiError with field errors', async () => {
    const { api } = setup(() => json(400, { error: { code: 'validation_error', message: 'Invalid request', details: [{ path: 'merchant.slug', message: 'lowercase letters' }] } }));
    const err = await fail(api.post('/merchants/register', {}));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.code).toBe('validation_error');
    expect(err.fieldErrors).toEqual({ 'merchant.slug': 'lowercase letters' });
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const { api, tokens, fetchMock } = setup((url, init) => {
      if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 'A2', refreshToken: 'R2', expiresIn: 900 });
      return authOf(init) === 'Bearer A2' ? json(200, { me: 1 }) : json(401, { error: { code: 'unauthorized', message: 'expired' } });
    });
    tokens.set({ accessToken: 'A1', refreshToken: 'R1' });
    await expect(api.get('/me')).resolves.toEqual({ me: 1 });
    expect(tokens.get()).toMatchObject({ accessToken: 'A2', refreshToken: 'R2' });
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual(['http://api.test/v1/me', 'http://api.test/v1/auth/refresh', 'http://api.test/v1/me']);
  });

  it('shares a single in-flight refresh between concurrent 401s', async () => {
    let refreshCalls = 0;
    const { api, tokens } = setup(async (url, init) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 20));
        return json(200, { accessToken: 'A2', refreshToken: 'R2', expiresIn: 900 });
      }
      return authOf(init) === 'Bearer A2' ? json(200, { url }) : json(401, { error: { code: 'unauthorized', message: 'expired' } });
    });
    tokens.set({ accessToken: 'A1', refreshToken: 'R1' });
    const results = await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);
    expect(refreshCalls).toBe(1);
    expect(results).toHaveLength(3);
  });

  it('clears the session and reports auth loss when the refresh token is rejected', async () => {
    const { api, tokens, onAuthLost } = setup((url) =>
      url.endsWith('/auth/refresh') ? json(401, { error: { code: 'invalid_refresh', message: 'revoked' } }) : json(401, { error: { code: 'unauthorized', message: 'expired' } }));
    tokens.set({ accessToken: 'A1', refreshToken: 'R1' });
    const err = await fail(api.get('/me'));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(tokens.get()).toBeNull();
    expect(onAuthLost).toHaveBeenCalledTimes(1);
  });

  it('does not try to refresh for anonymous calls', async () => {
    const { api, fetchMock } = setup(() => json(401, { error: { code: 'unauthorized', message: 'Email or password is incorrect' } }));
    const err = await fail(api.post('/auth/login', { email: 'x', password: 'y' }, { auth: false }));
    expect(err.message).toBe('Email or password is incorrect');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps network failures to a network_error ApiError', async () => {
    const tokens = createTokenStore('net');
    const api = new ApiClient({ baseUrl: 'http://api.test/v1', tokens, fetch: (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch });
    const err = await fail(api.get('/health'));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('network_error');
  });

  it('returns undefined for 204 responses', async () => {
    const { api } = setup(() => new Response(null, { status: 204 }));
    await expect(api.delete('/x')).resolves.toBeUndefined();
  });
});
