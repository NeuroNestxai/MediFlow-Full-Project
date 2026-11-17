import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, Kpi, LinkButton, Loading, PageHeader, Pagination, Photo, Select, StatusBadge, Tabs,
  errorMessage, formatBps, useDebounced, useI18n, useToast, type AdminMerchantDetail, type Items, type MerchantDetail, type Page, type Plan,
} from '@qabnah/shared';
import { api } from '../api';
import { useSession } from '../session';

const LIMIT = 25;

export function MerchantsPage() {
  const { t, pick, dateTime } = useI18n();
  const nav = useNavigate();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const dq = useDebounced(q, 350);
  const r = useQuery({
    queryKey: ['a', 'merchants', status, dq, offset],
    queryFn: () => api.get<Page<MerchantDetail>>('/admin/merchants', { query: { status: status || undefined, q: dq || undefined, limit: LIMIT, offset } }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader title={t('nav.merchants')} description={t('merchants.hint')} />
      <Tabs label={t('common.status')} value={status} onChange={(v) => { setStatus(v); setOffset(0); }}
        tabs={['', 'pending_review', 'active', 'suspended', 'rejected'].map((s) => ({ value: s, label: s ? t(`status.${s}`) : t('common.all') }))} />
      <Card flush title={<Input type="search" aria-label={t('common.search')} placeholder={t('merchants.search')} value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} fieldClassName="grow" />}>
        {r.isLoading ? <Loading /> : r.isError ? <ErrorState error={r.error} onRetry={() => r.refetch()} /> : !r.data?.items.length ? <EmptyState icon="store" title={t('merchants.empty')} /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>{t('common.name')}</th><th>{t('merchants.category')}</th><th>{t('common.status')}</th><th>{t('merchants.plan')}</th><th>{t('merchants.commission')}</th><th>{t('merchants.created')}</th></tr></thead>
              <tbody>{r.data.items.map((m) => (
                <tr key={m.id} className="clickable" tabIndex={0} onClick={() => nav(`/merchants/${m.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') nav(`/merchants/${m.id}`); }}>
                  <td><div className="row" style={{ flexWrap: 'nowrap' }}><Photo src={m.coverUrl ?? m.logoUrl} ratio="1 / 1" category={m.category} className="photo--sm" style={{ width: 44 }} /><div><div className="strong">{pick(m.nameEn, m.nameAr)}</div><div className="text-xs muted ltr">/{m.slug}</div></div></div></td>
                  <td>{t(`category.${m.category}`)}</td>
                  <td><StatusBadge kind="raw" status={m.status} /></td>
                  <td>{m.plan ? pick(m.plan.nameEn, m.plan.nameAr) : '—'}</td>
                  <td>{formatBps(m.commissionBps)}{m.commissionBpsOverride != null ? <> <Badge tone="info">{t('merchants.override')}</Badge></> : null}</td>
                  <td className="nowrap">{dateTime(m.createdAt)}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <Pagination total={r.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        )}
      </Card>
    </>
  );
}

type Action = 'approve' | 'reject' | 'suspend' | 'reactivate';
const ACTIONS: Record<string, Action[]> = { pending_review: ['approve', 'reject'], rejected: ['approve'], active: ['suspend'], suspended: ['reactivate'] };

export function MerchantDetailPage() {
  const { id } = useParams();
  const { t, pick, money, dateTime, date, num } = useI18n();
  const { can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['a', 'merchant', id], queryFn: () => api.get<AdminMerchantDetail>(`/admin/merchants/${id}`) });
  const plans = useQuery({ queryKey: ['a', 'plans'], queryFn: () => api.get<Items<Plan>>('/admin/plans') });
  const [action, setAction] = useState<Action | null>(null);
  const [docReject, setDocReject] = useState<string | null>(null);
  const [planId, setPlanId] = useState('');
  const [override, setOverride] = useState('');
  useEffect(() => { if (q.data) { setPlanId(q.data.plan?.id ?? ''); setOverride(q.data.commissionBpsOverride != null ? String(q.data.commissionBpsOverride / 100) : ''); } }, [q.data]);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['a', 'merchant', id] }); void qc.invalidateQueries({ queryKey: ['a', 'merchants'] }); };
  const act = useMutation({ mutationFn: ({ a, reason }: { a: Action; reason?: string }) => api.post(`/admin/merchants/${id}/${a}`, reason ? { reason } : {}), onSuccess: (_, v) => { setAction(null); refresh(); toast.push(t(`merchants.done.${v.a}`)); } });
  const review = useMutation({
    mutationFn: ({ docId, status, reason }: { docId: string; status: 'approved' | 'rejected'; reason?: string }) => api.post(`/admin/merchant-documents/${docId}/review`, { status, ...(reason ? { reason } : {}) }),
    onSuccess: () => { setDocReject(null); refresh(); toast.push(t('common.saved')); },
    onError: (e) => toast.push(errorMessage(e, t), 'danger'),
  });
  const commercial = useMutation({
    mutationFn: () => {
      const body: { planId?: string; commissionBpsOverride?: number | null } = {};
      if (planId && planId !== q.data?.plan?.id) body.planId = planId;
      const ov = override.trim() === '' ? null : Math.round(Number(override) * 100);
      if (ov !== (q.data?.commissionBpsOverride ?? null)) body.commissionBpsOverride = ov;
      return api.patch(`/admin/merchants/${id}`, body);
    },
    onSuccess: () => { refresh(); toast.push(t('common.saved')); },
  });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const m = q.data;
  const allowed = (ACTIONS[m.status] ?? []).filter((a) => can((a === 'approve' || a === 'reject') ? 'merchants:review' : 'merchants:manage'));
  const ovValid = override.trim() === '' || (Number(override) >= 0 && Number(override) <= 100);
  return (
    <>
      <PageHeader title={pick(m.nameEn, m.nameAr)} description={<span className="ltr">{m.storefrontUrl}</span>}
        actions={<>
          <Link className="btn btn--ghost" to="/merchants">{t('common.back')}</Link>
          <LinkButton href={m.storefrontUrl} external icon="external">{t('merchants.storefront')}</LinkButton>
          {allowed.map((a) => <Button key={a} variant={a === 'approve' || a === 'reactivate' ? 'primary' : 'danger-outline'} onClick={() => { act.reset(); setAction(a); }}>{t(`merchants.action.${a}`)}</Button>)}
        </>} />
      <div className="row"><StatusBadge kind="raw" status={m.status} /><Badge>{t(`category.${m.category}`)}</Badge>{m.isOpen ? <Badge tone="success">{t('merchants.openNow')}</Badge> : <Badge>{t('merchants.closedNow')}</Badge>}</div>
      {m.rejectionReason ? <Alert tone="warning">{t('common.reason')}: {m.rejectionReason}</Alert> : null}
      <div className="grid grid-4">
        <Kpi label={t('merchants.orders')} value={num(m.stats.orders, 0)} />
        <Kpi label={t('merchants.gmv')} value={money(m.stats.gmvBaisa)} />
        <Kpi label={t('merchants.commission')} value={formatBps(m.commissionBps)} />
        <Kpi label={t('merchants.rating')} value={m.ratingCount ? `${num(m.ratingAvg, 1)} ★` : '—'} hint={m.ratingCount ? `${num(m.ratingCount, 0)}` : undefined} />
      </div>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card title={t('merchants.profile')}>
          <dl className="dl">
            <dt>{t('merchants.legalName')}</dt><dd>{m.legalName ?? '—'}</dd>
            <dt>{t('merchants.cr')}</dt><dd className="ltr">{m.crNumber ?? '—'}</dd>
            <dt>{t('merchants.vat')}</dt><dd className="ltr">{m.vatNumber ?? '—'}</dd>
            <dt>{t('common.phone')}</dt><dd className="ltr">{m.contactPhone ?? '—'}</dd>
            <dt>{t('common.email')}</dt><dd className="ltr">{m.contactEmail ?? '—'}</dd>
            <dt>{t('merchants.address')}</dt><dd>{m.addressText}</dd>
            <dt>{t('merchants.created')}</dt><dd>{dateTime(m.createdAt)}</dd>
            <dt>{t('merchants.approved')}</dt><dd>{dateTime(m.approvedAt)}</dd>
          </dl>
          <h3 style={{ marginBlock: '16px 8px' }}>{t('merchants.staff')}</h3>
          <ul className="item-list">{m.staff.map((s) => <li key={s.userId + s.role}><div className="row between"><span>{s.fullName} <span className="text-xs muted ltr">{s.email}</span></span><Badge>{t(`role.${s.role}`)}</Badge></div></li>)}</ul>
        </Card>
        <Card title={t('merchants.commercial')}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); if (ovValid) commercial.mutate(); }}>
            <fieldset disabled={!can('merchants:manage')} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
              <Select label={t('merchants.plan')} value={planId} onChange={(e) => setPlanId(e.target.value)} placeholder="—"
                options={(plans.data?.items ?? []).map((p) => ({ value: p.id, label: `${pick(p.nameEn, p.nameAr)} · ${formatBps(p.commissionBps)} · ${money(p.monthlyFeeBaisa)}/mo`, disabled: !p.isActive }))} />
              <Input label={t('merchants.override')} type="number" step="0.01" min={0} max={100} suffix="%" value={override} onChange={(e) => setOverride(e.target.value)} hint={t('merchants.overrideHint')} error={!ovValid ? t('merchants.overrideInvalid') : null} />
              {commercial.isError ? <Alert tone="danger">{errorMessage(commercial.error, t)}</Alert> : null}
              {can('merchants:manage') ? <div><Button type="submit" variant="primary" loading={commercial.isPending}>{t('common.save')}</Button></div> : <p className="text-sm muted">{t('merchants.manageOnly')}</p>}
            </fieldset>
            {m.subscriptions.length ? <div className="text-sm muted">{t('merchants.subscriptions')}: {m.subscriptions.map((s) => `${s.planCode} (${t(`status.${s.status}`)})`).join(', ')}</div> : null}
          </form>
        </Card>
      </div>
      <Card flush title={t('merchants.documents')}>
        {!m.documents.length ? <EmptyState icon="file" title={t('merchants.noDocuments')} /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>{t('merchants.docType')}</th><th>{t('merchants.docNumber')}</th><th>{t('merchants.expires')}</th><th>{t('common.status')}</th><th><span className="sr-only">{t('common.actions')}</span></th></tr></thead>
            <tbody>{m.documents.map((d) => (
              <tr key={d.id}>
                <td className="strong">{t(`docType.${d.docType}`)}<div className="text-xs muted">{dateTime(d.createdAt)}</div></td>
                <td className="ltr">{d.number ?? '—'}</td>
                <td>{d.expiresAt ? date(d.expiresAt) : '—'}</td>
                <td><StatusBadge kind="raw" status={d.status} />{d.rejectionReason ? <div className="text-xs danger-text">{d.rejectionReason}</div> : null}</td>
                <td><div className="row row-nowrap">
                  <LinkButton size="sm" href={d.fileUrl} external icon="external">{t('common.open')}</LinkButton>
                  {can('merchants:review') ? <>
                    <Button size="sm" variant="primary" disabled={d.status === 'approved' || review.isPending} onClick={() => review.mutate({ docId: d.id, status: 'approved' })}>{t('merchants.approveDoc')}</Button>
                    <Button size="sm" variant="danger-outline" disabled={d.status === 'rejected'} onClick={() => setDocReject(d.id)}>{t('merchants.rejectDoc')}</Button>
                  </> : null}
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="text-xs muted pad">{t('merchants.signedUrlNote')}</p>
      </Card>
      <ConfirmDialog open={!!action} tone={action === 'approve' || action === 'reactivate' ? 'primary' : 'danger'} title={action ? t(`merchants.action.${action}`) : ''}
        message={action ? t(`merchants.confirm.${action}`, { name: pick(m.nameEn, m.nameAr) }) : ''} reasonLabel={action === 'reject' || action === 'suspend' ? t('common.reason') : undefined}
        reasonRequired={action === 'reject' || action === 'suspend'} confirmLabel={action ? t(`merchants.action.${action}`) : ''} loading={act.isPending} error={act.isError ? errorMessage(act.error, t) : null}
        onClose={() => setAction(null)} onConfirm={(reason) => action && act.mutate({ a: action, reason })} />
      <ConfirmDialog open={!!docReject} tone="danger" title={t('merchants.rejectDoc')} reasonLabel={t('common.reason')} reasonRequired confirmLabel={t('merchants.rejectDoc')}
        loading={review.isPending} onClose={() => setDocReject(null)} onConfirm={(reason) => docReject && review.mutate({ docId: docReject, status: 'rejected', reason })} />
    </>
  );
}
