import { useEffect, useState, type FormEvent } from 'react';
import type { ApiClient } from '../api/client';
import type { AuthResult } from '../api/types';
import { disableMfa, enableMfa, formatSecret, normalizeRecoveryCode, normalizeTotp, setupMfa, verifyMfa } from '../auth/mfa';
import { useI18n } from '../i18n/i18n';
import { Alert, Badge, Button, Card, CopyButton, Input, Spinner, errorMessage } from './components';

/** Second sign-in step: 6-digit authenticator code, or a one-time recovery code. */
export function MfaChallengeForm({ api, mfaToken, onDone, onCancel }: { api: ApiClient; mfaToken: string; onDone: (r: AuthResult) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'code' | 'recovery'>('code');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalized = mode === 'code' ? normalizeTotp(value) : normalizeRecoveryCode(value);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!normalized) return;
    setBusy(true);
    setError(null);
    try {
      const r = await verifyMfa(api, mfaToken, mode === 'code' ? { code: normalized } : { recoveryCode: normalized });
      onDone(r);
    } catch (err) {
      setError(errorMessage(err, t));
      setValue('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="stack" onSubmit={submit} noValidate aria-labelledby="mfa-title">
      <div className="stack stack-sm">
        <h1 id="mfa-title">{t('mfa.challengeTitle')}</h1>
        <p className="muted">{mode === 'code' ? t('mfa.challengeHint') : t('mfa.recoveryHint')}</p>
      </div>
      {mode === 'code' ? (
        <Input key="code" label={t('mfa.code')} inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={7} autoFocus
          value={value} onChange={(e) => setValue(e.target.value)} className="otp-input" data-testid="mfa-code" />
      ) : (
        <Input key="rc" label={t('mfa.recoveryCode')} autoComplete="off" dir="ltr" autoFocus placeholder="ABCDE-12345"
          value={value} onChange={(e) => setValue(e.target.value)} className="mono" data-testid="mfa-recovery" />
      )}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!normalized} data-testid="mfa-submit">{t('mfa.verify')}</Button>
      <div className="row between">
        <button type="button" className="link-btn" onClick={() => { setMode(mode === 'code' ? 'recovery' : 'code'); setValue(''); setError(null); }}>
          {mode === 'code' ? t('mfa.useRecovery') : t('mfa.useCode')}
        </button>
        <button type="button" className="link-btn" onClick={onCancel}>{t('common.back')}</button>
      </div>
    </form>
  );
}

/** Recovery codes shown once, with copy and download. */
export function RecoveryCodes({ codes, account, onDone }: { codes: string[]; account: string; onDone: () => void }) {
  const { t } = useI18n();
  const [saved, setSaved] = useState(false);
  const text = `Qabnah recovery codes — ${account}\n${new Date().toISOString().slice(0, 10)}\n\n${codes.join('\n')}\n`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qabnah-recovery-codes.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSaved(true);
  };
  return (
    <div className="stack" data-testid="recovery-codes">
      <Alert tone="warning" title={t('mfa.recoveryTitle')}>{t('mfa.recoveryBody')}</Alert>
      <ol className="recovery-codes ltr">{codes.map((c) => <li key={c} className="mono">{c}</li>)}</ol>
      <div className="row">
        <CopyButton text={codes.join('\n')} size="md" label={t('mfa.copyCodes')} />
        <Button icon="file" onClick={download}>{t('mfa.downloadCodes')}</Button>
      </div>
      <label className="check"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> <span>{t('mfa.savedCodes')}</span></label>
      <Button variant="primary" disabled={!saved} onClick={onDone} data-testid="mfa-finish">{t('mfa.finish')}</Button>
    </div>
  );
}

