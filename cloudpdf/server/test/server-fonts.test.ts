import { describe, expect, test } from 'vitest';
import type { EngineFontFacts } from '@embedpdf/engine-core/runtime';
import { serverFontsFingerprint } from '../src/services/ServerFonts';

const font = (key: string, sha256: string, served = false): EngineFontFacts => ({
  key,
  identity: {
    familyName: key,
    weight: 400,
    italic: false,
    embeddingPermission: 'installable',
    editingAuthorized: true,
    instanced: false,
  },
  postScriptName: null,
  format: 'truetype',
  sha256,
  served,
});

describe('the server’s fonts’ fingerprint', () => {
  const fonts = [font('a', '1'.repeat(64)), font('b', '2'.repeat(64), true)];

  test('is the same for the same setup, whenever and wherever it is computed', () => {
    expect(serverFontsFingerprint(fonts, ['a', 'b'])).toBe(
      serverFontsFingerprint([...fonts], ['a', 'b']),
    );
    expect(serverFontsFingerprint(fonts, ['a', 'b'])).toMatch(/^[0-9a-f]{16}$/);
  });

  test('moves with a program, a key, what is served, and the fallbacks or their order', () => {
    const base = serverFontsFingerprint(fonts, ['a', 'b']);
    for (const other of [
      serverFontsFingerprint([fonts[0]!, font('b', '3'.repeat(64), true)], ['a', 'b']),
      serverFontsFingerprint([fonts[0]!, font('c', '2'.repeat(64), true)], ['a', 'c']),
      serverFontsFingerprint([fonts[0]!, font('b', '2'.repeat(64), false)], ['a', 'b']),
      serverFontsFingerprint(fonts, ['b', 'a']),
      serverFontsFingerprint(fonts, ['a']),
    ]) {
      expect(other).not.toBe(base);
    }
  });
});
