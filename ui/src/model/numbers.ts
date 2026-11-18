import { displayPrimitive } from './guards';

/** 1206 -> '1,206'. Anything but a finite non-negative integer -> 'invalid number: <value>'. */
export function formatCount(v: unknown): string {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0) {
    // BigInt keeps large integers free of exponent notation; no locale is involved.
    return BigInt(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  return `invalid number: ${displayPrimitive(v)}`;
}