/** Enrolment: setup → QR + secret → confirm code → recovery codes. Stores the new MFA tokens on success. */
export function MfaEnrollment({ api, account, onDone, onCancel }: { api: ApiClient; account: string; onDone: () => void; onCancel?: () => void }) {
  const { t } = useI18n();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    setupMfa(api)
      .then(async (s) => {
        if (!alive) return;
        setSetup(s);
        try { const QRCode = (await import('qrcode')).default; setQr(await QRCode.toDataURL(s.otpauthUrl, { margin: 1, width: 220, color: { dark: '#0B1F1C', light: '#FFFFFF' } })); } catch { setQr(null); }
      })
      .catch((e) => alive && setError(errorMessage(e, t)));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);
  const normalized = normalizeTotp(code);
  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    if (!normalized) return;
    setBusy(true);
    setError(null);
    try {
      setCodes(await enableMfa(api, normalized));
    } catch (err) {
      setError(errorMessage(err, t));
      setCode('');
    } finally {
      setBusy(false);
    }
  };
  if (codes) return <RecoveryCodes codes={codes} account={account} onDone={onDone} />;
  return (
    <div className="stack stack-lg">
      <ol className="mfa-steps">
        <li>{t('mfa.step1')}</li>
        <li>{t('mfa.step2')}</li>
        <li>{t('mfa.step3')}</li>
      </ol>
      {!setup && !error ? <div className="center-pad"><Spinner label={t('common.loading')} /></div> : null}
      {setup ? (
        <div className="mfa-qr">
          {qr ? <img src={qr} alt={t('mfa.qrAlt')} width={220} height={220} data-testid="mfa-qr" /> : null}
          <div className="stack stack-sm">
            <span className="text-sm muted">{t('mfa.manualEntry')}</span>
            <code className="mono temp-pass ltr" data-testid="mfa-secret">{formatSecret(setup.secret)}</code>
            <div><CopyButton text={setup.secret} /></div>
          </div>
        </div>
      ) : null}
      {setup ? (
        <form className="stack" onSubmit={confirm} noValidate>
          <Input label={t('mfa.confirmCode')} inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={7} value={code}
            onChange={(e) => setCode(e.target.value)} className="otp-input" data-testid="mfa-enroll-code" />
          <div className="row">
            <Button type="submit" variant="primary" loading={busy} disabled={!normalized} data-testid="mfa-enable">{t('mfa.enable')}</Button>
            {onCancel ? <Button onClick={onCancel}>{t('common.cancel')}</Button> : null}
          </div>
        </form>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}

/** "Account security" card: status + enable / disable. */
export function SecurityPanel({ api, account, mfaEnabled, onChanged, staffNote }: { api: ApiClient; account: string; mfaEnabled: boolean; onChanged: () => void; staffNote?: string }) {
  const { t } = useI18n();
  const [enrolling, setEnrolling] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const normalized = normalizeTotp(code);
  const disable = async (e: FormEvent) => {
    e.preventDefault();
    if (!normalized) return;
    setBusy(true);
    setError(null);
    try {
      await disableMfa(api, normalized);
      setDisabling(false);
      setCode('');
      setNotice(t('mfa.disabledNotice'));
      onChanged();
    } catch (err) {
      const ae = err as { code?: string; message?: string };
      setError(ae.code === 'mfa_required_for_staff' ? t('mfa.requiredForStaff') : errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={t('mfa.title')} actions={<Badge tone={mfaEnabled ? 'success' : 'warning'} dot>{mfaEnabled ? t('mfa.on') : t('mfa.off')}</Badge>}>
      <div className="stack">
        <p className="muted">{t('mfa.explain')}</p>
        {staffNote ? <Alert tone="info">{staffNote}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}
        {enrolling ? (
          <MfaEnrollment api={api} account={account} onCancel={() => setEnrolling(false)} onDone={() => { setEnrolling(false); setNotice(t('mfa.enabledNotice')); onChanged(); }} />
        ) : mfaEnabled ? (
          disabling ? (
            <form className="stack" onSubmit={disable} noValidate>
              <Input label={t('mfa.code')} inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className="otp-input" autoFocus />
              {error ? <Alert tone="danger">{error}</Alert> : null}
              <div className="row">
                <Button type="submit" variant="danger" loading={busy} disabled={!normalized}>{t('mfa.disable')}</Button>
                <Button onClick={() => { setDisabling(false); setError(null); }}>{t('common.cancel')}</Button>
              </div>
            </form>
          ) : <div><Button variant="danger-outline" onClick={() => { setNotice(null); setDisabling(true); }}>{t('mfa.disable')}</Button></div>
        ) : <div><Button variant="primary" icon="shield" onClick={() => { setNotice(null); setEnrolling(true); }}>{t('mfa.setUp')}</Button></div>}
      </div>
    </Card>
  );
}
