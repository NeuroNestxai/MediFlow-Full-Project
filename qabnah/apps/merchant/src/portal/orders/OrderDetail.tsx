import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Badge, Button, Drawer, ErrorState, Icon, LinkButton, Loading, StatusBadge, FINAL_ORDER_STATUSES, merchantActionsFor, useI18n, useRealtimeChannel,
  type LatLng, type Order,
} from '@qabnah/shared';
import { DROPOFF_COLOR, FitBounds, MapView, Marker, PICKUP_COLOR, Tooltip, captainIcon, pinIcon } from '@qabnah/shared/map';
import { merchantApi, merchantRealtime } from '../../api';
import { useSession } from '../session';
import { ACTION_VARIANT } from './OrderCard';
import { useOrderActions } from './useOrderActions';

export function useMerchantOrder(orderId: string | null) {
  const { merchantId } = useSession();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['m', 'order', merchantId, orderId],
    queryFn: () => merchantApi.get<Order>(`/merchants/${merchantId}/orders/${orderId}`),
    enabled: !!orderId && !!merchantId,
    refetchInterval: (query) => (query.state.data && FINAL_ORDER_STATUSES.includes(query.state.data.status) ? false : 15_000),
  });
  useRealtimeChannel(merchantRealtime, orderId ? `order:${orderId}` : null, () => {
    void qc.invalidateQueries({ queryKey: ['m', 'order', merchantId, orderId] });
  });
  return q;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`row between ${strong ? 'strong' : ''}`}><span className={strong ? '' : 'muted'}>{label}</span><span className="num">{value}</span></div>;
}

export function OrderMap({ order, height = 260 }: { order: Order; height?: number }) {
  const { t } = useI18n();
  const d = order.delivery;
  const pickupIcon = useMemo(() => pinIcon(PICKUP_COLOR), []);
  const dropIcon = useMemo(() => pinIcon(DROPOFF_COLOR), []);
  if (!d) return null;
  const pts: LatLng[] = [d.pickup.location, d.dropoff.location, d.captain?.location ?? null].filter((x): x is LatLng => !!x);
  return (
    <MapView height={height} center={pts[0]} ariaLabel={t('orders.map')}>
      <FitBounds points={pts} fitKey={order.id} />
      {d.pickup.location ? <Marker position={[d.pickup.location.lat, d.pickup.location.lng]} icon={pickupIcon}><Tooltip>{t('orders.pickup')}</Tooltip></Marker> : null}
      {d.dropoff.location ? <Marker position={[d.dropoff.location.lat, d.dropoff.location.lng]} icon={dropIcon}><Tooltip>{t('orders.dropoff')}</Tooltip></Marker> : null}
      {d.captain?.location ? <Marker position={[d.captain.location.lat, d.captain.location.lng]} icon={captainIcon(true, (d.captain.firstName[0] ?? 'C').toUpperCase())}><Tooltip>{d.captain.firstName}</Tooltip></Marker> : null}
    </MapView>
  );
}

