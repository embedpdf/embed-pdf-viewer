import { describe, expect, test } from 'vitest';
import { generateUuid, generateUuidV7 } from '../../src/identity/uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuids', () => {
  test('a v4 is random', () => {
    expect(generateUuid()).toMatch(V4);
    expect(generateUuid()).not.toBe(generateUuid());
  });

  test('a v7 starts with its time, so later ones sort later', () => {
    const at = Date.UTC(2026, 9, 6, 12, 0, 0, 123);
    const id = generateUuidV7(at);
    expect(id).toMatch(V7);
    expect(parseInt(id.replace(/-/g, '').slice(0, 12), 16)).toBe(at);
    expect(generateUuidV7(at + 1) > generateUuidV7(at)).toBe(true);
    expect(generateUuidV7(at)).not.toBe(generateUuidV7(at));
  });
});
