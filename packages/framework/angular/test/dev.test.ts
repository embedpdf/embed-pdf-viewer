/**
 * The development guardrails: each warning fires once, and the page layer facts notice a
 * wrong neighbour on a page whichever layer comes last.
 */
import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  devWarn,
  publishPageLayerFact,
  resetDevWarnings,
  type EpdfPageContext,
  type PageLayerFacts,
} from '@embedpdf/angular/runtime';

let warn: MockInstance<(...data: unknown[]) => void>;
beforeEach(() => {
  resetDevWarnings();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  TestBed.resetTestingModule();
  warn.mockRestore();
});

describe('devWarn', () => {
  it('fires once per key', () => {
    devWarn('key', 'first');
    devWarn('key', 'second');
    devWarn('other', 'third');
    expect(warn.mock.calls.map((call) => call[0])).toEqual([
      '[embedpdf] first',
      '[embedpdf] third',
    ]);
  });
});

describe('page layer facts', () => {
  const publish = async (facts: { page: object; key: keyof PageLayerFacts; value: unknown }[]) => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    for (const [index, fact] of facts.entries()) {
      @Component({ selector: `test-layer-${index}`, template: '' })
      class Layer {
        constructor() {
          publishPageLayerFact(
            fact.page as EpdfPageContext,
            fact.key,
            () => fact.value as PageLayerFacts[typeof fact.key],
          );
        }
      }
      const fixture = TestBed.createComponent(Layer);
      await fixture.whenStable();
    }
  };

  it('warns when a render layer still bakes annotations under an annotation layer', async () => {
    const page = {};
    await publish([
      { page, key: 'renderBakesAnnotations', value: true },
      { page, key: 'annotationRenderers', value: null },
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('[annotations]="false"');
  });

  it('stays quiet when the picture leaves annotations to the layer, or on another page', async () => {
    await publish([
      { page: {}, key: 'renderBakesAnnotations', value: false },
      { page: {}, key: 'annotationRenderers', value: null },
      { page: {}, key: 'renderBakesAnnotations', value: true },
    ]);
    expect(warn).not.toHaveBeenCalled();
  });
});
