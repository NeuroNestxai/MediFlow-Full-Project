import { config } from '../../config.js';
import type { PaymentProvider, ProviderPaymentStatus } from './types.js';

/**
 * Thawani Checkout adapter.
 *
 * Written against Thawani's public checkout-session API as documented in
 * docs/research/MARKET_AND_COMPLIANCE_RESEARCH.md §4.1. NOT verified against the Thawani UAT
 * environment — no credentials are available in this repository. Before go-live: obtain UAT keys,
 * run the checklist in DECISIONS item 20, and confirm field requirements and the webhook scheme.
 *
 *   POST {base}/checkout/session   header thawani-api-key   body {client_reference_id, mode:'payment',
 *        products:[{name, quantity, unit_amount}], success_url, cancel_url, metadata}
 *   → {data:{session_id, payment_status, ...}}
 *   redirect: {checkoutUrl}/{session_id}?key={publishable_key}
 *   GET  {base}/checkout/session/{session_id} → {data:{payment_status: 'unpaid'|'paid'|'cancelled', ...}}
 * Amounts are integer baisa.
 */
async function call(path: string, init: RequestInit = {}) {
  if (!config.THAWANI_SECRET_KEY) throw new Error('THAWANI_SECRET_KEY not configured');
  const res = await fetch(`${config.THAWANI_BASE_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'thawani-api-key': config.THAWANI_SECRET_KEY, ...(init.headers ?? {}) },
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) throw new Error(`Thawani error ${res.status}: ${body?.description ?? body?.message ?? 'unknown'}`);
  return body;
}

export function mapThawaniStatus(s: string | undefined): ProviderPaymentStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'paid': return 'paid';
    case 'cancelled': return 'cancelled';
    case 'expired': return 'expired';
    case 'failed': return 'failed';
    default: return 'pending';
  }
}

export const thawaniProvider: PaymentProvider = {
  name: 'thawani',
  async createCheckout(req) {
    const body = await call('/checkout/session', {
      method: 'POST',
      body: JSON.stringify({
        client_reference_id: req.reference,
        mode: 'payment',
        products: [{ name: req.productName.slice(0, 40), quantity: 1, unit_amount: req.amountBaisa }],
        success_url: req.successUrl,
        cancel_url: req.cancelUrl,
        metadata: { payment_id: req.paymentId, customer_name: req.customerName ?? '', customer_phone: req.customerPhone ?? '' },
      }),
    });
    const sessionId = body?.data?.session_id;
    if (!sessionId) throw new Error('Thawani did not return a session_id');
    return { providerRef: sessionId, checkoutUrl: `${config.THAWANI_CHECKOUT_URL}/${sessionId}?key=${config.THAWANI_PUBLISHABLE_KEY}`, raw: body };
  },
  async retrieve(providerRef) {
    const body = await call(`/checkout/session/${encodeURIComponent(providerRef)}`);
    return { status: mapThawaniStatus(body?.data?.payment_status), raw: body };
  },
  async refund() {
    // Refund API not verified (research §4.1). Refunds are recorded as pending and executed manually
    // in the Thawani merchant portal by finance until the API is confirmed.
    return { status: 'pending', providerRef: null };
  },
};
