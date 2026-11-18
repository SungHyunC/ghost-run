import type { VariantConfig } from '@ghost-run/drawer-arm';

export const SEED_MAX = 4294967295;

export type SeedInputResult =
  | { readonly ok: true; readonly seed: number }
  | { readonly ok: false; readonly error: string };

export type CountInputResult =
  | { readonly ok: true; readonly count: number }
  | { readonly ok: false; readonly error: string };

/**
 * Accepts only the decimal text of an integer from 0 to 4294967295:
 * ASCII digits only, no sign, space, exponent, or decimal point.
 * A rejection carries a message and the caller starts no run.
 */
export function parseSeedInput(text: string): SeedInputResult {
  if (typeof text !== 'string' || !/^[0-9]+$/.test(text)) {
    return { ok: false, error: `Seed must be a whole number from 0 to ${SEED_MAX} written in digits only.` };
  }
  const value = Number(text);
  if (!(value <= SEED_MAX)) {
    return { ok: false, error: `Seed must be at most ${SEED_MAX}.` };
  }
  return { ok: true, seed: value };
}

/**
 * Accepts an integer from 1 to defaultCount, or up to maxCount only when
 * largeCountEnabled is true. A rejection carries a message and no run starts.
 */
export function validateVariantCount(
  count: number,
  config: Pick<VariantConfig, 'defaultCount' | 'maxCount' | 'largeCountEnabled'>,
): CountInputResult {
  if (typeof count !== 'number' || !Number.isInteger(count)) {
    return { ok: false, error: 'Variant count must be a whole number.' };
  }
  const limit = config.largeCountEnabled ? config.maxCount : config.defaultCount;
  if (count < 1 || count > limit) {
    const hint =
      !config.largeCountEnabled && count > config.defaultCount && count <= config.maxCount
        ? ' Larger counts are disabled in the variant config (largeCountEnabled is false).'
        : '';
    return { ok: false, error: `Variant count must be from 1 to ${limit}.${hint}` };
  }
  return { ok: true, count };
}
