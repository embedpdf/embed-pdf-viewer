import type { PDFViewerConfig } from '@embedpdf/snippet';
import { describe, expect, it } from 'vitest';

import { mergeViewerConfigs } from './pdf-viewer.config';

describe('mergeViewerConfigs', () => {
  it('deep-merges plain objects and replaces arrays with the override', () => {
    const base = {
      theme: { preference: 'dark', light: { accent: { primary: '#000' } } },
      disabledCategories: ['annotation'],
    } satisfies PDFViewerConfig;
    const override = {
      theme: { light: { accent: { primaryForeground: '#fff' } } },
      disabledCategories: ['print'],
    } satisfies PDFViewerConfig;

    const merged = mergeViewerConfigs(base, override);

    expect(merged).toEqual({
      theme: {
        preference: 'dark',
        light: { accent: { primary: '#000', primaryForeground: '#fff' } },
      },
      disabledCategories: ['print'],
    });
  });

  it('treats undefined override values as "inherit from base"', () => {
    const merged = mergeViewerConfigs(
      { src: '/base.pdf' } satisfies PDFViewerConfig,
      { src: undefined as unknown as string } satisfies PDFViewerConfig,
    );
    expect(merged).toEqual({ src: '/base.pdf' });
  });

  it('refuses to write prototype-pollution keys from untrusted overrides', () => {
    // Simulates JSON.parse output where `__proto__` IS an own enumerable key.
    // Without the guard, `merged['__proto__'] = {...}` would trigger Object.prototype's
    // __proto__ setter and replace merged's prototype (local pollution), making
    // `merged.polluted === true` via the chain.
    const malicious = JSON.parse('{"__proto__": {"polluted": true}, "src": "/ok.pdf"}');

    const merged = mergeViewerConfigs({} satisfies PDFViewerConfig, malicious as PDFViewerConfig);

    expect((merged as Record<string, unknown>).src).toBe('/ok.pdf');
    // Strong checks: prove the merged object's prototype is unchanged AND that
    // no `polluted` property is reachable on it via the prototype chain.
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    expect((merged as Record<string, unknown>)['polluted']).toBeUndefined();
    // Also prove the global Object.prototype was not polluted.
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('refuses to write constructor / prototype keys, including the nested constructor.prototype payload', () => {
    // Classic `constructor.prototype` attack pattern — if a merger naively walked
    // into `constructor`, it could then write `prototype.polluted = true` on
    // Object's actual constructor, polluting every plain object globally.
    const merged = mergeViewerConfigs({} satisfies PDFViewerConfig, {
      constructor: { prototype: { polluted: true } },
      prototype: { polluted: true },
      src: '/ok.pdf',
    } as unknown as PDFViewerConfig);

    expect((merged as Record<string, unknown>).src).toBe('/ok.pdf');
    // No own properties for the dangerous keys.
    expect(Object.prototype.hasOwnProperty.call(merged, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(merged, 'prototype')).toBe(false);
    // Merged object's prototype chain is the unmodified Object.prototype.
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    // No global pollution — fresh `{}` would otherwise inherit `polluted` via
    // Object.prototype if the constructor.prototype chain had been written.
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(((): unknown => ({}).constructor.prototype as Record<string, unknown>)()).toBe(
      Object.prototype,
    );
  });
});
