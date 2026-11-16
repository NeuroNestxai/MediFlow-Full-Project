import { describe, expect, it } from 'vitest';
import { merchantActionsFor } from '../domain/orders';

const ALL = ['merchant.orders:process', 'merchant.orders:read'];

describe('merchantActionsFor', () => {
  it('offers accept/reject for new marketplace orders', () => {
    expect(merchantActionsFor({ type: 'marketplace', status: 'placed', delivery: { status: 'created' } }, ALL)).toEqual(['accept', 'reject']);
  });
  it('moves accepted orders forward and allows cancel before pickup', () => {
    expect(merchantActionsFor({ type: 'marketplace', status: 'accepted', delivery: { status: 'searching' } }, ALL)).toEqual(['preparing', 'ready', 'cancel']);
    expect(merchantActionsFor({ type: 'marketplace', status: 'preparing', delivery: { status: 'assigned' } }, ALL)).toEqual(['ready', 'cancel']);
    expect(merchantActionsFor({ type: 'marketplace', status: 'ready_for_pickup', delivery: { status: 'at_pickup' } }, ALL)).toEqual(['cancel']);
  });
  it('offers nothing after pickup or for final orders', () => {
    expect(merchantActionsFor({ type: 'marketplace', status: 'ready_for_pickup', delivery: { status: 'picked_up' } }, ALL)).toEqual([]);
    expect(merchantActionsFor({ type: 'marketplace', status: 'out_for_delivery', delivery: { status: 'picked_up' } }, ALL)).toEqual([]);
    expect(merchantActionsFor({ type: 'marketplace', status: 'delivered', delivery: { status: 'delivered' } }, ALL)).toEqual([]);
  });
  it('lets merchant deliveries be cancelled before pickup only', () => {
    expect(merchantActionsFor({ type: 'merchant_delivery', status: 'ready_for_pickup', delivery: { status: 'searching' } }, ALL)).toEqual(['cancel']);
  });
  it('hides every action without merchant.orders:process', () => {
    expect(merchantActionsFor({ type: 'marketplace', status: 'placed', delivery: null }, ['merchant.orders:read'])).toEqual([]);
  });
});
