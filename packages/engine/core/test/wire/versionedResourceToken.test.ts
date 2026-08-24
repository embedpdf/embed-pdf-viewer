import { describe, expect, test } from 'vitest';

import {
  decodeActionsToken,
  decodeAnnotationToken,
  decodeLayoutToken,
  encodeActionsToken,
  encodeAnnotationToken,
  encodeLayoutToken,
} from '../../src/wire/tokens';

describe('versioned resource tokens', () => {
  test('round-trips each resource version without a representation coordinate', () => {
    expect(encodeLayoutToken(7)).toBe('layoutVersion=7');
    expect(encodeAnnotationToken(8)).toBe('annotationVersion=8');
    expect(encodeActionsToken(1)).toBe('actionsVersion=1');
    expect(decodeLayoutToken(encodeLayoutToken(7))).toBe(7);
    expect(decodeAnnotationToken(encodeAnnotationToken(8))).toBe(8);
    expect(decodeActionsToken(encodeActionsToken(1))).toBe(1);
  });

  test('rejects unknown token fields', () => {
    expect(() => decodeLayoutToken('layoutVersion=7,unexpected=2')).toThrow();
    expect(() => decodeAnnotationToken('annotationVersion=8,unexpected=2')).toThrow();
    expect(() => decodeActionsToken('actionsVersion=1,unexpected=2')).toThrow();
  });
});
