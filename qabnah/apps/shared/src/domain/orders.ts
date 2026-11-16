import type { DeliveryStatus, Order, OrderStatus, OrderType } from '../api/types';

export type MerchantAction = 'accept' | 'reject' | 'preparing' | 'ready' | 'cancel';

const PRE_PICKUP: DeliveryStatus[] = ['created', 'searching', 'unassigned', 'assigned', 'at_pickup'];

/**
 * Actions a merchant may take on an order, mirroring the backend state machine
 * (modules/core/state.ts + orders/service.ts merchantOrderAction).
 */
export function merchantActionsFor(
  order: { type: OrderType; status: OrderStatus; delivery?: { status: DeliveryStatus } | null },
  permissions: readonly string[],
): MerchantAction[] {
  if (!permissions.includes('merchant.orders:process')) return [];
  const beforePickup = !order.delivery || PRE_PICKUP.includes(order.delivery.status) || order.delivery.status === 'failed';
  const out: MerchantAction[] = [];
  if (order.type === 'marketplace') {
    switch (order.status) {
      case 'placed': out.push('accept', 'reject'); break;
      case 'accepted': out.push('preparing', 'ready'); break;
      case 'preparing': out.push('ready'); break;
      default: break;
    }
  }
  if (['placed', 'accepted', 'preparing', 'ready_for_pickup'].includes(order.status) && beforePickup && !(order.type === 'marketplace' && order.status === 'placed')) {
    out.push('cancel');
  }
  return out;
}

/** Columns of the live orders board. */
export const BOARD_COLUMNS: { key: string; statuses: OrderStatus[] }[] = [
  { key: 'placed', statuses: ['placed'] },
  { key: 'accepted', statuses: ['accepted'] },
  { key: 'preparing', statuses: ['preparing'] },
  { key: 'ready_for_pickup', statuses: ['ready_for_pickup'] },
  { key: 'out_for_delivery', statuses: ['out_for_delivery'] },
];

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = ['pending_payment', 'placed', 'accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery'];
export const FINAL_ORDER_STATUSES: OrderStatus[] = ['delivered', 'completed', 'rejected', 'cancelled'];
export const ACTIVE_DELIVERY_STATUSES: DeliveryStatus[] = ['assigned', 'at_pickup', 'picked_up', 'at_dropoff'];

export function statusTone(status: OrderStatus | DeliveryStatus | string): 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'accent' {
  switch (status) {
    case 'placed': case 'unassigned': case 'pending_payment': return 'accent';
    case 'accepted': case 'preparing': case 'searching': case 'assigned': case 'at_pickup': return 'info';
    case 'ready_for_pickup': case 'out_for_delivery': case 'picked_up': case 'at_dropoff': return 'warning';
    case 'pending': case 'pending_review': case 'pending_documents': case 'draft': return 'warning';
    case 'open': return 'info';
    case 'delivered': case 'completed': case 'paid': case 'active': case 'approved': case 'resolved': return 'success';
    case 'rejected': case 'cancelled': case 'failed': case 'expired': case 'suspended': return 'danger';
    default: return 'neutral';
  }
}

/** Customer-facing progress steps for the order status page. */
export function orderProgress(o: Pick<Order, 'status' | 'type'>): { steps: OrderStatus[]; current: number } {
  const steps: OrderStatus[] = o.type === 'marketplace'
    ? ['placed', 'accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered']
    : ['placed', 'ready_for_pickup', 'out_for_delivery', 'delivered'];
  const st = o.status === 'completed' ? 'delivered' : o.status;
  const idx = steps.indexOf(st);
  return { steps, current: idx };
}
