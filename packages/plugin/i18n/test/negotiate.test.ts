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

  it('returns null when nothing matches', () => {
    expect(negotiateLocale(['en'], ['ja', 'ko'])).toBeNull();
  });
});
