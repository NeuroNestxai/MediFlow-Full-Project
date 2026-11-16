import { Badge, Button, StatusBadge, merchantActionsFor, useI18n, useNow, type MerchantAction, type Order } from '@qabnah/shared';

export const ACTION_VARIANT: Record<MerchantAction, 'primary' | 'secondary' | 'danger-outline' | 'accent'> = {
  accept: 'primary', reject: 'danger-outline', preparing: 'secondary', ready: 'accent', cancel: 'danger-outline',
};

/** Compact order card for the live board. Shows only the actions allowed by status + permissions. */
export function OrderCard({ order, perms, onAction, onOpen, highlight, busy }: {
  order: Order; perms: readonly string[]; onAction: (a: MerchantAction) => void; onOpen: () => void; highlight?: boolean; busy?: boolean;
}) {
  const { t, money, pick, relative, num } = useI18n();
  useNow(30_000);
  const actions = merchantActionsFor(order, perms);
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
  // Cancel stays in the drawer to avoid accidental taps on the board.
  const boardActions = actions.filter((a) => a !== 'cancel');
  return (
    <article className={`order-card ${highlight ? 'order-card--new' : ''}`} aria-labelledby={`oc-${order.id}`} data-testid="order-card" data-status={order.status}>
      <button type="button" className="order-card__main" onClick={onOpen} aria-label={t('orders.openOrder', { number: order.number })}>
        <div className="row between row-nowrap">
          <span id={`oc-${order.id}`} className="strong ltr">#{order.number}</span>
          <span className="text-xs muted">{relative(order.placedAt ?? order.createdAt)}</span>
        </div>
        <div className="row between row-nowrap">
          <span className="truncate">{order.customerName ?? order.delivery?.dropoff.contactName ?? t('orders.walkIn')}</span>
          <span className="strong num nowrap">{money(order.totalBaisa)}</span>
        </div>
        <div className="text-sm muted truncate">
          {order.type === 'merchant_delivery'
            ? order.delivery?.packageDescription ?? t('order.type.merchant_delivery')
            : order.items.slice(0, 3).map((i) => `${num(i.quantity, 0)}× ${pick(i.nameEn, i.nameAr)}`).join(' · ')}
          {order.type !== 'merchant_delivery' && order.items.length > 3 ? ' …' : ''}
        </div>
        <div className="row" style={{ ['--gap' as string]: '6px' }}>
          <Badge tone={order.paymentMethod === 'cod' ? 'warning' : 'success'}>{t(`payment.method.${order.paymentMethod}`)}</Badge>
          {order.type !== 'marketplace' ? <Badge tone="primary">{t(`order.type.${order.type}`)}</Badge> : null}
          {order.delivery && order.status !== 'placed' ? <StatusBadge kind="delivery" status={order.delivery.status} /> : null}
          {order.notes ? <Badge tone="info">{t('orders.hasNotes')}</Badge> : null}
          {order.type !== 'merchant_delivery' ? <span className="text-xs muted">{t('common.items', { n: num(itemCount, 0) })}</span> : null}
        </div>
      </button>
      {boardActions.length ? (
        <div className="order-card__actions">
          {boardActions.map((a) => (
            <Button key={a} size="sm" variant={ACTION_VARIANT[a]} disabled={busy} onClick={() => onAction(a)}>{t(`orders.action.${a}`)}</Button>
          ))}
        </div>
      ) : null}
    </article>
  );
}
