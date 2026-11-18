// WCAG 2.x relative luminance and contrast ratio (pure, no dependencies).

/** Parses #rgb or #rrggbb into 0..255 channels. Throws on any other text. */
export function parseHex(hex: string): readonly [number, number, number] {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex);
  if (m === null) throw new Error(`not a hex color: ${hex}`);
  const h = m[1] as string;
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance of a #rgb or #rrggbb color, in 0..1. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** Contrast ratio of two colors, in 1..21, symmetric in its arguments. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Minimum ratio per pair role (WCAG 1.4.3 text, 1.4.11 graphic objects). */
export const MIN_RATIO = { text: 4.5, graphic: 3 } as const;