export function OrderDetailBody({ order, showMap }: { order: Order; showMap?: boolean }) {
  const { t, money, pick, dateTime, time, num } = useI18n();
  const d = order.delivery;
  return (
    <>
      <div className="row">
        <StatusBadge status={order.status} />
        <Badge tone="primary">{t(`order.type.${order.type}`)}</Badge>
        <Badge tone={order.paymentMethod === 'cod' ? 'warning' : 'success'}>{t(`payment.method.${order.paymentMethod}`)}</Badge>
        <Badge>{t(`payment.status.${order.paymentStatus}`)}</Badge>
      </div>
      {order.cancelReason ? <div className="alert alert--danger"><Icon name="alert" /><div>{t('orders.cancelReason')}: {order.cancelReason}</div></div> : null}

      {order.items.length ? (
        <section className="stack stack-sm" aria-labelledby="od-items">
          <h3 id="od-items">{t('orders.items')}</h3>
          <ul className="item-list">
            {order.items.map((i) => (
              <li key={i.id}>
                <div className="row between row-nowrap">
                  <span><span className="strong">{num(i.quantity, 0)}×</span> {pick(i.nameEn, i.nameAr)}</span>
                  <span className="num">{money(i.lineTotalBaisa)}</span>
                </div>
                {i.options?.length ? (
                  <ul className="text-sm muted option-list">
                    {i.options.map((o, k) => (
                      <li key={k}>{o.groupNameEn || o.groupNameAr ? `${pick(o.groupNameEn, o.groupNameAr)}: ` : ''}{pick(o.nameEn, o.nameAr)}{o.priceDeltaBaisa ? ` (${money(o.priceDeltaBaisa, { signed: true })})` : ''}</li>
                    ))}
                  </ul>
                ) : null}
                {i.notes ? <div className="text-sm"><Icon name="edit" width={14} height={14} /> {i.notes}</div> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {order.notes ? <div className="alert alert--info"><Icon name="info" /><div><strong>{t('common.notes')}:</strong> {order.notes}</div></div> : null}

      <section className="stack stack-sm" aria-labelledby="od-cust">
        <h3 id="od-cust">{t('orders.customer')}</h3>
        <dl className="dl">
          <dt>{t('common.name')}</dt><dd>{order.customerName ?? d?.dropoff.contactName ?? '—'}</dd>
          <dt>{t('common.phone')}</dt><dd>{(order.customerPhone ?? d?.dropoff.contactPhone) ? <a className="ltr" href={`tel:${order.customerPhone ?? d?.dropoff.contactPhone}`}>{order.customerPhone ?? d?.dropoff.contactPhone}</a> : '—'}</dd>
          {d ? <><dt>{t('orders.dropoff')}</dt><dd>{d.dropoff.address ?? '—'}</dd></> : null}
          <dt>{t('orders.placedAt')}</dt><dd>{dateTime(order.placedAt ?? order.createdAt)}</dd>
          {order.prepTimeMinutes != null && order.type === 'marketplace' ? <><dt>{t('orders.prepTime')}</dt><dd>{t('common.minutes', { n: num(order.prepTimeMinutes, 0) })}</dd></> : null}
        </dl>
      </section>

      <section className="stack stack-sm" aria-labelledby="od-totals">
        <h3 id="od-totals">{t('orders.totals')}</h3>
        <div className="stack stack-sm text-sm">
          {order.subtotalBaisa ? <Row label={t('orders.subtotal')} value={money(order.subtotalBaisa)} /> : null}
          <Row label={t('orders.deliveryFee')} value={money(order.deliveryFeeBaisa)} />
          {order.serviceFeeBaisa ? <Row label={t('orders.serviceFee')} value={money(order.serviceFeeBaisa)} /> : null}
          {order.discountBaisa ? <Row label={t('orders.discount')} value={money(-order.discountBaisa)} /> : null}
          {order.vatBaisa ? <Row label={t('orders.vat')} value={money(order.vatBaisa)} /> : null}
          <Row label={t('common.total')} value={money(order.totalBaisa)} strong />
          {order.codAmountBaisa ? <Row label={t('orders.codToCollect')} value={money(order.codAmountBaisa)} /> : null}
          {order.commissionBaisa ? <Row label={t('orders.commission')} value={money(order.commissionBaisa)} /> : null}
        </div>
      </section>

      {d ? (
        <section className="stack stack-sm" aria-labelledby="od-del">
          <div className="row between">
            <h3 id="od-del">{t('orders.delivery')}</h3>
            <StatusBadge kind="delivery" status={d.status} />
          </div>
          {d.deliveryPin && !['delivered', 'cancelled', 'returned'].includes(d.status) ? (
            <div className="pin-box" aria-label={t('orders.pin')}>
              <span className="text-sm muted">{t('orders.pin')}</span>
              <span className="pin-box__code ltr">{d.deliveryPin}</span>
              <span className="text-xs muted">{t('orders.pinHint')}</span>
            </div>
          ) : null}
          <dl className="dl">
            {d.captain ? (
              <>
                <dt>{t('orders.captain')}</dt>
                <dd>{d.captain.firstName} · {t(`vehicle.${d.captain.vehicleType}`)}{d.captain.vehiclePlate ? <> · <span className="ltr">{d.captain.vehiclePlate}</span></> : null}</dd>
                {d.captain.phone ? <><dt>{t('orders.captainPhone')}</dt><dd><a className="ltr" href={`tel:${d.captain.phone}`}>{d.captain.phone}</a></dd></> : null}
              </>
            ) : <><dt>{t('orders.captain')}</dt><dd className="muted">{t('orders.noCaptainYet')}</dd></>}
            {d.etaPickupAt && !d.pickedUpAt ? <><dt>{t('orders.etaPickup')}</dt><dd>{time(d.etaPickupAt)}</dd></> : null}
            {d.etaDropoffAt && !d.deliveredAt ? <><dt>{t('orders.etaDropoff')}</dt><dd>{time(d.etaDropoffAt)}</dd></> : null}
            {d.packageDescription ? <><dt>{t('delivery.package')}</dt><dd>{d.packageDescription}</dd></> : null}
            {d.failureReason ? <><dt>{t('orders.failure')}</dt><dd className="danger-text">{d.failureReason}</dd></> : null}
          </dl>
          {showMap ? <OrderMap order={order} /> : null}
        </section>
      ) : null}

      {order.timeline?.length ? (
        <section className="stack stack-sm" aria-labelledby="od-tl">
          <h3 id="od-tl">{t('orders.timeline')}</h3>
          <ol className="timeline">
            {order.timeline.map((e, i) => (
              <li key={i}><span className="strong">{t(`order.status.${e.status}`)}</span> · <span className="muted">{dateTime(e.at)}</span>{e.note ? <div className="text-sm muted">{e.note}</div> : null}</li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}

export function InvoiceButton({ order }: { order: Order }) {
  const { t } = useI18n();
  if (!order.invoiceUrl) return null;
  return <LinkButton href={order.invoiceUrl} external icon="file" aria-label={t('invoice.openLabel')}>{t('invoice.open')}</LinkButton>;
}

export function OrderActionsBar({ order }: { order: Order }) {
  const { t } = useI18n();
  const { perms } = useSession();
  const { run, dialogs, busy } = useOrderActions();
  const actions = merchantActionsFor(order, perms);
  return (
    <>
      <InvoiceButton order={order} />
      {actions.map((a) => <Button key={a} variant={ACTION_VARIANT[a]} disabled={busy} onClick={() => run(order, a)}>{t(`orders.action.${a}`)}</Button>)}
      {dialogs}
    </>
  );
}

export function OrderDrawer({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const q = useMerchantOrder(orderId);
  const o = q.data;
  return (
    <Drawer open={!!orderId} onClose={onClose} title={o ? <span className="ltr">#{o.number}</span> : t('common.loading')}
      subtitle={o ? <Link to={`/orders/${o.id}`}>{t('orders.openFull')}</Link> : undefined}
      footer={o ? <OrderActionsBar order={o} /> : undefined}>
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : o ? <OrderDetailBody order={o} showMap /> : null}
    </Drawer>
  );
}
