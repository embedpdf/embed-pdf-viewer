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
    const malicious = JSON.parse('{"__proto__": {"polluted": true}, "src": "/ok.pdf"}');

    const merged = mergeViewerConfigs({} satisfies PDFViewerConfig, malicious as PDFViewerConfig);

    expect((merged as Record<string, unknown>).src).toBe('/ok.pdf');
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(merged, '__proto__')).toBe(false);
  });

  it('refuses to write constructor / prototype keys', () => {
    const merged = mergeViewerConfigs({} satisfies PDFViewerConfig, {
      constructor: { foo: 'bar' },
      prototype: { foo: 'bar' },
      src: '/ok.pdf',
    } as unknown as PDFViewerConfig);

    expect(Object.prototype.hasOwnProperty.call(merged, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(merged, 'prototype')).toBe(false);
    expect((merged as Record<string, unknown>).src).toBe('/ok.pdf');
  });
});
