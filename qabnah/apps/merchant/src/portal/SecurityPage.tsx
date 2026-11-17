import { useQueryClient } from '@tanstack/react-query';
import { PageHeader, SecurityPanel, useI18n } from '@qabnah/shared';
import { merchantApi, merchantRealtime } from '../api';
import { meKey, useSession } from './session';

export function SecurityPage() {
  const { t } = useI18n();
  const s = useSession();
  const qc = useQueryClient();
  return (
    <>
      <PageHeader title={t('nav.security')} description={t('security.hint')} />
      <SecurityPanel api={merchantApi} account={s.me.user.email ?? s.me.user.fullName} mfaEnabled={!!s.me.user.mfaEnabled}
        onChanged={() => { merchantRealtime.restart(); void qc.invalidateQueries({ queryKey: meKey }); }} />
    </>
  );
}
