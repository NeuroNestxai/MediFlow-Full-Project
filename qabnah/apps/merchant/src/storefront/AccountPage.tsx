import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Input, errorMessage, isApiError, useI18n, useToast } from '@qabnah/shared';
import { consumerApi, consumerRealtime } from '../api';
import { OtpSignIn, useConsumer } from './ConsumerAuth';
import { useStorefront } from './StorefrontLayout';

/** Consumer self-service: PDPL data export and account deletion. */
export function AccountPage() {
  const { sf } = useStorefront();
  const { t } = useI18n();
  const { signedIn, loading, me } = useConsumer();
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const [confirm, setConfirm] = useState('');
  const exportData = useMutation({
    mutationFn: () => consumerApi.get<unknown>('/me/export'),
    onSuccess: (data) => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `qabnah-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.push(t('account.exported'));
    },
  });
  const signOut = async () => {
    consumerRealtime.stop();
    await consumerApi.logout();
    qc.removeQueries({ queryKey: ['c'] });
  };
  const del = useMutation({
    mutationFn: () => consumerApi.post('/me/delete', { confirm: 'DELETE' }),
    onSuccess: async () => {
      consumerRealtime.stop();
      consumerApi.tokens.clear();
      qc.removeQueries({ queryKey: ['c'] });
      toast.push(t('account.deleted'));
      nav(`/s/${sf.merchant.slug}`, { replace: true });
    },
  });
  if (loading) return null;
  if (!signedIn) return <main className="sf-container sf-page"><Card title={t('account.signIn')}><OtpSignIn /></Card></main>;
  const blocked = isApiError(del.error) && del.error.code === 'account_deletion_blocked';
  return (
    <main className="sf-container sf-page">
      <div className="row between"><h1>{t('account.title')}</h1><Link to={`/s/${sf.merchant.slug}`} className="btn btn--ghost btn--sm">{t('sf.backToMenu')}</Link></div>
      <Card title={t('account.profile')} actions={<Button size="sm" icon="logout" onClick={async () => { await signOut(); nav(`/s/${sf.merchant.slug}`); }}>{t('common.signOut')}</Button>}>
        <dl className="dl">
          <dt>{t('common.phone')}</dt><dd className="ltr">{me?.user.phone}</dd>
          <dt>{t('common.name')}</dt><dd>{me?.user.fullName || '—'}</dd>
        </dl>
      </Card>
      <Card title={t('account.exportTitle')}>
        <div className="stack">
          <p className="muted">{t('account.exportBody')}</p>
          {exportData.isError ? <Alert tone="danger">{errorMessage(exportData.error, t)}</Alert> : null}
          <div><Button icon="file" loading={exportData.isPending} onClick={() => exportData.mutate()} data-testid="export-data">{t('account.export')}</Button></div>
        </div>
      </Card>
      <Card title={t('account.deleteTitle')}>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); if (confirm === 'DELETE') del.mutate(); }} noValidate>
          <Alert tone="warning">{t('account.deleteBody')}</Alert>
          <Input label={t('account.typeDelete')} dir="ltr" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value.trim().toUpperCase())} placeholder="DELETE" />
          {del.isError ? <Alert tone="danger" title={blocked ? t('account.blockedTitle') : undefined}>{errorMessage(del.error, t)}</Alert> : null}
          <div><Button type="submit" variant="danger" loading={del.isPending} disabled={confirm !== 'DELETE'} data-testid="delete-account">{t('account.delete')}</Button></div>
        </form>
      </Card>
    </main>
  );
}
