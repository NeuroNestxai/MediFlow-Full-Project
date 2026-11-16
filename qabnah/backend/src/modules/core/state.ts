import { invalidTransition } from '../../lib/errors.js';

export const ORDER_TRANSITIONS: Record<string, string[]> = {
  pending_payment: ['placed', 'cancelled'],
  placed: ['accepted', 'rejected', 'cancelled', 'ready_for_pickup'],
  accepted: ['preparing', 'ready_for_pickup', 'out_for_delivery', 'cancelled'],
  preparing: ['ready_for_pickup', 'out_for_delivery', 'cancelled'],
  ready_for_pickup: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: ['completed'],
  completed: [],
  rejected: [],
  cancelled: [],
};

export const DELIVERY_TRANSITIONS: Record<string, string[]> = {
  created: ['searching', 'unassigned', 'assigned', 'cancelled'],
  searching: ['searching', 'assigned', 'unassigned', 'cancelled'],
  unassigned: ['searching', 'assigned', 'cancelled'],
  assigned: ['at_pickup', 'picked_up', 'searching', 'assigned', 'cancelled'],
  at_pickup: ['picked_up', 'searching', 'assigned', 'cancelled'],
  picked_up: ['at_dropoff', 'delivered', 'failed'],
  at_dropoff: ['delivered', 'failed'],
  failed: ['returning', 'returned'],
  returning: ['returned'],
  delivered: [],
  returned: [],
  cancelled: [],
};

export const ACTIVE_DELIVERY_STATUSES = ['assigned', 'at_pickup', 'picked_up', 'at_dropoff'];
export const PRE_PICKUP_STATUSES = ['created', 'searching', 'unassigned', 'assigned', 'at_pickup'];
export const ACTIVE_ORDER_STATUSES = ['pending_payment', 'placed', 'accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery'];

export function canTransition(map: Record<string, string[]>, from: string, to: string) {
  return (map[from] ?? []).includes(to);
}
export function assertOrderTransition(from: string, to: string) {
  if (!canTransition(ORDER_TRANSITIONS, from, to)) throw invalidTransition(from, to);
}
export function assertDeliveryTransition(from: string, to: string) {
  if (!canTransition(DELIVERY_TRANSITIONS, from, to)) throw invalidTransition(from, to);
}

/** Captain actions available for a delivery status (drives app buttons). */
export function captainNextActions(status: string): string[] {
  switch (status) {
    case 'assigned': return ['arrive_pickup', 'pickup', 'release'];
    case 'at_pickup': return ['pickup', 'release'];
    case 'picked_up': return ['arrive_dropoff', 'complete', 'fail'];
    case 'at_dropoff': return ['complete', 'fail'];
    default: return [];
  }
}
