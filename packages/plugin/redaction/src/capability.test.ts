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
    const annotation = { createMarkup };
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
