import { Badge, Button, Photo, Price, StatusBadge, merchantActionsFor, useI18n, useNow, type MerchantAction, type Order } from '@qabnah/shared';

export const ACTION_VARIANT: Record<MerchantAction, 'primary' | 'secondary' | 'danger-outline' | 'accent'> = {
  accept: 'primary', reject: 'danger-outline', preparing: 'secondary', ready: 'primary', cancel: 'danger-outline',
};

/**
 * Order card for the live board: photo of the first item, number + age, customer, items summary, payment pill and
 * the primary action full width at the bottom. Shows only the actions allowed by status + permissions.
 */
export function OrderCard({ order, perms, onAction, onOpen, highlight, busy, thumbUrl, category }: {
  order: Order; perms: readonly string[]; onAction: (a: MerchantAction) => void; onOpen: () => void; highlight?: boolean; busy?: boolean;
  thumbUrl?: string | null; category?: string | null;
}) {
  const { t, pick, relative, num } = useI18n();
  const now = useNow(30_000);
  const actions = merchantActionsFor(order, perms);
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);
  // Cancel stays in the drawer to avoid accidental taps on the board.
  const boardActions = actions.filter((a) => a !== 'cancel');
  const since = order.placedAt ?? order.createdAt;
  const waitingMin = (now - new Date(since).getTime()) / 60_000;
  const urgent = order.status === 'placed' && waitingMin >= 5;
  return (
    <article className={`order-card ${highlight ? 'order-card--new' : ''} ${urgent ? 'order-card--urgent' : ''}`} aria-labelledby={`oc-${order.id}`} data-testid="order-card" data-status={order.status}>
      <button type="button" className="order-card__main" onClick={onOpen} aria-label={t('orders.openOrder', { number: order.number })}>
        <span className="order-card__top">
          <span id={`oc-${order.id}`} className="order-card__number ltr">#{order.number}</span>
          <span className={`order-card__age ${urgent ? 'order-card__age--urgent' : ''}`}>{relative(since)}</span>
        </span>
        <span className="order-card__mid">
          <Photo src={thumbUrl} category={order.type === 'marketplace' ? category : 'other'} glyph={order.type === 'marketplace' ? undefined : 'box'} className="order-card__photo photo--sm" />
          <span className="order-card__info">
            <span className="order-card__customer truncate">{order.customerName ?? order.delivery?.dropoff.contactName ?? t('orders.walkIn')}</span>
            <span className="order-card__items">
              {order.type === 'merchant_delivery'
                ? order.delivery?.packageDescription ?? t('order.type.merchant_delivery')
                : order.items.slice(0, 2).map((i) => `${num(i.quantity, 0)}× ${pick(i.nameEn, i.nameAr)}`).join(' · ')}
              {order.type !== 'merchant_delivery' && order.items.length > 2 ? ' …' : ''}
            </span>
          </span>
        </span>
        <span className="order-card__meta">
          <Badge tone={order.paymentMethod === 'cod' ? 'warning' : 'success'} dot>{t(`payment.method.${order.paymentMethod}`)}</Badge>
          {order.delivery && order.status !== 'placed' ? <StatusBadge kind="delivery" status={order.delivery.status} /> : null}
          {order.notes ? <Badge tone="info" dot>{t('orders.hasNotes')}</Badge> : null}
          <span className="order-card__total"><Price baisa={order.totalBaisa} testId="order-total" />{order.type !== 'merchant_delivery' ? <span className="text-xs muted"> · {t('common.items', { n: num(itemCount, 0) })}</span> : null}</span>
        </span>
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
