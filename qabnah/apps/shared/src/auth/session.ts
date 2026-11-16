import { useSyncExternalStore } from 'react';
import type { ApiClient } from '../api/client';
import type { AuthResult, Me } from '../api/types';
import type { StoredTokens, TokenStore } from './tokenStore';

/** React binding to a token store. */
export function useTokens(store: TokenStore): StoredTokens | null {
  return useSyncExternalStore(
    (cb) => store.subscribe(() => cb()),
    () => store.get()?.accessToken ?? null,
    () => null,
  ) ? store.get() : null;
}

function save(api: ApiClient, r: AuthResult) {
  api.tokens.set({ accessToken: r.accessToken, refreshToken: r.refreshToken, expiresIn: r.expiresIn });
  return r;
}

export async function loginWithPassword(api: ApiClient, email: string, password: string) {
  return save(api, await api.post<AuthResult>('/auth/login', { email: email.trim(), password }, { auth: false }));
}

export async function requestOtp(api: ApiClient, phone: string) {
  return api.post<{ sent: boolean; expiresInSeconds: number; devCode?: string }>('/auth/otp/request', { phone }, { auth: false });
}

export async function verifyOtp(api: ApiClient, phone: string, code: string, fullName?: string) {
  return save(api, await api.post<AuthResult>('/auth/otp/verify', { phone, code, ...(fullName ? { fullName } : {}) }, { auth: false }));
}

export function fetchMe(api: ApiClient) {
  return api.get<Me>('/me');
}

/** Permission helpers for the merchant scope and the platform scope. */
export function hasAny(perms: readonly string[] | undefined, ...wanted: string[]) {
  return !!perms && wanted.some((p) => perms.includes(p));
}
