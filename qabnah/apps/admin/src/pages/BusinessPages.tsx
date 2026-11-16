import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Badge, Button, Card, Checkbox, ConfirmDialog, DailyChart, EmptyState, ErrorState, Input, Kpi, Loading, Modal, PageHeader, Pagination, RankBars, Segmented, Select,
  StatusBadge, Tabs, Textarea, addDays, errorMessage, isApiError, muscatToday, useI18n, useToast,
  type AdminAnalytics, type FinanceBalances, type Items, type Settlement, type Ticket,
} from '@qabnah/shared';
import { api } from '../api';
import { useSession } from '../session';

/* ───────── Finance ───────── */
export function FinancePage() {
  const { t, money, date, dateTime, num } = useI18n();
  const { can, me } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'settlements' | 'balances' | 'revenue'>('settlements');
  const [accType, setAccType] = useState<'' | 'merchant' | 'captain'>('');
  const [status, setStatus] = useState('');
  const balances = useQuery({ queryKey: ['a', 'balances', accType], queryFn: () => api.get<FinanceBalances>('/admin/finance/balances', { query: { accountType: accType || undefined } }) });
  const settlements = useQuery({ queryKey: ['a', 'settlements', status, accType], queryFn: () => api.get<Items<Settlement>>('/admin/settlements', { query: { status: status || undefined, accountType: accType || undefined, limit: 100 } }) });
  const [genOpen, setGenOpen] = useState(false);
  const today = muscatToday();
  const [gen, setGen] = useState({ accountType: 'merchant' as 'merchant' | 'captain', periodStart: addDays(today, -7), periodEnd: addDays(today, -1) });
  const [paying, setPaying] = useState<Settlement | null>(null);
  const [payoutRef, setPayoutRef] = useState('');
  const [cancelling, setCancelling] = useState<Settlement | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['a', 'settlements'] }); void qc.invalidateQueries({ queryKey: ['a', 'balances'] }); };
  const generate = useMutation({ mutationFn: () => api.post<Items<Settlement>>('/admin/settlements/generate', gen), onSuccess: (r) => { setGenOpen(false); refresh(); toast.push(t('finance.generated', { n: r.items.length })); } });
  const action = useMutation({
    mutationFn: ({ s, a, body }: { s: Settlement; a: 'approve' | 'mark-paid' | 'cancel'; body?: object }) => api.post<Settlement>(`/admin/settlements/${s.id}/${a}`, body ?? {}),
    onSuccess: (_, v) => { setPaying(null); setCancelling(null); refresh(); toast.push(t(`finance.done.${v.a}`)); },
    onError: (e) => toast.push(isApiError(e) && e.status === 403 ? `${t('finance.forbiddenTitle')}: ${e.message}` : errorMessage(e, t), 'danger'),
  });
  const revenueTotal = balances.data?.platformRevenue.reduce((s, r) => s + r.totalBaisa, 0) ?? 0;
  return (
    <>
      <PageHeader title={t('nav.finance')} description={t('finance.hint')} actions={can('settlements:manage') ? <Button variant="primary" icon="plus" onClick={() => { generate.reset(); setGenOpen(true); }}>{t('finance.generate')}</Button> : null} />
      <Alert tone="info">{t('finance.signNote')}</Alert>
      <div className="row between">
        <Tabs label={t('nav.finance')} value={tab} onChange={setTab} tabs={[{ value: 'settlements', label: t('finance.settlements') }, { value: 'balances', label: t('finance.balances') }, { value: 'revenue', label: t('finance.revenue') }]} />
        <Segmented label={t('finance.accountType')} value={accType} onChange={setAccType} options={[{ value: '', label: t('common.all') }, { value: 'merchant', label: t('finance.merchants') }, { value: 'captain', label: t('finance.captains') }]} />
      </div>
      {tab === 'settlements' ? (
        <Card flush title={<Select aria-label={t('common.status')} value={status} onChange={(e) => setStatus(e.target.value)} placeholder={t('common.all')} options={['draft', 'approved', 'paid', 'cancelled'].map((s) => ({ value: s, label: t(`status.${s}`) }))} />}>
          {settlements.isLoading ? <Loading /> : settlements.isError ? <ErrorState error={settlements.error} onRetry={() => settlements.refetch()} /> : !settlements.data?.items.length ? <EmptyState icon="wallet" title={t('finance.noSettlements')} /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>{t('finance.account')}</th><th>{t('finance.period')}</th><th className="num">{t('finance.credits')}</th><th className="num">{t('finance.debits')}</th><th className="num">{t('finance.net')}</th><th>{t('common.status')}</th><th><span className="sr-only">{t('common.actions')}</span></th></tr></thead>
              <tbody>{settlements.data.items.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.accountName ?? s.accountId.slice(0, 8)}</strong><div className="text-xs muted">{t(`finance.type.${s.accountType}`)} · {t('finance.entries', { n: num(s.entryCount, 0) })}</div></td>
                  <td className="nowrap">{date(s.periodStart)} – {date(s.periodEnd)}</td>
                  <td className="num">{money(s.creditsBaisa)}</td><td className="num">{money(-s.debitsBaisa)}</td>
                  <td className={`num strong ${s.netBaisa < 0 ? 'danger-text' : ''}`}>{money(s.netBaisa)}<div className="text-xs muted">{s.netBaisa >= 0 ? t('finance.payToAccount') : t('finance.collectFromAccount')}</div></td>
                  <td><StatusBadge kind="raw" status={s.status} />{s.payoutReference ? <div className="text-xs mono">{s.payoutReference}</div> : null}{s.createdBy === me.user.id ? <div className="text-xs muted">{t('finance.createdByYou')}</div> : null}</td>
                  <td><div className="row row-nowrap">
                    {s.status === 'draft' && can('settlements:approve') ? <Button size="sm" variant="primary" disabled={action.isPending} onClick={() => action.mutate({ s, a: 'approve' })} title={s.createdBy === me.user.id ? t('finance.fourEyes') : undefined}>{t('finance.approve')}</Button> : null}
                    {s.status === 'approved' && can('settlements:manage') ? <Button size="sm" variant="primary" onClick={() => { action.reset(); setPayoutRef(''); setPaying(s); }}>{t('finance.markPaid')}</Button> : null}
                    {['draft', 'approved'].includes(s.status) && can('settlements:manage') ? <Button size="sm" variant="danger-outline" onClick={() => { action.reset(); setCancelling(s); }}>{t('common.cancel')}</Button> : null}
                  </div></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      ) : tab === 'balances' ? (
        <Card flush>
          {balances.isLoading ? <Loading /> : balances.isError ? <ErrorState error={balances.error} onRetry={() => balances.refetch()} /> : !balances.data?.accounts.length ? <EmptyState icon="wallet" title={t('finance.noBalances')} /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>{t('finance.account')}</th><th>{t('common.type')}</th><th className="num">{t('finance.balance')}</th><th className="num">{t('finance.unsettled')}</th><th className="num">{t('finance.cashHeld')}</th></tr></thead>
              <tbody>{balances.data.accounts.map((a) => (
                <tr key={a.accountType + a.accountId}>
                  <td className="strong">{a.accountType === 'captain' ? <Link to={`/captains/${a.accountId}`}>{a.name}</Link> : <Link to={`/merchants/${a.accountId}`}>{a.name}</Link>}</td>
                  <td>{t(`finance.type.${a.accountType}`)}</td>
                  <td className={`num strong ${a.balanceBaisa < 0 ? 'danger-text' : ''}`}>{money(a.balanceBaisa)}</td>
                  <td className="num">{money(a.unsettledBaisa)}</td>
                  <td className="num">{a.cashHeldBaisa != null ? money(a.cashHeldBaisa) : '—'}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      ) : (
        <div className="grid grid-2">
          <Kpi label={t('finance.revenueTotal')} value={money(revenueTotal)} hint={t('finance.revenueHint')} />
          <Card title={t('finance.revenue')}>
            {balances.data?.platformRevenue.length ? <RankBars rows={balances.data.platformRevenue.map((r) => ({ label: t(`ledger.${r.entryType}`), value: Math.max(0, r.totalBaisa), display: money(r.totalBaisa) }))} /> : <EmptyState icon="chart" title={t('finance.noRevenue')} />}
          </Card>
        </div>
      )}
      <Modal open={genOpen} onClose={() => setGenOpen(false)} title={t('finance.generate')}
        footer={<><Button onClick={() => setGenOpen(false)}>{t('common.cancel')}</Button><Button variant="primary" loading={generate.isPending} disabled={gen.periodEnd < gen.periodStart} onClick={() => generate.mutate()}>{t('finance.generate')}</Button></>}>
        <div className="stack">
          <p className="text-sm muted">{t('finance.generateHint')}</p>
          <Select label={t('finance.accountType')} value={gen.accountType} onChange={(e) => setGen({ ...gen, accountType: e.target.value as 'merchant' | 'captain' })} options={[{ value: 'merchant', label: t('finance.merchants') }, { value: 'captain', label: t('finance.captains') }]} />
          <div className="form-grid">
            <Input label={t('common.from')} type="date" value={gen.periodStart} onChange={(e) => setGen({ ...gen, periodStart: e.target.value })} />
            <Input label={t('common.to')} type="date" value={gen.periodEnd} onChange={(e) => setGen({ ...gen, periodEnd: e.target.value })} error={gen.periodEnd < gen.periodStart ? t('finance.rangeInvalid') : null} />
          </div>
          {generate.isError ? <Alert tone="danger">{errorMessage(generate.error, t)}</Alert> : null}
        </div>
      </Modal>
      <Modal open={!!paying} onClose={() => setPaying(null)} title={t('finance.markPaid')}
        footer={<><Button onClick={() => setPaying(null)}>{t('common.cancel')}</Button><Button variant="primary" loading={action.isPending} disabled={payoutRef.trim().length < 3} onClick={() => paying && action.mutate({ s: paying, a: 'mark-paid', body: { payoutReference: payoutRef.trim() } })}>{t('finance.markPaid')}</Button></>}>
        <div className="stack">
          {paying ? <p>{paying.accountName} · <strong>{money(paying.netBaisa)}</strong> · {dateTime(paying.createdAt)}</p> : null}
          <Input label={t('finance.payoutRef')} dir="ltr" value={payoutRef} onChange={(e) => setPayoutRef(e.target.value)} hint={t('finance.payoutRefHint')} />
          {action.isError ? <Alert tone="danger">{errorMessage(action.error, t)}</Alert> : null}
        </div>
      </Modal>
      <ConfirmDialog open={!!cancelling} tone="danger" title={t('finance.cancelTitle')} message={t('finance.cancelBody')} confirmLabel={t('finance.cancelSettlement')} loading={action.isPending}
        onClose={() => setCancelling(null)} onConfirm={() => cancelling && action.mutate({ s: cancelling, a: 'cancel' })} />
    </>
  );
}

/* ───────── Support ───────── */
const LIMIT = 25;
export function SupportPage() {
  const { t, relative } = useI18n();
  const { me } = useSession();
  const nav = useNavigate();
  const [status, setStatus] = useState('open,pending');
  const [assigned, setAssigned] = useState('');
  const [offset, setOffset] = useState(0);
  const q = useQuery({
    queryKey: ['a', 'tickets', status, assigned, offset],
    queryFn: () => api.get<{ items: Ticket[]; total: number }>('/admin/support/tickets', { query: { status: status || undefined, assignedTo: assigned === 'me' ? me.user.id : assigned || undefined, limit: LIMIT, offset } }),
    refetchInterval: 30_000,
  });
  return (
    <>
      <PageHeader title={t('nav.support')} description={t('support.hint')} />
      <Card flush title={<div className="row grow">
        <Select aria-label={t('common.status')} value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} options={[{ value: 'open,pending', label: t('support.openPending') }, { value: 'open', label: t('status.open') }, { value: 'pending', label: t('status.pending') }, { value: 'resolved', label: t('status.resolved') }, { value: 'closed', label: t('status.closed') }, { value: '', label: t('common.all') }]} />
        <Select aria-label={t('support.assignee')} value={assigned} onChange={(e) => { setAssigned(e.target.value); setOffset(0); }} options={[{ value: '', label: t('support.anyone') }, { value: 'me', label: t('support.mine') }, { value: 'unassigned', label: t('support.unassigned') }]} />
      </div>}>
        {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.items.length ? <EmptyState icon="support" title={t('support.empty')} /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>#</th><th>{t('support.subject')}</th><th>{t('support.requester')}</th><th>{t('support.priority')}</th><th>{t('common.status')}</th><th>{t('support.assignee')}</th><th>{t('support.updated')}</th></tr></thead>
              <tbody>{q.data.items.map((tk) => (
                <tr key={tk.id} className="clickable" tabIndex={0} onClick={() => nav(`/support/${tk.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') nav(`/support/${tk.id}`); }}>
                  <td className="mono">{tk.number}</td><td className="strong">{tk.subject}<div className="text-xs muted">{t(`support.cat.${tk.category}`)}</div></td>
                  <td>{tk.requester.fullName}<div className="text-xs muted">{tk.requester.role}</div></td>
                  <td><Badge tone={tk.priority === 'urgent' ? 'danger' : tk.priority === 'high' ? 'warning' : 'neutral'}>{t(`support.prio.${tk.priority}`)}</Badge></td>
                  <td><StatusBadge kind="raw" status={tk.status} /></td><td>{tk.assignedToName ?? <span className="muted">—</span>}</td><td className="nowrap">{relative(tk.updatedAt)}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <Pagination total={q.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        )}
      </Card>
    </>
  );
}

export function TicketPage() {
  const { id } = useParams();
  const { t, dateTime } = useI18n();
  const { me, can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [assignee, setAssignee] = useState('');
  const q = useQuery({ queryKey: ['a', 'ticket', id], queryFn: () => api.get<Ticket>(`/support/tickets/${id}`), refetchInterval: 20_000 });
  const staff = useQuery({ queryKey: ['a', 'staff'], queryFn: () => api.get<Items<{ userId: string; fullName: string; roles: string[] }>>('/admin/staff'), enabled: can('staff:manage') });
  const reply = useMutation({ mutationFn: () => api.post<Ticket>(`/support/tickets/${id}/messages`, { body: body.trim(), isInternal: internal }), onSuccess: (tk) => { qc.setQueryData(['a', 'ticket', id], tk); setBody(''); void qc.invalidateQueries({ queryKey: ['a', 'tickets'] }); } });
  const patch = useMutation({
    mutationFn: (b: { status?: string; priority?: string; assignedTo?: string | null }) => api.patch<Ticket>(`/admin/support/tickets/${id}`, b),
    onSuccess: (tk) => { qc.setQueryData(['a', 'ticket', id], tk); void qc.invalidateQueries({ queryKey: ['a', 'tickets'] }); toast.push(t('common.saved')); },
    onError: (e) => toast.push(errorMessage(e, t), 'danger'),
  });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const tk = q.data;
  const canReply = can('support:reply');
  const agents = (staff.data?.items ?? []).filter((s) => s.roles.some((r) => ['support_agent', 'ops_manager', 'super_admin'].includes(r)));
  return (
    <>
      <PageHeader title={<>{tk.subject} <span className="mono muted text-lg">{tk.number}</span></>} description={`${tk.requester.fullName} · ${t(`support.cat.${tk.category}`)} · ${dateTime(tk.createdAt)}`}
        actions={<Link className="btn btn--ghost" to="/support">{t('common.back')}</Link>} />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 320px)', alignItems: 'start' }}>
        <div className="stack stack-lg">
          <Card title={t('support.conversation')}>
            <ol className="thread">
              {tk.messages?.map((m) => (
                <li key={m.id} className={`thread__msg ${m.author.isStaff ? 'thread__msg--staff' : ''} ${m.isInternal ? 'thread__msg--internal' : ''}`}>
                  <div className="row between text-xs"><strong>{m.author.fullName}</strong><span className="muted">{m.isInternal ? `${t('support.internal')} · ` : ''}{dateTime(m.createdAt)}</span></div>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{m.body}</p>
                </li>
              ))}
            </ol>
          </Card>
          {canReply ? (
            <Card title={t('support.reply')}>
              <form className="stack" onSubmit={(e) => { e.preventDefault(); if (body.trim()) reply.mutate(); }}>
                <Textarea label={internal ? t('support.internalNote') : t('support.replyToRequester')} rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
                <Checkbox checked={internal} onChange={setInternal} label={t('support.markInternal')} />
                {reply.isError ? <Alert tone="danger">{errorMessage(reply.error, t)}</Alert> : null}
                <div><Button type="submit" variant={internal ? 'secondary' : 'primary'} loading={reply.isPending} disabled={!body.trim()}>{internal ? t('support.addNote') : t('support.send')}</Button></div>
              </form>
            </Card>
          ) : null}
        </div>
        <Card title={t('common.details')}>
          <div className="stack">
            <Select label={t('common.status')} value={tk.status} disabled={!canReply || patch.isPending} onChange={(e) => patch.mutate({ status: e.target.value })} options={['open', 'pending', 'resolved', 'closed'].map((s) => ({ value: s, label: t(`status.${s}`) }))} />
            <Select label={t('support.priority')} value={tk.priority} disabled={!canReply || patch.isPending} onChange={(e) => patch.mutate({ priority: e.target.value })} options={['low', 'normal', 'high', 'urgent'].map((s) => ({ value: s, label: t(`support.prio.${s}`) }))} />
            <div className="field"><span className="field__label">{t('support.assignee')}</span><span>{tk.assignedToName ?? '—'}</span></div>
            {canReply && tk.assignedTo !== me.user.id ? <Button onClick={() => patch.mutate({ assignedTo: me.user.id })}>{t('support.assignMe')}</Button> : null}
            {can('support:assign') ? (
              <div className="row row-nowrap">
                {agents.length ? <Select aria-label={t('support.assignTo')} value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder={t('support.assignTo')} options={agents.map((a) => ({ value: a.userId, label: a.fullName }))} />
                  : <Input aria-label={t('support.assignTo')} placeholder={t('support.agentId')} dir="ltr" value={assignee} onChange={(e) => setAssignee(e.target.value)} />}
                <Button disabled={!assignee} onClick={() => patch.mutate({ assignedTo: assignee })}>{t('support.assign')}</Button>
              </div>
            ) : null}
            {tk.assignedTo && can('support:assign') ? <Button variant="ghost" onClick={() => patch.mutate({ assignedTo: null })}>{t('support.unassign')}</Button> : null}
            {tk.orderId ? <Link className="btn" to={`/orders/${tk.orderId}`}>{t('support.viewOrder')}</Link> : null}
          </div>
        </Card>
      </div>
    </>
  );
}

/* ───────── Analytics ───────── */
export function AnalyticsPage() {
  const { t, money, num, pick } = useI18n();
  const today = muscatToday();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const from = addDays(today, -(Number(days) - 1));
  const q = useQuery({ queryKey: ['a', 'analytics', from, today], queryFn: () => api.get<AdminAnalytics>('/admin/analytics/overview', { query: { from, to: today } }) });
  return (
    <>
      <PageHeader title={t('nav.analytics')} description={t('analytics.hint')} actions={<Segmented label={t('analytics.range')} value={days} onChange={setDays} options={(['7', '30', '90'] as const).map((d) => ({ value: d, label: t('analytics.days', { n: d }) }))} />} />
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data ? (
        <>
          <div className="grid grid-4">
            <Kpi label={t('analytics.orders')} value={num(q.data.orders, 0)} hint={t('analytics.completedN', { n: num(q.data.completedOrders, 0) })} />
            <Kpi label={t('analytics.gmv')} value={money(q.data.gmvBaisa)} hint={t('analytics.aovN', { v: money(q.data.averageOrderValueBaisa) })} />
            <Kpi label={t('analytics.commission')} value={money(q.data.commissionBaisa)} />
            <Kpi label={t('analytics.deliveryFees')} value={money(q.data.deliveryFeesBaisa)} />
            <Kpi label={t('analytics.cancelled')} value={num(q.data.cancelledOrders, 0)} tone={q.data.cancelledOrders ? 'danger' : undefined} />
            <Kpi label={t('analytics.avgDelivery')} value={q.data.avgDeliveryMinutes != null ? `${num(q.data.avgDeliveryMinutes, 1)} min` : '—'} hint={q.data.avgAssignSeconds != null ? t('analytics.avgAssign', { s: num(q.data.avgAssignSeconds, 0) }) : undefined} />
            <Kpi label={t('analytics.customers')} value={num(q.data.activeCustomers, 0)} />
            <Kpi label={t('analytics.network')} value={`${num(q.data.merchants.active, 0)} / ${num(q.data.captains.active, 0)}`} hint={t('analytics.networkHint', { m: num(q.data.merchants.pending, 0), c: num(q.data.captains.pending, 0), o: num(q.data.captains.online, 0) })} />
          </div>
          <Card title={t('analytics.byDay')}><DailyChart data={q.data.byDay} from={q.data.from} to={q.data.to} /></Card>
          <div className="grid grid-3">
            <Card title={t('analytics.byType')}>{q.data.byType.length ? <RankBars rows={q.data.byType.map((b) => ({ label: t(`order.type.${b.type}`), value: b.orders, display: num(b.orders, 0), sub: money(b.gmvBaisa) }))} /> : <EmptyState icon="chart" title={t('analytics.noData')} />}</Card>
            <Card title={t('analytics.topMerchants')}>{q.data.topMerchants.length ? <RankBars rows={q.data.topMerchants.map((m) => ({ label: pick(m.nameEn, m.nameAr), value: m.gmvBaisa, display: money(m.gmvBaisa), sub: t('analytics.ordersN', { n: num(m.orders, 0) }) }))} /> : <EmptyState icon="chart" title={t('analytics.noData')} />}</Card>
            <Card title={t('analytics.topProducts')}>{q.data.topProducts.length ? <RankBars rows={q.data.topProducts.map((p) => ({ label: pick(p.nameEn, p.nameAr), value: p.quantity, display: num(p.quantity, 0), sub: money(p.revenueBaisa) }))} /> : <EmptyState icon="chart" title={t('analytics.noData')} />}</Card>
          </div>
        </>
      ) : null}
    </>
  );
}
