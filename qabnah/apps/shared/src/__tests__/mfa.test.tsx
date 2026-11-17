import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiClient } from '../api/client';
import { createTokenStore } from '../auth/tokenStore';
import { formatSecret, mfaGateCode, normalizeRecoveryCode, normalizeTotp, passwordLogin } from '../auth/mfa';
import { MfaChallengeForm, MfaEnrollment } from '../ui/mfa';
import { I18nProvider } from '../i18n/i18n';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const tokens = { accessToken: 'ACCESS', refreshToken: 'REFRESH', expiresIn: 900 };
const user = { id: 'u1', phone: null, email: 'ops@qabnah.test', fullName: 'Ops', locale: 'en', status: 'active', mfaEnabled: true };

function makeApi(handler: (path: string, body: Record<string, unknown>) => Response) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const store = createTokenStore(`mfa-${Math.random()}`);
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://api.test/v1', '');
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ path, body });
    return handler(path, body);
  });
  const api = new ApiClient({ baseUrl: 'http://api.test/v1', tokens: store, fetch: fetchMock as unknown as typeof fetch });
  return { api, calls, store };
}

const wrap = (ui: React.ReactNode) => {
  localStorage.setItem('mfa.test.lang', JSON.stringify('en'));
  return render(<I18nProvider dictionaries={{ ar: {}, en: {} }} defaultLang="en" storageKey="mfa.test.lang">{ui}</I18nProvider>);
};

describe('MFA flow logic', () => {
  it('passwordLogin returns a challenge without storing tokens when TOTP is enabled', async () => {
    const { api, store } = makeApi(() => json(200, { mfaRequired: true, mfaToken: 'CHALLENGE' }));
    await expect(passwordLogin(api, 'ops@qabnah.test', 'pw')).resolves.toEqual({ kind: 'mfa', mfaToken: 'CHALLENGE' });
    expect(store.get()).toBeNull();
  });
  it('passwordLogin stores tokens and passes mfaEnrollmentRequired through', async () => {
    const { api, store } = makeApi(() => json(200, { ...tokens, user, isNewUser: false, mfaEnrollmentRequired: true }));
    const r = await passwordLogin(api, 'ops@qabnah.test', 'pw');
    expect(r.kind).toBe('signedIn');
    expect(r.kind === 'signedIn' && r.result.mfaEnrollmentRequired).toBe(true);
    expect(store.get()?.accessToken).toBe('ACCESS');
  });
  it('normalises codes and detects MFA gate errors', () => {
    expect(normalizeTotp('123 456')).toBe('123456');
    expect(normalizeTotp('١٢٣٤٥٦')).toBe('123456');
    expect(normalizeTotp('12345')).toBeNull();
    expect(normalizeRecoveryCode('abcde-12345')).toBe('ABCDE12345');
    expect(formatSecret('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP');
    expect(mfaGateCode({ status: 403, code: 'mfa_enrollment_required' })).toBe('mfa_enrollment_required');
    expect(mfaGateCode({ status: 403, code: 'forbidden' })).toBeNull();
  });
});

describe('MfaChallengeForm', () => {
  it('verifies a 6-digit code, stores tokens and reports success', async () => {
    const { api, calls, store } = makeApi((_path, body) => (body.code === '654321' ? json(200, { ...tokens, user, isNewUser: false }) : json(401, { error: { code: 'invalid_code', message: 'The authenticator code is incorrect' } })));
    const onDone = vi.fn();
    wrap(<MfaChallengeForm api={api} mfaToken="CHALLENGE" onDone={onDone} onCancel={() => undefined} />);
    const ue = userEvent.setup();
    const submit = screen.getByTestId('mfa-submit');
    expect(submit).toBeDisabled();
    await ue.type(screen.getByTestId('mfa-code'), '111111');
    await ue.click(submit);
    expect(await screen.findByText('The authenticator code is incorrect')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    await ue.type(screen.getByTestId('mfa-code'), '654 321');
    await ue.click(screen.getByTestId('mfa-submit'));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(calls.at(-1)).toEqual({ path: '/auth/mfa/verify', body: { mfaToken: 'CHALLENGE', code: '654321' } });
    expect(store.get()?.accessToken).toBe('ACCESS');
  });

  it('can use a one-time recovery code instead', async () => {
    const { api, calls } = makeApi(() => json(200, { ...tokens, user, isNewUser: false }));
    const onDone = vi.fn();
    wrap(<MfaChallengeForm api={api} mfaToken="CHALLENGE" onDone={onDone} onCancel={() => undefined} />);
    const ue = userEvent.setup();
    await ue.click(screen.getByRole('button', { name: 'Use a recovery code' }));
    await ue.type(screen.getByTestId('mfa-recovery'), 'abcde-12345');
    await ue.click(screen.getByTestId('mfa-submit'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls.at(-1)?.body).toEqual({ mfaToken: 'CHALLENGE', recoveryCode: 'ABCDE12345' });
  });
});

describe('MfaEnrollment', () => {
  it('shows the QR and secret, enables with a code, then shows recovery codes once', async () => {
    const codes = Array.from({ length: 10 }, (_, i) => `CODE${i}-ABCDE`);
    const { api, calls, store } = makeApi((path) => {
      if (path === '/auth/mfa/setup') return json(200, { secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/Qabnah:ops%40qabnah.test?secret=JBSWY3DPEHPK3PXP&issuer=Qabnah' });
      if (path === '/auth/mfa/enable') return json(200, { ...tokens, accessToken: 'MFA_ACCESS', recoveryCodes: codes });
      return json(404, {});
    });
    store.set({ accessToken: 'OLD', refreshToken: 'OLD_R' });
    const onDone = vi.fn();
    wrap(<MfaEnrollment api={api} account="ops@qabnah.test" onDone={onDone} />);
    expect(await screen.findByTestId('mfa-secret')).toHaveTextContent('JBSW Y3DP EHPK 3PXP');
    expect(await screen.findByTestId('mfa-qr')).toHaveAttribute('src', expect.stringMatching(/^data:image\/png;base64,/));
    const ue = userEvent.setup();
    await ue.type(screen.getByTestId('mfa-enroll-code'), '123456');
    await ue.click(screen.getByTestId('mfa-enable'));
    const list = await screen.findByTestId('recovery-codes');
    expect(list.querySelectorAll('li')).toHaveLength(10);
    expect(calls.find((c) => c.path === '/auth/mfa/enable')?.body).toEqual({ code: '123456' });
    expect(store.get()?.accessToken).toBe('MFA_ACCESS');
    const finish = screen.getByTestId('mfa-finish');
    expect(finish).toBeDisabled();
    await ue.click(screen.getByRole('checkbox'));
    await ue.click(finish);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
