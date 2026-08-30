import type { PluginContext } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/internal';
import { SelectionToken } from '@embedpdf/plugin-selection';
import { describe, expect, it, vi } from 'vitest';
import { createRedactionCapability } from './capability';
import type { RedactionAction, RedactionState } from './types';

describe('redaction selection geometry', () => {
  it('forwards oriented selection quads without expanding them to AABBs', async () => {
    const quad = {
      upperStart: { x: 10, y: 20 },
      upperEnd: { x: 30, y: 40 },
      lowerStart: { x: 5, y: 25 },
      lowerEnd: { x: 25, y: 45 },
    };
    const createMarkup = vi.fn();
    const clear = vi.fn();
    const annotation = { createMarkup, canCreate: () => true };
    const selection = {
      hasSelection: () => true,
      snapshot: () => ({
        pages: [
          {
            pon: 7,
            segments: [{ quad, rect: { x: 5, y: 20, width: 25, height: 25 }, advance: 1 }],
            rects: [{ x: 5, y: 20, width: 25, height: 25 }],
          },
        ],
        start: null,
        end: null,
        direction: 'forward',
      }),
      clear,
    };
    const ctx = {
      doc: null,
      get: (token: unknown) => {
        if (token === AnnotationToken) return annotation;
        throw new Error('unexpected capability');
      },
      tryGet: (token: unknown) => (token === SelectionToken ? selection : null),
    } as unknown as PluginContext<RedactionState, RedactionAction>;

    const capability = createRedactionCapability(ctx);
    await expect(capability.queueCurrentSelection()).resolves.toBe(true);
    expect(createMarkup).toHaveBeenCalledWith('redact', 7, [quad], 'redact');
    expect(clear).toHaveBeenCalledOnce();
  });
});

describe('the twin law (permissions.md)', () => {
  const APPLY_CAPS = ['doc.redact', 'doc.pages.modify', 'doc.annotate.modify'] as const;

  const makeCtx = (opts: {
    canCreate?: boolean;
    granted?: readonly string[];
    engineSupport?: boolean;
  }) => {
    const createMarkup = vi.fn();
    const annotation = { createMarkup, canCreate: () => opts.canCreate ?? true };
    const granted = new Set(opts.granted ?? APPLY_CAPS);
    const ctx = {
      doc: {
        redaction: (opts.engineSupport ?? true) ? {} : undefined,
        security: { allows: (cap: string) => granted.has(cap) },
        events: { subscribe: () => () => {} },
      },
      get: (token: unknown) => {
        if (token === AnnotationToken) return annotation;
        throw new Error('unexpected capability');
      },
      tryGet: () => null,
      cleanup: () => {},
    } as unknown as PluginContext<RedactionState, RedactionAction>;
    return { capability: createRedactionCapability(ctx), createMarkup };
  };

  it('canMark IS annotation create authority — marks are annotations', () => {
    expect(makeCtx({ canCreate: true }).capability.canMark()).toBe(true);
    expect(makeCtx({ canCreate: false }).capability.canMark()).toBe(false);
  });

  it('canApply mirrors ALL THREE engine assertions, not just doc.redact', () => {
    expect(makeCtx({}).capability.canApply()).toBe(true);
    // An à-la-carte doc.redact grant without its bit-4 siblings must not arm Apply.
    for (const missing of APPLY_CAPS) {
      const granted = APPLY_CAPS.filter((c) => c !== missing);
      expect(makeCtx({ granted }).capability.canApply()).toBe(false);
    }
    expect(makeCtx({ engineSupport: false }).capability.canApply()).toBe(false);
  });

  it('queueCurrentSelection is inert without create authority', async () => {
    const { capability, createMarkup } = makeCtx({ canCreate: false });
    await expect(capability.queueCurrentSelection()).resolves.toBe(false);
    expect(createMarkup).not.toHaveBeenCalled();
  });
});
