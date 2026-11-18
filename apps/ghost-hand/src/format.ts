// Number formatting for the variant table. Pure; the values are shown in full, never hidden.

/** Fixed-point text without a negative zero. Non-finite values are shown as their name. */
export function fixed(value: number, digits: number): string {
  if (!Number.isFinite(value)) return String(value);
  const text = value.toFixed(digits);
  return /^-0(\.0+)?$/.test(text) ? text.slice(1) : text;
}
