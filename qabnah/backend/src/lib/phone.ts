import { badRequest } from './errors.js';

/**
 * Normalise an Omani mobile number to E.164 (+968XXXXXXXX).
 * Omani mobiles are 8 digits starting with 7 or 9. Accepts "9xxxxxxx", "968...", "+968...", "00968...".
 */
export function normalizeOmanPhone(input: string): string {
  let d = input.replace(/[\s\-()]/g, '');
  // Arabic-Indic digits → ASCII
  d = d.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) d = '968' + d;
  if (!/^968[79]\d{7}$/.test(d)) throw badRequest('Enter a valid Omani mobile number (8 digits starting with 7 or 9)');
  return '+' + d;
}

export function maskPhone(p: string | null | undefined): string | null {
  if (!p) return null;
  return p.slice(0, 4) + '****' + p.slice(-3);
}

export const waDigits = (p: string) => p.replace(/\D/g, '');
