// Validates: Requirements 13.1, 13.3
import { describe, expect, it } from 'vitest';
import { formatConfigError } from '../src/format.js';

describe('formatConfigError', () => {
  it('prints position, ward, and field', () => {
    expect(
      formatConfigError({
        code: 'invalid-glob',
        message: 'pattern is not valid',
        line: 4,
        column: 9,
        wardId: 'protect-env',
        field: 'paths[1]',
      }),
    ).toBe('wards.yaml:4:9: [invalid-glob] ward "protect-env" field "paths[1]": pattern is not valid');
  });

  it('omits the ward part when wardId is unknown', () => {
    expect(
      formatConfigError({ code: 'unknown-root-field', message: 'unknown key', line: 2, column: 1, field: 'extra' }),
    ).toBe('wards.yaml:2:1: [unknown-root-field] field "extra": unknown key');
  });

  it('omits the field part when no field is involved', () => {
    expect(
      formatConfigError({ code: 'missing-field', message: 'missing', line: 3, column: 3, wardId: 'w1' }),
    ).toBe('wards.yaml:3:3: [missing-field] ward "w1": missing');
  });

  it('omits both parts and prints no position when none is known', () => {
    expect(formatConfigError({ code: 'input-too-large', message: 'input exceeds 262144 bytes' })).toBe(
      'wards.yaml: [input-too-large]: input exceeds 262144 bytes',
    );
  });

  it('prints no position but keeps ward and field', () => {
    expect(
      formatConfigError({ code: 'wrong-type', message: 'bad', wardId: 'w', field: 'tables' }),
    ).toBe('wards.yaml: [wrong-type] ward "w" field "tables": bad');
  });
});
