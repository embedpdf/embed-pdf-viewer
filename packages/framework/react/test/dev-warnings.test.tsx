// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { devWarn, resetDevWarnings } from '../src/dev';
import { usePageLayerFact } from '../src/dev-registry';
import type { PageLayerFacts } from '../src/dev-registry';

/**
 * The development guardrails: each warning fires once, and the page-layer
 * registry notices a wrong neighbour whichever layer mounts last.
 */
function Layer<K extends keyof PageLayerFacts>({
  page,
  fact,
  value,
}: {
  page: object;
  fact: K;
  value: PageLayerFacts[K];
}) {
  usePageLayerFact(page, fact, value);
  return null;
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetDevWarnings();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  warn.mockRestore();
});

describe('devWarn', () => {
  it('fires once per key', () => {
    devWarn('k', 'first');
    devWarn('k', 'second');
    devWarn('other', 'third');
    expect(warn.mock.calls.map((c) => c[0])).toEqual(['[embedpdf] first', '[embedpdf] third']);
  });
});

describe('page layer facts', () => {
  it('warns when a RenderLayer still bakes annotations under an AnnotationLayer', () => {
    const page = {};
    render(
      <>
        <Layer page={page} fact="renderBakesAnnotations" value={true} />
        <Layer page={page} fact="annotationRenderers" value={null} />
      </>,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('annotations={false}');
  });

  it('stays quiet when the raster leaves annotations to the layer, or on another page', () => {
    render(
      <>
        <Layer page={{}} fact="renderBakesAnnotations" value={false} />
        <Layer page={{}} fact="annotationRenderers" value={null} />
        <Layer page={{}} fact="renderBakesAnnotations" value={true} />
      </>,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when a FormLayer sits beside the form widget renderer', () => {
    const page = {};
    render(
      <>
        <Layer page={page} fact="formLayer" value={true} />
        <Layer
          page={page}
          fact="annotationRenderers"
          value={[{ behavior: 'form-widgets' }, { behavior: 'other' }]}
        />
      </>,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('<FormLayer>');
  });
});
