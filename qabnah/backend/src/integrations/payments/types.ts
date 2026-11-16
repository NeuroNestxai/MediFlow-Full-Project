import type { Queryable } from '../../db/pool.js';

export type ProviderPaymentStatus = 'pending' | 'paid' | 'cancelled' | 'failed' | 'expired';

export interface CheckoutRequest {
  paymentId: string;
  amountBaisa: number;
  reference: string;       // our order number / link code
  productName: string;
  customerName?: string | null;
  customerPhone?: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface PaymentProvider {
  name: 'mock' | 'thawani';
  createCheckout(req: CheckoutRequest, db: Queryable): Promise<{ providerRef: string; checkoutUrl: string; raw: unknown }>;
  retrieve(providerRef: string, db: Queryable): Promise<{ status: ProviderPaymentStatus; raw: unknown }>;
  refund(providerRef: string, amountBaisa: number, reason: string): Promise<{ status: 'succeeded' | 'pending'; providerRef: string | null }>;
}
