import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, LinkButton, Loading, Modal, MoneyInput, PageHeader, Pagination, Select, StatusBadge, Textarea,
  errorMessage, useDebounced, useI18n, useToast, type Order, type OrderStatus, type Page,
} from '@qabnah/shared';
import { DROPOFF_COLOR, FitBounds, MapView, Marker, PICKUP_COLOR, captainIcon, pinIcon } from '@qabnah/shared/map';
import { api } from '../api';
import { useSession } from '../session';

const STATUSES: OrderStatus[] = ['pending_payment', 'placed', 'accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'completed', 'rejected', 'cancelled'];
const LIMIT = 25;

export function OrdersPage() {
  const { t, money, dateTime } = useI18n();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [offset, setOffset] = useState(0);
  const dq = useDebounced(q, 350);
  const r = useQuery({
    queryKey: ['a', 'orders', dq, status, type, offset],
    queryFn: () => api.get<Page<Order>>('/admin/orders', { query: { q: dq || undefined, status: status || undefined, type: type || undefined, limit: LIMIT, offset } }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader title={t('nav.orders')} description={t('orders.hint')} />
      <Card flush title={
        <div className="row grow">
          <Input type="search" aria-label={t('common.search')} placeholder={t('orders.search')} value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} fieldClassName="grow" />
          <Select aria-label={t('common.status')} value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} placeholder={t('common.all')} options={STATUSES.map((s) => ({ value: s, label: t(`order.status.${s}`) }))} />
          <Select aria-label={t('common.type')} value={type} onChange={(e) => { setType(e.target.value); setOffset(0); }} placeholder={t('common.all')} options={(['marketplace', 'merchant_delivery', 'c2c'] as const).map((s) => ({ value: s, label: t(`order.type.${s}`) }))} />
        </div>
      }>
        {r.isLoading ? <Loading /> : r.isError ? <ErrorState error={r.error} onRetry={() => r.refetch()} /> : !r.data?.items.length ? <EmptyState icon="orders" title={t('orders.empty')} /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>{t('orders.number')}</th><th>{t('common.date')}</th><th>{t('common.type')}</th><th>{t('orders.merchant')}</th><th>{t('orders.customer')}</th><th>{t('common.status')}</th><th>{t('orders.delivery')}</th><th className="num">{t('common.total')}</th></tr></thead>
              <tbody>{r.data.items.map((o) => (
                <tr key={o.id} className="clickable" tabIndex={0} onClick={() => nav(`/orders/${o.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') nav(`/orders/${o.id}`); }}>
                  <td className="strong ltr">#{o.number}</td>
                  <td className="nowrap">{dateTime(o.createdAt)}</td>
                  <td>{t(`order.type.${o.type}`)}</td>
                  <td>{o.merchant?.nameEn ?? '—'}</td>
                  <td>{o.customerName ?? '—'}<div className="text-xs muted ltr">{o.customerPhone}</div></td>
                  <td><StatusBadge status={o.status} /></td>
                  <td>{o.delivery ? <StatusBadge kind="delivery" status={o.delivery.status} /> : '—'}</td>
                  <td className="num strong">{money(o.totalBaisa)}<div className="text-xs muted">{t(`payment.method.${o.paymentMethod}`)}</div></td>
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

export function OrderDetailPage() {
  const { id } = useParams();
  const { t, money, pick, dateTime, num } = useI18n();
  const { can } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState<number | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const q = useQuery({ queryKey: ['a', 'order', id], queryFn: () => api.get<Order>(`/orders/${id}`), refetchInterval: 15_000 });
  const cancel = useMutation({
    mutationFn: (reason: string) => api.post<Order>(`/admin/orders/${id}/cancel`, { reason }),
    onSuccess: (o) => { qc.setQueryData(['a', 'order', id], o); setCancelOpen(false); toast.push(t('orders.cancelled')); },
  });
  const refund = useMutation({
    mutationFn: () => api.post<{ order: Order }>(`/admin/orders/${id}/refund`, { amountBaisa: refundAmount, reason: refundReason.trim() }),
    onSuccess: (r) => { qc.setQueryData(['a', 'order', id], r.order); setRefundOpen(false); toast.push(t('orders.refunded')); },
  });
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const o = q.data;
  const d = o.delivery;
  const pts = d ? [d.pickup.location, d.dropoff.location, d.captain?.location ?? null].filter((x): x is { lat: number; lng: number } => !!x) : [];
  const final = ['delivered', 'completed', 'rejected', 'cancelled'].includes(o.status);
  return (
    <>
      <PageHeader title={<span className="ltr">#{o.number}</span>} description={`${t(`order.type.${o.type}`)} · ${dateTime(o.createdAt)}`}
        actions={<>
          <Link className="btn btn--ghost" to="/orders">{t('common.back')}</Link>
          {o.invoiceUrl ? <LinkButton href={o.invoiceUrl} external icon="file" aria-label={t('invoice.openLabel')}>{t('invoice.open')}</LinkButton> : null}
          {can('orders:refund') && o.paymentMethod === 'online' && ['paid', 'partially_refunded'].includes(o.paymentStatus) ? <Button onClick={() => { refund.reset(); setRefundAmount(o.totalBaisa); setRefundReason(''); setRefundOpen(true); }}>{t('orders.refund')}</Button> : null}
          {can('orders:manage') && !final ? <Button variant="danger-outline" onClick={() => { cancel.reset(); setCancelOpen(true); }}>{t('orders.cancel')}</Button> : null}
        </>} />
      <div className="row"><StatusBadge status={o.status} /><Badge>{t(`payment.method.${o.paymentMethod}`)}</Badge><Badge tone={o.paymentStatus === 'paid' ? 'success' : 'neutral'}>{t(`payment.status.${o.paymentStatus}`)}</Badge>{o.source ? <Badge>{o.source}</Badge> : null}</div>
      {o.cancelReason ? <Alert tone="danger">{t('orders.cancelReason')}: {o.cancelReason}</Alert> : null}
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="stack stack-lg">
          <Card title={t('orders.items')}>
            {o.items.length ? <ul className="item-list">{o.items.map((i) => (
              <li key={i.id}><div className="row between row-nowrap"><span><strong>{num(i.quantity, 0)}×</strong> {pick(i.nameEn, i.nameAr)}</span><span>{money(i.lineTotalBaisa)}</span></div>
                {i.options?.length ? <div className="text-xs muted">{i.options.map((op) => pick(op.nameEn, op.nameAr)).join(' · ')}</div> : null}{i.notes ? <div className="text-xs">“{i.notes}”</div> : null}</li>
            ))}</ul> : <p className="muted">{d?.packageDescription ?? '—'}</p>}
            <hr className="divider" />
            <dl className="dl">
              <dt>{t('orders.subtotal')}</dt><dd>{money(o.subtotalBaisa)}</dd>
              <dt>{t('orders.deliveryFee')}</dt><dd>{money(o.deliveryFeeBaisa)}</dd>
              <dt>{t('orders.serviceFee')}</dt><dd>{money(o.serviceFeeBaisa)}</dd>
              <dt>{t('orders.vat')}</dt><dd>{money(o.vatBaisa)}</dd>
              <dt className="strong">{t('common.total')}</dt><dd className="strong">{money(o.totalBaisa)}</dd>
              {o.codAmountBaisa ? <><dt>{t('orders.cod')}</dt><dd>{money(o.codAmountBaisa)}</dd></> : null}
              {o.commissionBaisa != null ? <><dt>{t('orders.commission')}</dt><dd>{money(o.commissionBaisa)}</dd></> : null}
            </dl>
          </Card>
          <Card title={t('orders.parties')}>
            <dl className="dl">
              <dt>{t('orders.merchant')}</dt><dd>{o.merchant ? <Link to={`/merchants/${o.merchant.id}`}>{o.merchant.nameEn}</Link> : '—'}</dd>
              <dt>{t('orders.customer')}</dt><dd>{o.customerName ?? '—'} <span className="ltr">{o.customerPhone}</span></dd>
              {o.notes ? <><dt>{t('common.notes')}</dt><dd>{o.notes}</dd></> : null}
            </dl>
          </Card>
          <Card title={t('orders.timeline')}>
            <ol className="timeline">{o.timeline.map((e, i) => <li key={i}><strong>{t(`order.status.${e.status}`)}</strong> · <span className="muted">{dateTime(e.at)}</span>{e.note ? <div className="text-xs muted">{e.note}</div> : null}</li>)}</ol>
          </Card>
        </div>
        {d ? (
          <Card title={t('orders.delivery')} actions={<StatusBadge kind="delivery" status={d.status} />}>
            <div className="stack">
              {pts.length ? (
                <MapView height={300} center={pts[0]}>
                  <FitBounds points={pts} fitKey={o.id} />
                  {d.pickup.location ? <Marker position={[d.pickup.location.lat, d.pickup.location.lng]} icon={pinIcon(PICKUP_COLOR)} /> : null}
                  {d.dropoff.location ? <Marker position={[d.dropoff.location.lat, d.dropoff.location.lng]} icon={pinIcon(DROPOFF_COLOR)} /> : null}
                  {d.captain?.location ? <Marker position={[d.captain.location.lat, d.captain.location.lng]} icon={captainIcon(true, d.captain.firstName[0])} /> : null}
                </MapView>
              ) : null}
              <dl className="dl">
                <dt>{t('ops.pickup')}</dt><dd>{d.pickup.address}</dd>
                <dt>{t('ops.dropoff')}</dt><dd>{d.dropoff.address}</dd>
                <dt>{t('ops.captain')}</dt><dd>{d.captain ? `${d.captain.firstName} · ${d.captain.vehiclePlate ?? ''}` : '—'}</dd>
                <dt>{t('ops.fee')}</dt><dd>{money(d.feeBaisa)}</dd>
                {d.deliveryPin ? <><dt>{t('orders.pin')}</dt><dd className="mono">{d.deliveryPin}</dd></> : null}
                {d.failureReason ? <><dt>{t('orders.failure')}</dt><dd className="danger-text">{d.failureReason}</dd></> : null}
              </dl>
            </div>
          </Card>
        ) : null}
      </div>
      <ConfirmDialog open={cancelOpen} tone="danger" title={t('orders.cancelTitle', { number: o.number })} message={t('orders.cancelBody')} reasonLabel={t('common.reason')} reasonRequired
        confirmLabel={t('orders.cancel')} loading={cancel.isPending} error={cancel.isError ? errorMessage(cancel.error, t) : null} onClose={() => setCancelOpen(false)} onConfirm={(r) => cancel.mutate(r)} />
      <Modal open={refundOpen} onClose={() => setRefundOpen(false)} title={t('orders.refundTitle', { number: o.number })}
        footer={<><Button onClick={() => setRefundOpen(false)}>{t('common.cancel')}</Button><Button variant="danger" loading={refund.isPending} disabled={!refundAmount || refundAmount <= 0 || refundReason.trim().length < 3} onClick={() => refund.mutate()}>{t('orders.refund')}</Button></>}>
        <div className="stack">
          <MoneyInput label={t('common.amount')} valueBaisa={refundAmount} onChangeBaisa={setRefundAmount} hint={t('orders.refundHint', { amount: money(o.totalBaisa) })} />
          <Textarea label={t('common.reason')} rows={3} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} required />
          {refund.isError ? <Alert tone="danger">{errorMessage(refund.error, t)}</Alert> : null}
        </div>
      </Modal>
    </>
  );
}
