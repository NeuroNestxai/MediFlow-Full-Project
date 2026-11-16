import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Alert, Button, Card, ConfirmDialog, CopyButton, EmptyState, ErrorState, Input, LinkButton, Loading, Modal, MoneyInput, PageHeader, StatusBadge, Switch,
  Textarea, errorMessage, isApiError, normalizeOmanPhone, useI18n, useToast, type Items, type PaymentLink,
} from '@qabnah/shared';
import { merchantApi } from '../api';
import { useSession } from './session';

const EXPIRY = [24, 72, 168, 720];

function CreateLinkModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (l: PaymentLink) => void }) {
  const { t, num } = useI18n();
  const { merchantId } = useSession();
  const [f, setF] = useState({ title: '', description: '', customerName: '', customerPhone: '', expiresInHours: 72, requestDelivery: false });
  const [amount, setAmount] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: () => merchantApi.post<PaymentLink>(`/merchants/${merchantId}/payment-links`, {
      title: f.title.trim(), amountBaisa: amount, requestDelivery: f.requestDelivery, expiresInHours: f.expiresInHours,
      ...(f.description.trim() ? { description: f.description.trim() } : {}), ...(f.customerName.trim() ? { customerName: f.customerName.trim() } : {}),
      ...(f.customerPhone.trim() ? { customerPhone: f.customerPhone.trim() } : {}),
    }),
    onSuccess: (l) => { onCreated(l); setF({ title: '', description: '', customerName: '', customerPhone: '', expiresInHours: 72, requestDelivery: false }); setAmount(null); },
    onError: (e) => { if (isApiError(e)) setErrors(e.fieldErrors); },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (f.title.trim().length < 2) errs.title = t('common.required');
    if (amount == null || amount < 100) errs.amountBaisa = t('links.amountMin');
    if (f.customerPhone.trim() && !normalizeOmanPhone(f.customerPhone)) errs.customerPhone = t('delivery.phoneInvalid');
    setErrors(errs);
    if (!Object.keys(errs).length) m.mutate();
  };
  return (
    <Modal open={open} onClose={onClose} title={t('links.create')}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" type="submit" form="pl-form" loading={m.isPending}>{t('links.createSubmit')}</Button></>}>
      <form id="pl-form" className="stack" onSubmit={submit} noValidate>
        <Input label={t('links.title')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={errors.title} placeholder={t('links.titlePlaceholder')} required />
        <MoneyInput label={t('common.amount')} valueBaisa={amount} onChangeBaisa={setAmount} error={errors.amountBaisa} required />
        <Textarea label={t('links.description')} rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} optional />
        <div className="form-grid">
          <Input label={t('delivery.customerName')} value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} optional />
          <Input label={t('delivery.customerPhone')} type="tel" dir="ltr" value={f.customerPhone} onChange={(e) => setF({ ...f, customerPhone: e.target.value })} error={errors.customerPhone} hint={t('links.phoneHint')} optional />
        </div>
        <div className="field">
          <span className="field__label">{t('links.expiry')}</span>
          <div className="seg" role="group" aria-label={t('links.expiry')}>
            {EXPIRY.map((h) => <button key={h} type="button" aria-pressed={f.expiresInHours === h} onClick={() => setF({ ...f, expiresInHours: h })}>{h < 48 ? t('links.hours', { n: num(h, 0) }) : t('links.days', { n: num(h / 24, 0) })}</button>)}
          </div>
        </div>
        <Switch checked={f.requestDelivery} onChange={(v) => setF({ ...f, requestDelivery: v })} label={t('links.requestDelivery')} description={t('links.requestDeliveryHint')} />
        {m.isError ? <Alert tone="danger">{errorMessage(m.error, t)}</Alert> : null}
      </form>
    </Modal>
  );
}

