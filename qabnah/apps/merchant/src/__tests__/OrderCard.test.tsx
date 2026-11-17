import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, type Order, type OrderStatus, type DeliveryStatus } from '@qabnah/shared';
import { OrderCard } from '../portal/orders/OrderCard';
import { dictionaries } from '../i18n';

const order = (status: OrderStatus, delivery: DeliveryStatus = 'created', type: Order['type'] = 'marketplace'): Order => ({
  id: 'o1', number: 'QB100029', type, source: 'app', status, paymentMethod: 'cod', paymentStatus: 'unpaid', codPayer: null, merchant: null,
  customerName: 'Maryam', customerPhone: '+96890000001',
  items: [{ id: 'i1', productId: 'p1', nameEn: 'Laban', nameAr: 'لبن', unitPriceBaisa: 300, quantity: 2, options: [], lineTotalBaisa: 600, notes: null }],
  subtotalBaisa: 600, deliveryFeeBaisa: 1090, serviceFeeBaisa: 100, discountBaisa: 0, vatBaisa: 0, totalBaisa: 1790, codAmountBaisa: 1790, currency: 'OMR',
  notes: null, prepTimeMinutes: 20, cancelReason: null, createdAt: new Date().toISOString(), placedAt: new Date().toISOString(), acceptedAt: null, readyAt: null,
  deliveredAt: null, cancelledAt: null, timeline: [], rated: false,
  delivery: { id: 'd1', status: delivery, vehicleType: null, pickup: { location: null, address: null, contactName: null, contactPhone: null, notes: null },
    dropoff: { location: null, address: 'Qurum', contactName: 'Maryam', contactPhone: null, notes: null }, packageSize: null, packageDescription: null, distanceM: 0,
    estimatedDurationS: 0, feeBaisa: 1090, codAmountBaisa: 1790, deliveryPin: '1234', pinRequired: true, captain: null, etaPickupAt: null, etaDropoffAt: null,
    assignedAt: null, pickedUpAt: null, deliveredAt: null, failureReason: null },
});

const PERMS = ['merchant.orders:read', 'merchant.orders:process'];
const setup = (o: Order, perms = PERMS) => {
  const onAction = vi.fn();
  localStorage.setItem('test.card.lang', JSON.stringify('en'));
  render(<I18nProvider dictionaries={dictionaries} defaultLang="en" storageKey="test.card.lang"><OrderCard order={o} perms={perms} onAction={onAction} onOpen={() => undefined} /></I18nProvider>);
  return onAction;
};
const buttons = () => screen.queryAllByRole('button').map((b) => b.textContent).filter((x) => x && !x.startsWith('#'));

describe('OrderCard actions by status', () => {
  it('new order: accept and reject', async () => {
    const onAction = setup(order('placed'));
    expect(buttons()).toEqual(['Accept', 'Reject']);
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onAction).toHaveBeenCalledWith('accept');
    expect(screen.getByTestId('order-total')).toHaveTextContent('OMR 1.790');
  });
  it('accepted order: preparing and ready (cancel lives in the drawer)', () => {
    setup(order('accepted', 'searching'));
    expect(buttons()).toEqual(['Start preparing', 'Ready for pickup']);
  });
  it('preparing order: ready only', () => {
    setup(order('preparing', 'assigned'));
    expect(buttons()).toEqual(['Ready for pickup']);
  });
  it('out for delivery: no actions', () => {
    setup(order('out_for_delivery', 'picked_up'));
    expect(buttons()).toEqual([]);
  });
  it('no actions without merchant.orders:process', () => {
    setup(order('placed'), ['merchant.orders:read']);
    expect(buttons()).toEqual([]);
  });
});
