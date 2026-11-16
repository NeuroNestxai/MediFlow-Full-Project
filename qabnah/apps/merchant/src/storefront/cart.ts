import { useSyncExternalStore } from 'react';
import { prefs } from '@qabnah/shared';

export interface CartLine {
  key: string;
  productId: string;
  nameEn: string;
  nameAr: string;
  imageUrl: string | null;
  unitPriceBaisa: number;
  quantity: number;
  optionIds: string[];
  optionLabels: { nameEn: string; nameAr: string }[];
  notes?: string;
}
export interface Cart { merchantId: string; slug: string; lines: CartLine[] }

const KEY = 'qabnah.storefront.cart';
const listeners = new Set<() => void>();
let snapshot: Cart | null = prefs.get<Cart | null>(KEY, null);

function write(c: Cart | null) {
  snapshot = c && c.lines.length ? c : null;
  if (snapshot) prefs.set(KEY, snapshot); else prefs.remove(KEY);
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { snapshot = prefs.get<Cart | null>(KEY, null); listeners.forEach((l) => l()); }
  });
}

const lineKey = (productId: string, optionIds: string[], notes?: string) => `${productId}|${[...optionIds].sort().join(',')}|${notes ?? ''}`;

/** Single-merchant cart persisted in localStorage. */
export const cart = {
  get: () => snapshot,
  /** Adding from another store replaces the cart (caller confirms first). */
  add(merchantId: string, slug: string, line: Omit<CartLine, 'key'>) {
    const base: Cart = snapshot && snapshot.merchantId === merchantId ? snapshot : { merchantId, slug, lines: [] };
    const key = lineKey(line.productId, line.optionIds, line.notes);
    const existing = base.lines.find((l) => l.key === key);
    const lines = existing
      ? base.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(99, l.quantity + line.quantity) } : l))
      : [...base.lines, { ...line, key }];
    write({ ...base, lines });
  },
  setQuantity(key: string, quantity: number) {
    if (!snapshot) return;
    write({ ...snapshot, lines: quantity <= 0 ? snapshot.lines.filter((l) => l.key !== key) : snapshot.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(99, quantity) } : l)) });
  },
  remove(key: string) { cart.setQuantity(key, 0); },
  clear() { write(null); },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
};

export function useCart(): Cart | null {
  return useSyncExternalStore(cart.subscribe, cart.get, cart.get);
}

export const cartCount = (c: Cart | null) => c?.lines.reduce((s, l) => s + l.quantity, 0) ?? 0;
export const cartSubtotal = (c: Cart | null) => c?.lines.reduce((s, l) => s + l.unitPriceBaisa * l.quantity, 0) ?? 0;
