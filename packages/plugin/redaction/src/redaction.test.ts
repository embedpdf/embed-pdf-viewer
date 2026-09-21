import type { PluginContext } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/internal';
import { SelectionToken } from '@embedpdf/plugin-selection';
import { toPageRef } from '@embedpdf/engine-core';
import { describe, expect, it, vi } from 'vitest';

import { createRedactionCapability } from './controller';
import type { RedactionAction, RedactionState } from './model';

const noHooks = { onCreated: () => () => {}, onUpdated: () => () => {}, onDeleted: () => () => {} };
const REF = { kind: 'objectNumber' as const, annotObjectNumber: 41, page: toPageRef(7) };

describe('marking the selection', () => {
  const makeCtx = (opts: { selection?: unknown; canCreate?: boolean } = {}) => {
    const createFromSelection = vi.fn(async () => [REF]);
    const annotation = { ...noHooks, createFromSelection, canCreate: () => opts.canCreate ?? true };
    const ctx = {
      doc: null,
      get: (token: unknown) => {
        if (token === AnnotationToken) return annotation;
        throw new Error('unexpected capability');
      },
      tryGet: (token: unknown) => (token === SelectionToken ? (opts.selection ?? null) : null),
      cleanup: () => {},
      document: () => null,
    } as unknown as PluginContext<RedactionState, RedactionAction>;
    return { capability: createRedactionCapability(ctx), createFromSelection };
  };

  it('marks through the annotation plane with the redact preset and clears the selection', async () => {
    const { capability, createFromSelection } = makeCtx({
      selection: { hasSelection: () => true },
    });
    await expect(capability.markSelection()).resolves.toEqual([REF]);
    expect(createFromSelection).toHaveBeenCalledWith('redact', { preset: 'redact', clear: true });
  });

  it('marks nothing without a selection and refuses without a selection plugin', async () => {
    const idle = makeCtx({ selection: { hasSelection: () => false } });
    await expect(idle.capability.markSelection()).resolves.toEqual([]);
    expect(idle.createFromSelection).not.toHaveBeenCalled();
    await expect(makeCtx().capability.markSelection()).rejects.toMatchObject({
      code: 'unsupported',
    });
  });

  it('is refused without create authority', async () => {
    const { capability, createFromSelection } = makeCtx({
      canCreate: false,
      selection: { hasSelection: () => true },
    });
    await expect(capability.markSelection()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(createFromSelection).not.toHaveBeenCalled();
  });
});

describe('the twin law (permissions.md)', () => {
  const APPLY_CAPS = ['doc.redact', 'doc.pages.modify', 'doc.annotate.modify'] as const;

  const makeCtx = (opts: {
    canCreate?: boolean;
    granted?: readonly string[];
    engineSupport?: boolean;
  }) => {
    const annotation = { ...noHooks, canCreate: () => opts.canCreate ?? true };
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
      document: () => null,
    } as unknown as PluginContext<RedactionState, RedactionAction>;
    return { capability: createRedactionCapability(ctx) };
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
});
