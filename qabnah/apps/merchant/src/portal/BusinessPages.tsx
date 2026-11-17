import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Alert, Badge, Button, Card, ConfirmDialog, CopyButton, DailyChart, EmptyState, ErrorState, FilePickerButton, Input, Kpi, Loading, Modal, PageHeader, RankBars,
  Segmented, Select, StatusBadge, addDays, errorMessage, isApiError, muscatToday, useI18n, useToast,
  type AccountFinance, type Analytics, type Items, type MerchantDocType, type MerchantDocument, type StaffMember,
} from '@qabnah/shared';
import { merchantApi } from '../api';
import { useSession } from './session';

/* ───────── Finance ───────── */
export function FinancePage() {
  const { t, money, dateTime, date, num } = useI18n();
  const { merchantId } = useSession();
  const q = useQuery({ queryKey: ['m', 'finance', merchantId], queryFn: () => merchantApi.get<AccountFinance>(`/merchants/${merchantId}/finance`) });
  return (
    <>
      <PageHeader title={t('nav.finance')} description={t('finance.hint')} />
      <Alert tone="info" title={t('finance.signTitle')}>{t('finance.signBody')}</Alert>
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data ? (
        <>
          <div className="grid grid-3">
            <Kpi label={t('finance.balance')} value={money(q.data.balanceBaisa)} tone={q.data.balanceBaisa < 0 ? 'danger' : 'success'} hint={q.data.balanceBaisa >= 0 ? t('finance.platformOwesYou') : t('finance.youOwePlatform')} />
            <Kpi label={t('finance.unsettled')} value={money(q.data.unsettledBaisa)} hint={t('finance.unsettledHint', { n: num(q.data.unsettledEntries.length, 0) })} />
            <Kpi label={t('finance.settlements')} value={num(q.data.settlements.length, 0)} hint={t('finance.settlementsHint')} />
          </div>
          <Card flush title={t('finance.unsettledEntries')}>
            {!q.data.unsettledEntries.length ? <EmptyState icon="wallet" title={t('finance.noEntries')} /> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>{t('common.date')}</th><th>{t('finance.entryType')}</th><th>{t('finance.description')}</th><th>{t('orders.number')}</th><th className="num">{t('common.amount')}</th></tr></thead>
                <tbody>{q.data.unsettledEntries.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">{dateTime(e.createdAt)}</td>
                    <td><Badge tone={e.amountBaisa >= 0 ? 'success' : 'danger'}>{t(`ledger.${e.entryType}`)}</Badge></td>
                    <td className="text-sm">{e.description}</td>
                    <td>{e.orderId ? <Link className="ltr" to={`/orders/${e.orderId}`}>#{e.orderNumber}</Link> : '—'}</td>
                    <td className={`num strong ${e.amountBaisa < 0 ? 'danger-text' : 'success-text'}`}>{money(e.amountBaisa, { signed: true })}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Card>
          <Card flush title={t('finance.settlements')}>
            {!q.data.settlements.length ? <EmptyState icon="wallet" title={t('finance.noSettlements')} /> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>{t('finance.period')}</th><th className="num">{t('finance.credits')}</th><th className="num">{t('finance.debits')}</th><th className="num">{t('finance.net')}</th><th>{t('common.status')}</th><th>{t('finance.payoutRef')}</th></tr></thead>
                <tbody>{q.data.settlements.map((s) => (
                  <tr key={s.id}>
                    <td className="nowrap">{date(s.periodStart)} – {date(s.periodEnd)}<div className="text-xs muted">{t('finance.entries', { n: num(s.entryCount, 0) })}</div></td>
                    <td className="num">{money(s.creditsBaisa)}</td><td className="num">{money(-s.debitsBaisa)}</td>
                    <td className="num strong">{money(s.netBaisa)}</td>
                    <td><StatusBadge kind="raw" status={s.status} />{s.paidAt ? <div className="text-xs muted">{dateTime(s.paidAt)}</div> : null}</td>
                    <td className="ltr mono text-sm">{s.payoutReference ?? '—'}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </Card>
        </>
      ) : null}
    </>
  );
}

/* ───────── Analytics ───────── */
export function AnalyticsPage() {
  const { t, money, num, pick } = useI18n();
  const { merchantId } = useSession();
  const today = muscatToday();
  const [range, setRange] = useState<'7' | '30' | '90' | 'custom'>('30');
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const setPreset = (r: '7' | '30' | '90' | 'custom') => { setRange(r); if (r !== 'custom') { setFrom(addDays(today, -(Number(r) - 1))); setTo(today); } };
  const valid = from <= to;
  const q = useQuery({ queryKey: ['m', 'analytics', merchantId, from, to], queryFn: () => merchantApi.get<Analytics>(`/merchants/${merchantId}/analytics`, { query: { from, to } }), enabled: valid });
  return (
    <>
      <PageHeader title={t('nav.analytics')} description={t('analytics.hint')}
        actions={<Segmented label={t('analytics.range')} value={range} onChange={setPreset} options={[{ value: '7', label: t('analytics.days', { n: num(7, 0) }) }, { value: '30', label: t('analytics.days', { n: num(30, 0) }) }, { value: '90', label: t('analytics.days', { n: num(90, 0) }) }, { value: 'custom', label: t('analytics.custom') }]} />} />
      {range === 'custom' ? (
        <div className="row">
          <Input type="date" label={t('common.from')} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" label={t('common.to')} value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} error={!valid ? t('analytics.rangeInvalid') : null} />
        </div>
      ) : null}
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data ? (
        <>
          <div className="kpi-grid" style={{ ['--cols' as string]: 3 }}>
            <Kpi label={t('analytics.orders')} value={num(q.data.orders, 0)} hint={t('analytics.completedN', { n: num(q.data.completedOrders, 0) })} />
            <Kpi label={t('analytics.gmv')} value={money(q.data.gmvBaisa)} hint={t('analytics.gmvHint')} />
            <Kpi label={t('analytics.aov')} value={money(q.data.averageOrderValueBaisa)} />
            <Kpi label={t('analytics.cancelled')} value={num(q.data.cancelledOrders, 0)} tone={q.data.cancelledOrders ? 'danger' : undefined} hint={q.data.orders ? t('analytics.rate', { p: num((q.data.cancelledOrders / q.data.orders) * 100, 0) }) : undefined} />
            <Kpi label={t('analytics.commission')} value={money(q.data.commissionBaisa)} />
            <Kpi label={t('analytics.avgDelivery')} value={q.data.avgDeliveryMinutes != null ? t('common.minutes', { n: num(q.data.avgDeliveryMinutes, 1) }) : '—'} />
          </div>
          <Card title={t('analytics.byDay')}><DailyChart data={q.data.byDay} from={q.data.from} to={q.data.to} /></Card>
          <div className="grid grid-2">
            <Card title={t('analytics.topProducts')}>
              {q.data.topProducts.length ? <RankBars rows={q.data.topProducts.map((p) => ({ label: pick(p.nameEn, p.nameAr), value: p.quantity, display: t('analytics.qty', { n: num(p.quantity, 0) }), sub: money(p.revenueBaisa) }))} /> : <EmptyState icon="chart" title={t('analytics.noData')} />}
            </Card>
            <Card title={t('analytics.byType')}>
              {q.data.byType.length ? <RankBars rows={q.data.byType.map((b) => ({ label: t(`order.type.${b.type}`), value: b.orders, display: t('chart.ordersN', { n: num(b.orders, 0) }), sub: money(b.gmvBaisa) }))} /> : <EmptyState icon="chart" title={t('analytics.noData')} />}
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}

/* ───────── Staff ───────── */
export function StaffPage() {
  const { t } = useI18n();
  const { merchantId, can, me } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const manage = can('merchant.staff:manage');
  const q = useQuery({ queryKey: ['m', 'staff', merchantId], queryFn: () => merchantApi.get<Items<StaffMember>>(`/merchants/${merchantId}/staff`) });
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ email: '', fullName: '', role: 'merchant_staff' });
  const [created, setCreated] = useState<{ member: StaffMember; temporaryPassword: string | null } | null>(null);
  const [toRemove, setToRemove] = useState<StaffMember | null>(null);
  const add = useMutation({
    mutationFn: () => merchantApi.post<{ member: StaffMember; temporaryPassword: string | null }>(`/merchants/${merchantId}/staff`, { email: f.email.trim(), fullName: f.fullName.trim(), role: f.role }),
    onSuccess: (r) => { setAdding(false); setCreated(r); setF({ email: '', fullName: '', role: 'merchant_staff' }); void qc.invalidateQueries({ queryKey: ['m', 'staff', merchantId] }); },
  });
  const remove = useMutation({
    mutationFn: (s: StaffMember) => merchantApi.delete(`/merchants/${merchantId}/staff/${s.userId}`),
    onSuccess: () => { setToRemove(null); void qc.invalidateQueries({ queryKey: ['m', 'staff', merchantId] }); toast.push(t('staff.removed')); },
  });
  const fe = isApiError(add.error) ? add.error.fieldErrors : {};
  const submit = (e: FormEvent) => { e.preventDefault(); add.mutate(); };
  return (
    <>
      <PageHeader title={t('nav.staff')} description={t('staff.hint')} actions={manage ? <Button variant="primary" icon="plus" onClick={() => { add.reset(); setAdding(true); }}>{t('staff.add')}</Button> : null} />
      {!manage ? <Alert tone="info">{t('staff.readOnly')}</Alert> : null}
      {created ? (
        <Alert tone="success" title={t('staff.addedTitle', { name: created.member.fullName })} action={<Button size="sm" variant="ghost" iconOnly icon="x" aria-label={t('common.close')} onClick={() => setCreated(null)} />}>
          {created.temporaryPassword ? (
            <div className="stack stack-sm">
              <span>{t('staff.tempPassword')}</span>
              <div className="row"><code className="mono temp-pass">{created.temporaryPassword}</code><CopyButton text={created.temporaryPassword} /></div>
              <span className="text-sm">{t('staff.tempPasswordNote')}</span>
            </div>
          ) : <span>{t('staff.existingAccount')}</span>}
        </Alert>
      ) : null}
      <Card flush>
        {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.items.length ? <EmptyState icon="users" title={t('staff.empty')} /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>{t('common.name')}</th><th>{t('common.email')}</th><th>{t('staff.role')}</th><th><span className="sr-only">{t('common.actions')}</span></th></tr></thead>
            <tbody>{q.data.items.map((s) => (
              <tr key={s.userId}>
                <td className="strong">{s.fullName}{s.userId === me.user.id ? <> <Badge tone="primary">{t('staff.you')}</Badge></> : null}</td>
                <td className="ltr">{s.email}</td>
                <td>{s.roles.map((r) => <Badge key={r} tone={r === 'merchant_owner' ? 'accent' : 'neutral'}>{t(`role.${r}`)}</Badge>)}</td>
                <td>{manage && !s.roles.includes('merchant_owner') && s.userId !== me.user.id ? <Button size="sm" variant="danger-outline" onClick={() => setToRemove(s)}>{t('staff.remove')}</Button> : null}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
      <Modal open={adding} onClose={() => setAdding(false)} title={t('staff.add')}
        footer={<><Button onClick={() => setAdding(false)}>{t('common.cancel')}</Button><Button type="submit" form="staff-form" variant="primary" loading={add.isPending} disabled={!f.email || f.fullName.trim().length < 2}>{t('staff.add')}</Button></>}>
        <form id="staff-form" className="stack" onSubmit={submit} noValidate>
          <Input label={t('common.name')} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} error={fe.fullName} required />
          <Input label={t('common.email')} type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={fe.email} required />
          <Select label={t('staff.role')} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={[{ value: 'merchant_staff', label: t('role.merchant_staff') }, { value: 'merchant_manager', label: t('role.merchant_manager') }]}
            hint={f.role === 'merchant_staff' ? t('staff.staffHint') : t('staff.managerHint')} />
          {add.isError ? <Alert tone="danger">{errorMessage(add.error, t)}</Alert> : null}
        </form>
      </Modal>
      <ConfirmDialog open={!!toRemove} tone="danger" title={t('staff.removeTitle')} message={toRemove ? t('staff.removeBody', { name: toRemove.fullName }) : ''} confirmLabel={t('staff.remove')}
        loading={remove.isPending} error={remove.isError ? errorMessage(remove.error, t) : null} onClose={() => setToRemove(null)} onConfirm={() => toRemove && remove.mutate(toRemove)} />
    </>
  );
}

/* ───────── KYB documents ───────── */
const DOC_TYPES: MerchantDocType[] = ['commercial_registration', 'vat_certificate', 'municipality_license', 'owner_id', 'bank_letter', 'other'];

export function DocumentsPage() {
  const { t, dateTime, date } = useI18n();
  const { merchantId, can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const manage = can('merchant.store:manage');
  const q = useQuery({ queryKey: ['m', 'docs', merchantId], queryFn: () => merchantApi.get<Items<MerchantDocument>>(`/merchants/${merchantId}/documents`) });
  const [docType, setDocType] = useState<MerchantDocType>('commercial_registration');
  const [number, setNumber] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error(t('docs.chooseFile'));
      const f = await merchantApi.upload(file, 'merchant_document');
      return merchantApi.post<MerchantDocument>(`/merchants/${merchantId}/documents`, { docType, fileId: f.id, ...(number.trim() ? { number: number.trim() } : {}), ...(expiresAt ? { expiresAt } : {}) });
    },
    onSuccess: () => { setFile(null); setNumber(''); setExpiresAt(''); void qc.invalidateQueries({ queryKey: ['m', 'docs', merchantId] }); toast.push(t('docs.uploaded')); },
  });
  const open = async (d: MerchantDocument) => {
    setOpening(d.id);
    try {
      const url = await merchantApi.fileObjectUrl(`/files/${d.fileId}`);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.push(errorMessage(e, t), 'danger');
    } finally {
      setOpening(null);
    }
  };
  const okFile = !file || (/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type) && file.size <= 10 * 1024 * 1024);
  return (
    <>
      <PageHeader title={t('nav.documents')} description={t('docs.hint')} />
      {manage ? (
        <Card title={t('docs.upload')}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); if (file && okFile) upload.mutate(); }} noValidate>
            <div className="form-grid">
              <Select label={t('docs.type')} value={docType} onChange={(e) => setDocType(e.target.value as MerchantDocType)} options={DOC_TYPES.map((d) => ({ value: d, label: t(`docs.type.${d}`) }))} />
              <Input label={t('docs.number')} dir="ltr" value={number} onChange={(e) => setNumber(e.target.value)} optional />
              <Input label={t('docs.expiresAt')} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} optional />
            </div>
            <div className="row">
              <FilePickerButton accept="image/jpeg,image/png,image/webp,application/pdf" onFile={setFile} label={file ? t('docs.changeFile') : t('docs.chooseFile')} icon="file" size="md" />
              {file ? <span className="text-sm">{file.name}</span> : <span className="text-sm muted">{t('docs.fileHint')}</span>}
            </div>
            {!okFile ? <span className="field__error">{t('docs.fileInvalid')}</span> : null}
            {upload.isError ? <Alert tone="danger">{errorMessage(upload.error, t)}</Alert> : null}
            <div><Button type="submit" variant="primary" icon="file" loading={upload.isPending} disabled={!file || !okFile}>{t('docs.submit')}</Button></div>
          </form>
        </Card>
      ) : null}
      <Card flush title={t('docs.list')}>
        {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.items.length ? <EmptyState icon="file" title={t('docs.empty')}>{t('docs.emptyHint')}</EmptyState> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>{t('docs.type')}</th><th>{t('docs.number')}</th><th>{t('docs.expiresAt')}</th><th>{t('docs.uploadedAt')}</th><th>{t('docs.review')}</th><th><span className="sr-only">{t('common.actions')}</span></th></tr></thead>
            <tbody>{q.data.items.map((d) => (
              <tr key={d.id}>
                <td className="strong">{t(`docs.type.${d.docType}`)}</td>
                <td className="ltr">{d.number ?? '—'}</td>
                <td>{d.expiresAt ? date(d.expiresAt) : '—'}</td>
                <td className="nowrap">{dateTime(d.createdAt)}</td>
                <td><StatusBadge kind="raw" status={d.status === 'pending' ? 'pending' : d.status} />{d.rejectionReason ? <div className="text-xs danger-text">{d.rejectionReason}</div> : null}</td>
                <td><Button size="sm" icon="external" loading={opening === d.id} onClick={() => open(d)}>{t('common.view')}</Button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}
