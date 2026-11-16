import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, ConfirmDialog, Input, Modal, errorMessage, useI18n, useToast, type MerchantAction, type Order } from '@qabnah/shared';
import { merchantApi } from '../../api';
import { useSession } from '../session';

/** Runs merchant order actions; accept/reject/cancel open a dialog first (prep time / reason). */
export function useOrderActions() {
  const { t } = useI18n();
  const { merchantId, detail } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState<{ order: Order; action: MerchantAction } | null>(null);
  const [prep, setPrep] = useState('');

  const m = useMutation({
    mutationFn: ({ order, action, body }: { order: Order; action: MerchantAction; body?: { prepTimeMinutes?: number; reason?: string } }) =>
      merchantApi.post<Order>(`/merchants/${merchantId}/orders/${order.id}/${action}`, body ?? {}),
    onSuccess: (o, v) => {
      qc.setQueryData(['m', 'order', merchantId, o.id], o);
      void qc.invalidateQueries({ queryKey: ['m', 'orders', merchantId] });
      toast.push(t(`orders.done.${v.action}`, { number: o.number }));
      setPending(null);
    },
    onError: (e) => toast.push(errorMessage(e, t), 'danger'),
  });

  const run = (order: Order, action: MerchantAction) => {
    if (action === 'accept' || action === 'reject' || action === 'cancel') {
      if (action === 'accept') setPrep(String(order.prepTimeMinutes ?? detail?.prepTimeMinutes ?? 15));
      m.reset();
      setPending({ order, action });
      return;
    }
    m.mutate({ order, action });
  };

  const prepNum = Number(prep);
  const prepValid = Number.isInteger(prepNum) && prepNum >= 0 && prepNum <= 240;
  const dialogs = (
    <>
      <Modal open={pending?.action === 'accept'} onClose={() => setPending(null)} title={t('orders.acceptTitle', { number: pending?.order.number ?? '' })}
        footer={<>
          <Button onClick={() => setPending(null)}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={m.isPending} disabled={!prepValid} onClick={() => pending && m.mutate({ order: pending.order, action: 'accept', body: { prepTimeMinutes: prepNum } })}>{t('orders.action.accept')}</Button>
        </>}>
        <div className="stack">
          <Input label={t('orders.prepTime')} type="number" inputMode="numeric" min={0} max={240} value={prep} onChange={(e) => setPrep(e.target.value)}
            suffix={t('orders.minutesShort')} error={prep && !prepValid ? t('orders.prepInvalid') : null} autoFocus />
          <div className="row">
            {[10, 15, 20, 30, 45].map((n) => <Button key={n} size="sm" variant={String(n) === prep ? 'primary' : 'secondary'} onClick={() => setPrep(String(n))}>{t('common.minutes', { n })}</Button>)}
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={pending?.action === 'reject' || pending?.action === 'cancel'} tone="danger"
        title={t(pending?.action === 'reject' ? 'orders.rejectTitle' : 'orders.cancelTitle', { number: pending?.order.number ?? '' })}
        message={t(pending?.action === 'reject' ? 'orders.rejectBody' : 'orders.cancelBody')}
        reasonLabel={t('common.reason')} reasonRequired confirmLabel={t(`orders.action.${pending?.action ?? 'cancel'}`)}
        loading={m.isPending} error={m.isError ? errorMessage(m.error, t) : null}
        onClose={() => setPending(null)} onConfirm={(reason) => pending && m.mutate({ order: pending.order, action: pending.action, body: { reason } })} />
    </>
  );
  return { run, dialogs, busy: m.isPending };
}
