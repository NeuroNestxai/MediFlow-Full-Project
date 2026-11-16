import { config } from '../../config.js';
import { mockProvider } from './mock.js';
import { thawaniProvider } from './thawani.js';
import type { PaymentProvider } from './types.js';

export const providers: Record<string, PaymentProvider> = { mock: mockProvider, thawani: thawaniProvider };
export const activeProvider = (): PaymentProvider => providers[config.PAYMENT_PROVIDER];
export type { PaymentProvider } from './types.js';
