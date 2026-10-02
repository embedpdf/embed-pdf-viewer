import { h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { devWarn, resetDevWarnings } from '../src/dev';
import { usePageLayerFact } from '../src/dev-registry';
import type { PageLayerFacts } from '../src/dev-registry';
import { probe } from './counter-plugin';

/**
 * The development guardrails: each warning fires once, and the page-layer
 * registry notices a wrong neighbour whichever layer mounts last.
 */
const layer = <Key extends keyof PageLayerFacts>(
  page: object,
  fact: Key,
  value: PageLayerFacts[Key],
) =>
  h(
    probe(() => {
      usePageLayerFact(page, fact, value);
    }),
  );

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetDevWarnings();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});
enableAutoUnmount(afterEach);

describe('devWarn', () => {
  it('fires once per key', () => {
    devWarn('k', 'first');
    devWarn('k', 'second');
    devWarn('other', 'third');
    expect(warn.mock.calls.map((call) => call[0])).toEqual(['[embedpdf] first', '[embedpdf] third']);
  });
});

describe('page layer facts', () => {
  it('warns when a RenderLayer still bakes annotations under an AnnotationLayer', () => {
    const page = {};
    mount(() => [
      layer(page, 'renderBakesAnnotations', true),
      layer(page, 'annotationRenderers', null),
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain(':annotations="false"');
  });

  it('stays quiet when the raster leaves annotations to the layer, or on another page', () => {
    mount(() => [
      layer({}, 'renderBakesAnnotations', false),
      layer({}, 'annotationRenderers', null),
      layer({}, 'renderBakesAnnotations', true),
    ]);
    expect(warn).not.toHaveBeenCalled();
  });
});
