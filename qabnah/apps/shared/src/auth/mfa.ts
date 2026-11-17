import type { ApiClient } from '../api/client';
import type { AuthResult, Tokens } from '../api/types';

/** What /auth/login returns: tokens, or a challenge for accounts with TOTP enabled. */
export interface MfaChallenge { mfaRequired: true; mfaToken: string }
export type LoginResponse = (AuthResult & { mfaEnrollmentRequired?: boolean }) | MfaChallenge;

export type LoginOutcome =
  | { kind: 'signedIn'; result: AuthResult & { mfaEnrollmentRequired?: boolean } }
  | { kind: 'mfa'; mfaToken: string };

export const isMfaChallenge = (r: LoginResponse): r is MfaChallenge => (r as MfaChallenge).mfaRequired === true && typeof (r as MfaChallenge).mfaToken === 'string';

/** Normalise an authenticator code ("123 456" → "123456"); null if it is not 6 digits. */
export function normalizeTotp(input: string): string | null {
  const d = (input ?? '').replace(/[\s-]/g, '').replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
  return /^\d{6}$/.test(d) ? d : null;
}

/** Recovery codes look like ABCDE-12345; accept any spacing/case. */
export function normalizeRecoveryCode(input: string): string | null {
  const d = (input ?? '').replace(/[\s-]/g, '').toUpperCase();
  return /^[A-Z0-9]{8,16}$/.test(d) ? d : null;
}

function save(api: ApiClient, t: Tokens) {
  api.tokens.set({ accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.expiresIn });
}

/** Step 1: e-mail + password. Stores tokens only when no second factor is needed. */
export async function passwordLogin(api: ApiClient, email: string, password: string): Promise<LoginOutcome> {
  const r = await api.post<LoginResponse>('/auth/login', { email: email.trim(), password }, { auth: false });
  if (isMfaChallenge(r)) return { kind: 'mfa', mfaToken: r.mfaToken };
  save(api, r);
  return { kind: 'signedIn', result: r };
}

/** Step 2: authenticator code or recovery code. */
export async function verifyMfa(api: ApiClient, mfaToken: string, secret: { code: string } | { recoveryCode: string }) {
  const r = await api.post<AuthResult>('/auth/mfa/verify', { mfaToken, ...secret }, { auth: false });
  save(api, r);
  return r;
}

export const setupMfa = (api: ApiClient) => api.post<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup');

/** Confirms enrolment; the server returns fresh tokens carrying the MFA claim (other sessions are revoked). */
export async function enableMfa(api: ApiClient, code: string) {
  const r = await api.post<Tokens & { recoveryCodes: string[] }>('/auth/mfa/enable', { code });
  save(api, r);
  return r.recoveryCodes;
}

export const disableMfa = (api: ApiClient, code: string) => api.post<{ mfaEnabled: false }>('/auth/mfa/disable', { code });

/** Group a base32 secret for manual entry: "JBSW Y3DP EHPK 3PXP". */
export const formatSecret = (s: string) => s.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();

/** API error codes that mean "this admin session needs a second factor". */
export const MFA_GATE_CODES = ['mfa_enrollment_required', 'mfa_required'] as const;
export type MfaGateCode = (typeof MFA_GATE_CODES)[number];
export function mfaGateCode(e: unknown): MfaGateCode | null {
  const err = e as { status?: number; code?: string } | null;
  if (err && err.status === 403 && (MFA_GATE_CODES as readonly string[]).includes(err.code ?? '')) return err.code as MfaGateCode;
  return null;
}
