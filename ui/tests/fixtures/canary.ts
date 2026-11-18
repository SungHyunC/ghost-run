// Canary generator constants. Fake values only; never a real credential.
import * as fc from 'fast-check';

export const CANARY_PREFIX = 'sk-CANARY-';
export const CANARY_MIN_SUFFIX = 1;
export const CANARY_MAX_SUFFIX = 40;
export const CANARY_SUFFIX_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** `sk-CANARY-` followed by 1 to 40 alphanumeric characters. */
export const canaryArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...CANARY_SUFFIX_CHARS.split('')), {
    minLength: CANARY_MIN_SUFFIX,
    maxLength: CANARY_MAX_SUFFIX,
  })
  .map((chars) => CANARY_PREFIX + chars.join(''));

export const CANARY_EXAMPLE = `${CANARY_PREFIX}abc123`;

export function isCanary(value: string): boolean {
  return (
    value.startsWith(CANARY_PREFIX) &&
    value.length >= CANARY_PREFIX.length + CANARY_MIN_SUFFIX &&
    value.length <= CANARY_PREFIX.length + CANARY_MAX_SUFFIX
  );
}
