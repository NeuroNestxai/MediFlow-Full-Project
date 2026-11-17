import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, Badge, Button, Card, ConfirmDialog, ErrorState, Icon, Loading, StatusBadge, Textarea, FINAL_ORDER_STATUSES, errorMessage, orderProgress, useI18n,
  useRealtimeChannel, useToast, type LatLng, type Order, type PaymentStatus, type Tracking, type Checkout,
} from '@qabnah/shared';
import { DROPOFF_COLOR, FitBounds, MapView, Marker, PICKUP_COLOR, Polyline, Tooltip, captainIcon, pinIcon } from '@qabnah/shared/map';
import { consumerApi, consumerRealtime } from '../api';
import { OtpSignIn, useConsumer } from './ConsumerAuth';
import { useStorefront } from './StorefrontLayout';

function Stars({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="stars" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n}/5`} className={`stars__star ${n <= value ? 'stars__star--on' : ''}`} onClick={() => onChange(n)}>★</button>
      ))}
    </div>
  );
}

function RatingCard({ order }: { order: Order }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [captain, setCaptain] = useState(0);
  const [merchant, setMerchant] = useState(0);
  const [comment, setComment] = useState('');
  const m = useMutation({
    mutationFn: () => consumerApi.post(`/orders/${order.id}/rating`, {
      ...(captain ? { captain: { score: captain } } : {}), ...(merchant ? { merchant: { score: merchant, ...(comment.trim() ? { comment: comment.trim() } : {}) } } : {}),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['c', 'order', order.id] }),
  });
  if (order.rated || m.isSuccess) return <Alert tone="success">{t('sf.thanksRating')}</Alert>;
  return (
    <Card title={t('sf.rateTitle')}>
      <div className="stack">
        {order.delivery?.captain ? <div className="row between"><span>{t('sf.rateCaptain', { name: order.delivery.captain.firstName })}</span><Stars value={captain} onChange={setCaptain} label={t('sf.rateCaptainLabel')} /></div> : null}
        <div className="row between"><span>{t('sf.rateStore')}</span><Stars value={merchant} onChange={setMerchant} label={t('sf.rateStoreLabel')} /></div>
        <Textarea label={t('sf.comment')} rows={2} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} optional />
        {m.isError ? <Alert tone="danger">{errorMessage(m.error, t)}</Alert> : null}
        <div><Button variant="primary" className="sf-primary" disabled={!captain && !merchant} loading={m.isPending} onClick={() => m.mutate()}>{t('sf.submitRating')}</Button></div>
      </div>
    </Card>
  );
}

function TrackingMap({ order, tracking, storeName }: { order: Order; tracking: Tracking | undefined; storeName: string }) {
  const { t } = useI18n();
  const d = order.delivery;
  const pIcon = useMemo(() => pinIcon(PICKUP_COLOR), []);
  const dIcon = useMemo(() => pinIcon(DROPOFF_COLOR), []);
  const pickup = tracking?.pickup ?? d?.pickup.location ?? null;
  const dropoff = tracking?.dropoff ?? d?.dropoff.location ?? null;
  const cap = tracking?.captain?.location ?? d?.captain?.location ?? null;
  const pts = [pickup, dropoff, cap].filter((x): x is LatLng => !!x);
  if (!pts.length) return null;
  return (
    <MapView height={320} center={pts[0]} ariaLabel={t('orders.liveTracking')}>
      <FitBounds points={pts} fitKey={`${order.id}-${cap ? 'c' : 'n'}`} />
      {pickup ? <Marker position={[pickup.lat, pickup.lng]} icon={pIcon}><Tooltip>{storeName}</Tooltip></Marker> : null}
      {dropoff ? <Marker position={[dropoff.lat, dropoff.lng]} icon={dIcon}><Tooltip>{t('sf.you')}</Tooltip></Marker> : null}
      {tracking?.path?.length ? <Polyline positions={tracking.path.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: '#0E7C66', weight: 4, opacity: 0.7 }} /> : null}
      {cap ? <Marker position={[cap.lat, cap.lng]} icon={captainIcon(true, (tracking?.captain?.firstName ?? d?.captain?.firstName ?? 'C')[0].toUpperCase())}><Tooltip permanent direction="top">{tracking?.captain?.firstName ?? d?.captain?.firstName}</Tooltip></Marker> : null}
    </MapView>
  );
}

export function OrderStatusPage() {
  const { id } = useParams();
  const { sf } = useStorefront();
  const { t, pick, money, num, time, dateTime } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const { signedIn, loading } = useConsumer();
  const [params, setParams] = useSearchParams();
  const paymentId = params.get('paymentId');
  const [cancelOpen, setCancelOpen] = useState(false);

  const pay = useQuery({
    queryKey: ['c', 'payment', paymentId],
    queryFn: () => consumerApi.get<PaymentStatus>(`/payments/${paymentId}`, { auth: false }),
    enabled: !!paymentId,
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 2000 : false),
  });
  const order = useQuery({
    queryKey: ['c', 'order', id],
    queryFn: () => consumerApi.get<Order>(`/orders/${id}`),
    enabled: signedIn && !!id,
    refetchInterval: (q) => (q.state.data && FINAL_ORDER_STATUSES.includes(q.state.data.status) ? false : 10_000),
  });
  const active = !!order.data?.delivery && !FINAL_ORDER_STATUSES.includes(order.data.status);
  const tracking = useQuery({
    queryKey: ['c', 'tracking', id],
    queryFn: () => consumerApi.get<Tracking>(`/orders/${id}/tracking`),
    enabled: signedIn && active,
    refetchInterval: 10_000,
  });
  useEffect(() => { if (pay.data && pay.data.status !== 'pending') void qc.invalidateQueries({ queryKey: ['c', 'order', id] }); }, [pay.data, qc, id]);
  useRealtimeChannel(consumerRealtime, signedIn && id ? `order:${id}` : null, (e) => {
    if (e.event === 'delivery.location') {
      const p = e.data as { lat: number; lng: number; heading?: number };
      qc.setQueryData<Tracking>(['c', 'tracking', id], (old) => (old && old.captain ? { ...old, captain: { ...old.captain, location: { lat: p.lat, lng: p.lng, heading: p.heading ?? null, updatedAt: new Date().toISOString() } }, path: [...old.path, { lat: p.lat, lng: p.lng }].slice(-200) } : old));
    } else {
      void qc.invalidateQueries({ queryKey: ['c', 'order', id] });
      void qc.invalidateQueries({ queryKey: ['c', 'tracking', id] });
    }
  });

  const retryPay = useMutation({
    mutationFn: () => consumerApi.post<Checkout>(`/orders/${id}/checkout`, { returnUrl: `${window.location.origin}/s/${sf.merchant.slug}/orders/${id}` }),
    onSuccess: (c) => window.location.assign(c.checkoutUrl),
    onError: (e) => toast.push(errorMessage(e, t), 'danger'),
  });
  const cancel = useMutation({
    mutationFn: (reason: string) => consumerApi.post<Order>(`/orders/${id}/cancel`, { reason: reason || undefined }),
    onSuccess: (o) => { qc.setQueryData(['c', 'order', id], o); setCancelOpen(false); toast.push(t('sf.cancelled')); },
  });

  if (loading) return <Loading />;
  if (!signedIn) {
    return <main className="sf-container"><Card title={t('sf.signInToTrack')}><OtpSignIn /></Card></main>;
  }
  if (order.isLoading) return <Loading />;
  if (order.isError || !order.data) return <main className="sf-container"><Card><ErrorState error={order.error} onRetry={() => order.refetch()} /></Card></main>;
  const o = order.data;
  const d = o.delivery;
  const { steps, current } = orderProgress(o);
  const failedPayment = o.status === 'pending_payment' && (pay.data?.status === 'failed' || params.get('outcome') === 'cancel' || o.paymentStatus === 'failed');
  const eta = tracking.data?.etaDropoffAt ?? d?.etaDropoffAt;
  return (
    <main className="sf-container stack stack-lg">
      <div className="row between">
        <div className="stack" style={{ ['--gap' as string]: '2px' }}>
          <h1>{t('sf.orderTitle')} <span className="ltr">#{o.number}</span></h1>
          <span className="text-sm muted">{dateTime(o.createdAt)}</span>
        </div>
        <StatusBadge status={o.status} />
      </div>
      {paymentId && pay.isLoading ? <Alert tone="info">{t('sf.checkingPayment')}</Alert> : null}
      {pay.data?.status === 'paid' ? <Alert tone="success" title={t('sf.paymentReceived')}>{t('sf.paymentReceivedBody')}</Alert> : null}
      {failedPayment ? (
        <Alert tone="danger" title={t('sf.paymentFailed')} action={<Button size="sm" variant="primary" className="sf-primary" loading={retryPay.isPending} onClick={() => { setParams({}); retryPay.mutate(); }}>{t('sf.tryAgain')}</Button>}>{t('sf.paymentFailedBody')}</Alert>
      ) : o.status === 'pending_payment' ? (
        <Alert tone="warning" title={t('sf.awaitingPayment')} action={<Button size="sm" variant="primary" className="sf-primary" loading={retryPay.isPending} onClick={() => retryPay.mutate()}>{t('sf.payNow')}</Button>}>{t('sf.awaitingPaymentBody')}</Alert>
      ) : null}
      {o.status === 'rejected' || o.status === 'cancelled' ? <Alert tone="danger" title={t(`order.status.${o.status}`)}>{o.cancelReason}</Alert> : null}

      {current >= 0 ? (
        <Card>
          <ol className="progress" aria-label={t('sf.progress')}>
            {steps.map((s, i) => (
              <li key={s} className={`progress__step ${i < current ? 'progress__step--done' : ''} ${i === current ? 'progress__step--current' : ''}`} aria-current={i === current ? 'step' : undefined}>
                <span className="progress__dot" aria-hidden="true">{i < current ? '✓' : num(i + 1, 0)}</span>
                <span className="progress__label">{t(`sf.step.${s}`)}</span>
              </li>
            ))}
          </ol>
          {eta && !['delivered', 'completed'].includes(o.status) ? <p className="text-sm muted" style={{ marginBlockStart: 12 }}><Icon name="clock" width={15} height={15} /> {t('sf.etaAt', { time: time(eta) })}</p> : null}
        </Card>
      ) : null}

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="stack stack-lg">
          {d?.deliveryPin && !['delivered', 'completed', 'cancelled', 'rejected'].includes(o.status) ? (
            <div className="pin-box pin-box--brand" data-testid="delivery-pin">
              <span className="text-sm">{t('sf.pinLabel')}</span>
              <span className="pin-box__code ltr">{d.deliveryPin}</span>
              <span className="text-xs">{t('sf.pinHint')}</span>
            </div>
          ) : null}
          {d ? (
            <Card title={t('orders.delivery')} actions={<StatusBadge kind="delivery" status={d.status} />}>
              <div className="stack">
                {d.captain ? (
                  <div className="row between">
                    <div className="stack" style={{ ['--gap' as string]: '0px' }}>
                      <strong>{d.captain.firstName}</strong>
                      <span className="text-sm muted">{t(`vehicle.${d.captain.vehicleType}`)}{d.captain.vehicleColor ? ` · ${d.captain.vehicleColor}` : ''}{d.captain.vehiclePlate ? <> · <span className="ltr">{d.captain.vehiclePlate}</span></> : null}</span>
                    </div>
                    {d.captain.phone ? <a className="btn btn--sm" href={`tel:${d.captain.phone}`}><Icon name="phone" />{t('sf.call')}</a> : null}
                  </div>
                ) : <p className="muted">{FINAL_ORDER_STATUSES.includes(o.status) ? '—' : t('sf.findingCaptain')}</p>}
                {active ? <TrackingMap order={o} tracking={tracking.data} storeName={pick(sf.merchant.nameEn, sf.merchant.nameAr)} /> : null}
                <p className="text-sm"><Icon name="pin" width={15} height={15} /> {d.dropoff.address}</p>
              </div>
            </Card>
          ) : null}
          {['delivered', 'completed'].includes(o.status) ? <RatingCard order={o} /> : null}
        </div>
        <Card title={t('sf.summary')}>
          <div className="stack">
            <ul className="item-list">
              {o.items.map((i) => (
                <li key={i.id}>
                  <div className="row between row-nowrap"><span><span className="strong">{num(i.quantity, 0)}×</span> {pick(i.nameEn, i.nameAr)}</span><span className="num">{money(i.lineTotalBaisa)}</span></div>
                  {i.options?.length ? <div className="text-xs muted">{i.options.map((op) => pick(op.nameEn, op.nameAr)).join(' · ')}</div> : null}
                </li>
              ))}
            </ul>
            <hr className="divider" />
            <div className="stack stack-sm text-sm">
              <div className="row between"><span className="muted">{t('orders.subtotal')}</span><span>{money(o.subtotalBaisa)}</span></div>
              <div className="row between"><span className="muted">{t('orders.deliveryFee')}</span><span>{money(o.deliveryFeeBaisa)}</span></div>
              {o.serviceFeeBaisa ? <div className="row between"><span className="muted">{t('orders.serviceFee')}</span><span>{money(o.serviceFeeBaisa)}</span></div> : null}
              <div className="row between text-lg strong"><span>{t('common.total')}</span><span>{money(o.totalBaisa)}</span></div>
              <div className="row between"><span className="muted">{t('orders.payment')}</span><span><Badge>{t(`payment.method.${o.paymentMethod}`)}</Badge> <Badge tone={o.paymentStatus === 'paid' ? 'success' : 'neutral'}>{t(`payment.status.${o.paymentStatus}`)}</Badge></span></div>
            </div>
            {o.invoiceUrl ? <a className="btn" href={o.invoiceUrl} target="_blank" rel="noopener noreferrer" aria-label={t('invoice.openLabel')} data-testid="invoice-link"><Icon name="file" />{t('invoice.open')}</a> : null}
            {['pending_payment', 'placed'].includes(o.status) ? <Button variant="danger-outline" onClick={() => setCancelOpen(true)}>{t('sf.cancelOrder')}</Button> : null}
            <Link to={`/s/${sf.merchant.slug}`} className="btn btn--ghost">{t('sf.backToMenu')}</Link>
          </div>
        </Card>
      </div>
      <ConfirmDialog open={cancelOpen} tone="danger" title={t('sf.cancelOrder')} message={t('sf.cancelBody')} reasonLabel={t('common.reason')} confirmLabel={t('sf.cancelOrder')}
        loading={cancel.isPending} error={cancel.isError ? errorMessage(cancel.error, t) : null} onClose={() => setCancelOpen(false)} onConfirm={(r) => cancel.mutate(r)} />
    </main>
  );
}
