import { describe, expect, it } from 'vitest';
import { baisaToOmrString, formatMoney, parseOmrToBaisa, toArabicDigits, formatDateTime, muscatToday, addDays, formatBps } from '../format/format';

describe('money formatting', () => {
  it('formats baisa as OMR with three decimals', () => {
    expect(formatMoney(2500, 'en')).toBe('OMR 2.500');
    expect(formatMoney(0, 'en')).toBe('OMR 0.000');
    expect(formatMoney(5, 'en')).toBe('OMR 0.005');
    expect(formatMoney(1234567, 'en')).toBe('OMR 1,234.567');
  });
  it('formats Arabic with Arabic-Indic digits and the rial sign', () => {
    expect(formatMoney(2500, 'ar')).toBe('٢٫٥٠٠ ر.ع.');
    expect(formatMoney(1234567, 'ar')).toBe('١٬٢٣٤٫٥٦٧ ر.ع.');
  });
  it('handles negatives and signed display', () => {
    expect(formatMoney(-1500, 'en')).toBe('-OMR 1.500');
    expect(formatMoney(-1500, 'ar')).toBe('-١٫٥٠٠ ر.ع.');
    expect(formatMoney(1500, 'en', { signed: true })).toBe('+OMR 1.500');
    expect(baisaToOmrString(-1)).toBe('-0.001');
  });
  it('shows a dash for missing values', () => {
    expect(formatMoney(null, 'en')).toBe('—');
    expect(formatMoney(undefined, 'ar')).toBe('—');
  });
  it('converts digits', () => {
    expect(toArabicDigits('12.5')).toBe('١٢٫٥');
  });
});

describe('parseOmrToBaisa', () => {
  it('parses OMR strings into integer baisa without float error', () => {
    expect(parseOmrToBaisa('2.5')).toBe(2500);
    expect(parseOmrToBaisa('2.500')).toBe(2500);
    expect(parseOmrToBaisa('0.1')).toBe(100);
    expect(parseOmrToBaisa('12')).toBe(12000);
    expect(parseOmrToBaisa('1,234.567')).toBe(1234567);
    expect(parseOmrToBaisa('19.999')).toBe(19999);
    expect(parseOmrToBaisa('OMR 3.250')).toBe(3250);
  });
  it('accepts Arabic-Indic digits', () => {
    expect(parseOmrToBaisa('٢٫٥')).toBe(2500);
    expect(parseOmrToBaisa('١٢')).toBe(12000);
  });
  it('rejects invalid input', () => {
    expect(parseOmrToBaisa('')).toBeNull();
    expect(parseOmrToBaisa('abc')).toBeNull();
    expect(parseOmrToBaisa('1.2345')).toBeNull();
    expect(parseOmrToBaisa('1.2.3')).toBeNull();
  });
});

describe('dates in Asia/Muscat', () => {
  it('renders times in Muscat (UTC+4)', () => {
    expect(formatDateTime('2026-11-16T20:30:00Z', 'en')).toContain('17 Nov 2026');
    expect(formatDateTime('2026-11-16T20:30:00Z', 'en')).toContain('00:30');
  });
  it('computes the Muscat calendar day', () => {
    expect(muscatToday(new Date('2026-11-16T21:00:00Z'))).toBe('2026-11-17');
    expect(muscatToday(new Date('2026-11-16T19:59:00Z'))).toBe('2026-11-16');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });
  it('formats basis points', () => {
    expect(formatBps(1500)).toBe('15%');
    expect(formatBps(1250, 'en')).toBe('12.5%');
  });
});