export function PaymentLinksPage() {
  const { t, money, dateTime } = useI18n();
  const { merchantId, detail } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<PaymentLink | null>(null);
  const [toCancel, setToCancel] = useState<PaymentLink | null>(null);
  const q = useQuery({ queryKey: ['m', 'links', merchantId], queryFn: () => merchantApi.get<Items<PaymentLink>>(`/merchants/${merchantId}/payment-links`), refetchInterval: 30_000 });
  const cancel = useMutation({
    mutationFn: (l: PaymentLink) => merchantApi.post<PaymentLink>(`/merchants/${merchantId}/payment-links/${l.id}/cancel`),
    onSuccess: () => { setToCancel(null); void qc.invalidateQueries({ queryKey: ['m', 'links', merchantId] }); toast.push(t('links.cancelled')); },
  });
  return (
    <>
      <PageHeader title={t('nav.paymentLinks')} description={t('links.hint')} actions={<Button variant="primary" icon="plus" disabled={detail?.status !== 'active'} onClick={() => setCreating(true)}>{t('links.create')}</Button>} />
      {detail && detail.status !== 'active' ? <Alert tone="warning">{t('links.needsApproval')}</Alert> : null}
      {created ? (
        <Alert tone="success" title={t('links.createdTitle')} action={<Button size="sm" variant="ghost" iconOnly icon="x" aria-label={t('common.close')} onClick={() => setCreated(null)} />}>
          <div className="stack stack-sm">
            <span className="ltr mono">{created.url}</span>
            <div className="row"><CopyButton text={created.url} /><LinkButton size="sm" variant="whatsapp" icon="whatsapp" href={created.whatsappShareUrl} external>{t('links.shareWhatsApp')}</LinkButton></div>
          </div>
        </Alert>
      ) : null}
      <Card flush>
        {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.items.length ? <EmptyState icon="link" title={t('links.empty')}>{t('links.emptyHint')}</EmptyState> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('links.title')}</th><th className="num">{t('common.amount')}</th><th>{t('delivery.customer')}</th><th>{t('common.status')}</th><th>{t('links.expires')}</th><th><span className="sr-only">{t('common.actions')}</span></th></tr></thead>
              <tbody>
                {q.data.items.map((l) => (
                  <tr key={l.id}>
                    <td><div className="strong">{l.title}</div><div className="text-xs muted ltr">{l.code}{l.requestDelivery ? ` · ${t('links.withDelivery')}` : ''}</div></td>
                    <td className="num strong">{money(l.amountBaisa)}</td>
                    <td>{l.customerName ?? '—'}{l.customerPhone ? <div className="text-xs muted ltr">{l.customerPhone}</div> : null}</td>
                    <td><StatusBadge kind="raw" status={l.status} />{l.paidAt ? <div className="text-xs muted">{dateTime(l.paidAt)}</div> : null}</td>
                    <td className="nowrap text-sm">{dateTime(l.expiresAt)}</td>
                    <td>
                      <div className="row row-nowrap">
                        {l.status === 'active' ? <>
                          <CopyButton text={l.url} />
                          <LinkButton size="sm" variant="whatsapp" icon="whatsapp" href={l.whatsappShareUrl} external aria-label={t('links.shareWhatsApp')}>{t('links.share')}</LinkButton>
                          <Button size="sm" variant="danger-outline" onClick={() => setToCancel(l)}>{t('common.cancel')}</Button>
                        </> : null}
                        {l.orderId ? <Link className="btn btn--sm" to={`/orders/${l.orderId}`}>{t('links.trackDelivery')}</Link> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <CreateLinkModal open={creating} onClose={() => setCreating(false)} onCreated={(l) => { setCreating(false); setCreated(l); void qc.invalidateQueries({ queryKey: ['m', 'links', merchantId] }); }} />
      <ConfirmDialog open={!!toCancel} tone="danger" title={t('links.cancelTitle')} message={toCancel ? `${toCancel.title} — ${money(toCancel.amountBaisa)}` : ''} confirmLabel={t('links.cancelConfirm')}
        loading={cancel.isPending} error={cancel.isError ? errorMessage(cancel.error, t) : null} onClose={() => setToCancel(null)} onConfirm={() => toCancel && cancel.mutate(toCancel)} />
    </>
  );
}
