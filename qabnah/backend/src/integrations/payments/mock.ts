import { config } from '../../config.js';
import { one } from '../../db/pool.js';
import type { PaymentProvider } from './types.js';

/** Development/test provider. Checkout page is served by the API at /v1/mock-pay/:paymentId. */
export const mockProvider: PaymentProvider = {
  name: 'mock',
  async createCheckout(req) {
    const providerRef = `mock_${req.paymentId}`;
    return { providerRef, checkoutUrl: `${config.PUBLIC_API_URL}/v1/mock-pay/${req.paymentId}`, raw: { successUrl: req.successUrl, cancelUrl: req.cancelUrl } };
  },
  async retrieve(providerRef, db) {
    const row = await one(db, `SELECT raw FROM payments WHERE provider = 'mock' AND provider_ref = $1`, [providerRef]);
    const s = row?.raw?.mockOutcome;
    return { status: s === 'paid' ? 'paid' : s === 'failed' ? 'failed' : 'pending', raw: row?.raw ?? {} };
  },
  async refund(providerRef) {
    return { status: 'succeeded', providerRef: `mock_refund_${providerRef}` };
  },
};
