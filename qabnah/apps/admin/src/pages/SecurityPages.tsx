import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, MfaEnrollment, PageHeader, SecurityPanel, useI18n, type MfaGateCode } from '@qabnah/shared';
import { api, onMfaGate, realtime } from '../api';
import { firstAllowed } from '../Layout';
import { useOptionalSession, useSession } from '../session';

/** Forced enrolment screen (outside the layout so no admin data is requested meanwhile). */
export function MfaSetupPage() {
  const { t } = useI18n();
  const s = useSession();
  const qc = useQueryClient();
  const nav = useNavigate();
  if (s.me.user.mfaEnabled) {
    return (
      <div className="auth-page"><Card className="auth-card"><div className="stack">
        <Alert tone="info">{t('mfa.reauthNotice')}</Alert>
        <Button variant="primary" onClick={async () => { await s.signOut(); nav('/login'); }}>{t('common.signIn')}</Button>
      </div></Card></div>
    );
  }
  return (
    <div className="auth-page">
      <div className="auth-card auth-card--wide stack stack-lg">
        <img src="/brand/logo.svg" alt={t('app.name')} className="auth-logo" />
        <Card title={t('mfa.enrollTitle')}>
          <div className="stack">
            <Alert tone="info">{t('mfa.enrollRequired')}</Alert>
            <MfaEnrollment api={api} account={s.me.user.email ?? s.me.user.fullName}
              onDone={async () => { realtime.restart(); await qc.invalidateQueries({ queryKey: ['a'] }); nav(firstAllowed(s.perms), { replace: true }); }} />
            <div><Button variant="ghost" icon="logout" onClick={async () => { await s.signOut(); nav('/login'); }}>{t('common.signOut')}</Button></div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function SecurityPage() {
  const { t } = useI18n();
  const s = useSession();
  const qc = useQueryClient();
  return (
    <>
      <PageHeader title={t('nav.security')} description={t('security.hint')} />
      <SecurityPanel api={api} account={s.me.user.email ?? s.me.user.fullName} mfaEnabled={!!s.me.user.mfaEnabled}
        staffNote={t('security.staffNote')} onChanged={() => { realtime.restart(); void qc.invalidateQueries({ queryKey: ['a'] }); }} />
    </>
  );
}

/** Reacts to 403 mfa_enrollment_required / mfa_required from any admin request. */
export function MfaGate() {
  const s = useOptionalSession();
  const nav = useNavigate();
  const { t } = useI18n();
  useEffect(() => onMfaGate(async (code: MfaGateCode) => {
    if (!s) return;
    if (code === 'mfa_enrollment_required' && !s.me.user.mfaEnabled) nav('/security/setup', { replace: true });
    else { await s.signOut(); nav('/login', { replace: true, state: { notice: t('mfa.reauthNotice') } }); }
  }), [s, nav, t]);
  return null;
}
