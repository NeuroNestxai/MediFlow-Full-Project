import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Input, MfaChallengeForm, errorMessage, passwordLogin, useI18n } from '@qabnah/shared';
import { api, realtime } from '../api';
import { firstAllowed } from '../Layout';
import { meKey, useOptionalSession } from '../session';

export function LoginPage() {
  const { t, toggleLang, lang } = useI18n();
  const s = useOptionalSession();
  const qc = useQueryClient();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string; notice?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const finish = async (enroll: boolean) => {
    await qc.invalidateQueries({ queryKey: meKey });
    realtime.restart();
    if (enroll) nav('/security/setup', { replace: true });
  };
  const m = useMutation({
    mutationFn: () => passwordLogin(api, email, password),
    onSuccess: async (r) => {
      if (r.kind === 'mfa') { setMfaToken(r.mfaToken); return; }
      await finish(!!r.result.mfaEnrollmentRequired);
    },
  });
  if (s && !mfaToken) {
    if (!s.perms.length) return <Navigate to="/no-access" replace />;
    return <Navigate to={loc.state?.from && !['/login', '/security/setup'].includes(loc.state.from) ? loc.state.from : firstAllowed(s.perms)} replace />;
  }
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <div className="auth-split">
      <aside className="auth-split__brand">
        <div className="auth-split__photo" aria-hidden="true"><img src="/sample/rider-muscat.jpg" alt="" /></div>
        <div className="auth-split__mark"><img src="/brand/mark.svg" alt="" /><span>{t('app.name')}</span></div>
        <div className="auth-split__claim"><h1>{t('brand.tagline')}</h1><p>{t('admin.subtitle')}</p></div>
      </aside>
      <main className="auth-split__form">
        <div className="row end"><Button size="sm" variant="ghost" icon="globe" onClick={toggleLang} lang={lang === 'ar' ? 'en' : 'ar'}>{t('lang.switch')}</Button></div>
        <div className="auth-split__form-inner">
          {mfaToken ? (
            <MfaChallengeForm api={api} mfaToken={mfaToken} onCancel={() => { setMfaToken(null); setPassword(''); }}
              onDone={async () => { setMfaToken(null); await finish(false); }} />
          ) : (
            <form className="stack stack-lg" onSubmit={submit} noValidate>
              <div className="stack stack-sm"><h1>{t('login.title')}</h1><p className="muted">{t('login.subtitle')}</p></div>
              <div className="stack">
                {loc.state?.notice ? <Alert tone="warning">{loc.state.notice}</Alert> : null}
                <Input label={t('common.email')} type="email" dir="ltr" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <Input label={t('common.password')} type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                {m.isError ? <Alert tone="danger">{errorMessage(m.error, t)}</Alert> : null}
              </div>
              <Button type="submit" variant="primary" size="lg" block loading={m.isPending} disabled={!email || !password}>{t('common.signIn')}</Button>
              <p className="text-xs muted">{t('login.note')}</p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
