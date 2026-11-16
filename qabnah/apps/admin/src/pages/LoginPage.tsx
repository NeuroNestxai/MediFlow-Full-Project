import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Input, errorMessage, loginWithPassword, useI18n } from '@qabnah/shared';
import { api } from '../api';
import { firstAllowed } from '../Layout';
import { meKey, useOptionalSession } from '../session';

export function LoginPage() {
  const { t, toggleLang, lang } = useI18n();
  const s = useOptionalSession();
  const qc = useQueryClient();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const m = useMutation({ mutationFn: () => loginWithPassword(api, email, password), onSuccess: () => qc.invalidateQueries({ queryKey: meKey }) });
  if (s) {
    if (!s.perms.length) return <Navigate to="/no-access" replace />;
    return <Navigate to={loc.state?.from && loc.state.from !== '/login' ? loc.state.from : firstAllowed(s.perms)} replace />;
  }
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <div className="auth-page">
      <div className="auth-card stack stack-lg">
        <div className="row end"><Button size="sm" variant="ghost" icon="globe" onClick={toggleLang} lang={lang === 'ar' ? 'en' : 'ar'}>{t('lang.switch')}</Button></div>
        <img src="/brand/logo.svg" alt={t('app.name')} className="auth-logo" />
        <Card>
          <form className="stack" onSubmit={submit} noValidate>
            <div className="stack stack-sm"><h1>{t('login.title')}</h1><p className="muted">{t('login.subtitle')}</p></div>
            <Input label={t('common.email')} type="email" dir="ltr" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input label={t('common.password')} type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {m.isError ? <Alert tone="danger">{errorMessage(m.error, t)}</Alert> : null}
            <Button type="submit" variant="primary" size="lg" block loading={m.isPending} disabled={!email || !password}>{t('common.signIn')}</Button>
            <p className="text-xs muted">{t('login.note')}</p>
          </form>
        </Card>
      </div>
    </div>
  );
}
