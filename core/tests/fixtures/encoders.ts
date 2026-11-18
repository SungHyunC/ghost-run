// Independent test encoders. Must not import any code under test.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function utf8(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/** Base64 (RFC 4648 section 4), optionally padded with '='. */
export function base64(bytes: Uint8Array, padded: boolean): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = i + 1 < bytes.length ? (bytes[i + 1] as number) : 0;
    const c = i + 2 < bytes.length ? (bytes[i + 2] as number) : 0;
    const n = (a << 16) | (b << 8) | c;
    const rem = bytes.length - i;
    out += B64[(n >> 18) & 63];
    out += B64[(n >> 12) & 63];
    if (rem > 1) out += B64[(n >> 6) & 63];
    else if (padded) out += '=';
    if (rem > 2) out += B64[n & 63];
    else if (padded) out += '=';
  }
  return out;
}

/** Base64url (RFC 4648 section 5), optionally padded. */
export function base64url(bytes: Uint8Array, padded: boolean): string {
  return base64(bytes, padded).replace(/\+/g, '-').replace(/\//g, '_');
}

export type HexCase = 'lower' | 'upper' | 'mixed';

export function hex(bytes: Uint8Array, form: HexCase): string {
  const digits = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const v = bytes[i] as number;
    let s = digits[v >> 4] + (digits[v & 15] as string);
    if (form === 'upper' || (form === 'mixed' && i % 2 === 1)) s = s.toUpperCase();
    out += s;
  }
  return out;
}

/** Percent-encodes every byte (%XX, uppercase digits). */
export function percentAll(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += '%' + (bytes[i] as number).toString(16).toUpperCase().padStart(2, '0');
  }
  return out;
}

/** Inserts CRLF every `width` characters (MIME style: 76, PEM style: 64, 60 also used). */
export function breakLines(text: string, width: number): string {
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += width) lines.push(text.slice(i, i + width));
  return lines.join('\r\n');
}
