import { describe, expect, it } from 'vitest';

import { negotiateLocale } from '../src/negotiate';

describe('negotiateLocale', () => {
  it('prefers an exact match, case-insensitively', () => {
    expect(negotiateLocale(['en', 'es-MX'], ['ES-mx', 'en'])).toBe('es-MX');
  });

  it('narrows a regional request to its language', () => {
    expect(negotiateLocale(['en', 'es'], ['en-GB'])).toBe('en');
  });

  it('widens to an available dialect of the requested language', () => {
    expect(negotiateLocale(['zh-Hans', 'en'], ['zh'])).toBe('zh-Hans');
  });

  it('respects request preference order across passes', () => {
    // 'de' has no match at all; 'fr-CA' narrows to 'fr'.
    expect(negotiateLocale(['fr', 'en'], ['de', 'fr-CA'])).toBe('fr');
  });

  it('matches a dialect only in the same script: Taiwan and Hong Kong write Traditional Chinese', () => {
    const available = ['en', 'zh-CN'];
    expect(negotiateLocale(available, ['zh-TW'])).toBeNull();
    expect(negotiateLocale(available, ['zh-HK', 'en'])).toBe('en');
    expect(negotiateLocale(available, ['zh'])).toBe('zh-CN');
    expect(negotiateLocale(available, ['zh-SG'])).toBe('zh-CN');
    expect(negotiateLocale(['zh-CN', 'zh-TW'], ['zh-HK'])).toBe('zh-TW');
    expect(negotiateLocale(['zh'], ['zh-Hant'])).toBeNull();
    expect(negotiateLocale(['sr'], ['sr-Latn'])).toBeNull();
  });

  it('still narrows a pseudo-locale, and matches a private tag it cannot read exactly', () => {
    expect(negotiateLocale(['en'], ['en-XA'])).toBe('en');
    expect(negotiateLocale(['x-acme', 'en'], ['x-acme'])).toBe('x-acme');
    expect(negotiateLocale(['en', 'x-acme'], ['x-acme-test'])).toBe('x-acme');
  });

  it('returns null when nothing matches', () => {
    expect(negotiateLocale(['en'], ['ja', 'ko'])).toBeNull();
  });
});
