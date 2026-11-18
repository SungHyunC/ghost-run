// Reserved hosts only (.example, .test, .localhost, .invalid); none can resolve to a real host.
import * as fc from 'fast-check';

export const RESERVED_TLDS = ['example', 'test', 'localhost', 'invalid'] as const;

export const RESERVED_HOSTS: readonly string[] = [
  'exfil.example',
  'collector.test',
  'sink.invalid',
  'api.attacker.example',
  'evil.localhost',
];

export const hostArb: fc.Arbitrary<string> = fc.constantFrom(...RESERVED_HOSTS);

export function isReservedHost(host: string): boolean {
  const tld = host.toLowerCase().split('.').pop() ?? '';
  return (RESERVED_TLDS as readonly string[]).includes(tld);
}
