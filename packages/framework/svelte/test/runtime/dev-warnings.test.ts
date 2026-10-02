import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { devWarn, resetDevWarnings } from '../../src/runtime/dev';
import LayerFacts from '../fixtures/LayerFacts.svelte';

/**
 * The development guardrails: each warning fires once, and the page-layer registry notices a
 * wrong neighbour whichever layer mounts last.
 */

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetDevWarnings();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('devWarn', () => {
  it('fires once per key', () => {
    devWarn('k', 'first');
    devWarn('k', 'second');
    devWarn('other', 'third');
    expect(warn.mock.calls.map((call) => call[0])).toEqual([
      '[embedpdf] first',
      '[embedpdf] third',
    ]);
  });
});

describe('page layer facts', () => {
  it('warns when a RenderLayer still bakes annotations under an AnnotationLayer', () => {
    const page = {};
    render(LayerFacts, {
      props: {
        facts: [
          { page, fact: 'renderBakesAnnotations', value: true },
          { page, fact: 'annotationRenderers', value: null },
        ],
      },
    });
    flushSync();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('annotations={false}');
  });

  it('stays quiet when the raster leaves annotations to the layer, or on another page', () => {
    render(LayerFacts, {
      props: {
        facts: [
          { page: {}, fact: 'renderBakesAnnotations', value: false },
          { page: {}, fact: 'annotationRenderers', value: null },
          { page: {}, fact: 'renderBakesAnnotations', value: true },
        ],
      },
    });
    flushSync();
    expect(warn).not.toHaveBeenCalled();
  });
});
