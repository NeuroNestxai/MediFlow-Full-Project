/** All money is integer baisa. 1 OMR = 1000 baisa. Rates are basis points (10000 = 100%). */
export const BAISA_PER_OMR = 1000;

/** Round half-up to an integer baisa amount. */
export function roundBaisa(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x) + Number.EPSILON * 10);
}

export function applyBps(amountBaisa: number, bps: number): number {
  return roundBaisa((amountBaisa * bps) / 10000);
}

/** VAT contained in a VAT-inclusive amount: amount * rate / (1 + rate). */
export function vatIncluded(amountBaisa: number, vatBps: number): number {
  return roundBaisa((amountBaisa * vatBps) / (10000 + vatBps));
}

export function formatOMR(baisa: number): string {
  const sign = baisa < 0 ? '-' : '';
  const abs = Math.abs(baisa);
  return `${sign}OMR ${Math.floor(abs / 1000)}.${String(abs % 1000).padStart(3, '0')}`;
}
