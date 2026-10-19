import { describe, expect, test } from 'vitest';
import { EngineErrorCode } from '../../src/errors/EngineErrorCode';
import { opIdOf } from '../../src/mutation/WriteOptions';

describe('opIdOf', () => {
  test("takes the caller's id, else makes one", () => {
    expect(opIdOf({ opId: 'save-42' })).toBe('save-42');
    expect(opIdOf(undefined)).toMatch(/^[0-9a-f-]{36}$/);
    expect(opIdOf({})).not.toBe(opIdOf({}));
  });

  test('refuses what an HTTP header could not carry', () => {
    for (const opId of ['', 'has space', 'tab\t', 'é', 'x'.repeat(256)]) {
      expect(() => opIdOf({ opId })).toThrow(
        expect.objectContaining({ code: EngineErrorCode.InvalidArg, details: { field: 'opId' } }),
      );
    }
    expect(opIdOf({ opId: 'x'.repeat(255) })).toHaveLength(255);
  });
});
