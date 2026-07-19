import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AnnotationDTO,
  AnnotationFlags,
  AnnotationRef,
  PdfQuad,
} from '@embedpdf/engine-core/runtime';
import type { PluginContext } from '@embedpdf/core';

import { createAnnotationCapability } from './capability';
import { annotationReducer, initialAnnotationState } from './reducer';
import type { AnnotationAction, AnnotationState } from './types';

const PON = 1;
const CROP = { left: 0, bottom: 0, right: 600, top: 800 };
const NO_FLAGS: AnnotationFlags = {
  invisible: false,
  hidden: false,
  print: true,
  noZoom: false,
  noRotate: false,
  noView: false,
  readOnly: false,
  locked: false,
  toggleNoView: false,
  lockedContents: false,
};

const ref = (annotObjectNumber: number): AnnotationRef => ({
  kind: 'objectNumber',
  pageObjectNumber: PON,
  annotObjectNumber,
});

const base = (annotObjectNumber: number) => ({
  ref: ref(annotObjectNumber),
  pageObjectNumber: PON,
  index: annotObjectNumber,
  identityQuality: 'durable' as const,
  nm: null,
  flags: NO_FLAGS,
  contents: null,
  author: null,
  created: null,
  modified: null,
  blendMode: 'normal' as const,
});

const caretDTO = (): AnnotationDTO =>
  ({
    ...base(10),
    subtype: 'caret',
    intent: 'replace',
    rect: { left: 85, bottom: 745, right: 95, top: 755 },
    color: { r: 239, g: 68, b: 68 },
    opacity: 1,
    rectDifferences: { left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 },
    inReplyTo: null,
    replyType: null,
  }) as AnnotationDTO;

const strikeoutDTO = (): AnnotationDTO => {
  const quad: PdfQuad = {
    p1: { x: 10, y: 780 },
    p2: { x: 90, y: 780 },
    p3: { x: 10, y: 765 },
    p4: { x: 90, y: 765 },
  };
  return {
    ...base(11),
    subtype: 'strikeout',
    intent: 'strikeout-text-edit',
    rect: { left: 10, bottom: 765, right: 90, top: 780 },
    color: { r: 239, g: 68, b: 68 },
    opacity: 1,
    quadPoints: [quad],
    inReplyTo: ref(10),
    replyType: 'group',
  };
};

function harness() {
  let state = initialAnnotationState();
  const create = vi.fn();
  const update = vi.fn();
  const remove = vi.fn(async () => ({}));
  const list = vi.fn();
  const ctx = {
    getState: () => state,
    dispatch: (action: AnnotationAction) => {
      state = annotationReducer(state, action);
    },
    document: () => ({ pages: [{ pageObjectNumber: PON, boxes: { crop: CROP } }] }),
    doc: {
      page: () => ({ annotations: { create, update, delete: remove, list } }),
    },
    tryGet: () => null,
  } as unknown as PluginContext<AnnotationState, AnnotationAction>;
  return {
    capability: createAnnotationCapability(ctx),
    create,
    update,
    remove,
    list,
    state: () => state,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Replace Text grouped persistence', () => {
  it('creates the Caret first, then writes StrikeOut /IRT + /RT /Group', async () => {
    const h = harness();
    h.create
      .mockResolvedValueOnce({ created: caretDTO() })
      .mockResolvedValueOnce({ created: strikeoutDTO() });
    const rect = { x: 10, y: 20, width: 80, height: 15 };

    h.capability.createReplaceText(PON, [rect], rect, 'replace-text');
    await vi.waitFor(() => expect(h.create).toHaveBeenCalledTimes(2));

    expect(h.create.mock.calls[0]![0]).toMatchObject({
      subtype: 'caret',
      intent: 'replace',
      flags: { print: true },
    });
    expect(h.create.mock.calls[1]![0]).toMatchObject({
      subtype: 'strikeout',
      intent: 'strikeout-text-edit',
      inReplyTo: ref(10),
      replyType: 'group',
      flags: { print: true },
    });
    const [caretId, strikeoutId] = h.state().model.order;
    expect(h.state().model.byId[strikeoutId]).toMatchObject({
      irt: caretId,
      group: caretId,
    });
    expect(h.state().model.selected).toEqual([caretId, strikeoutId]);
  });

  it('deletes the Caret and removes both optimistic parts when StrikeOut creation fails', async () => {
    const h = harness();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    h.create
      .mockResolvedValueOnce({ created: caretDTO() })
      .mockRejectedValueOnce(new Error('strikeout failed'));
    const rect = { x: 10, y: 20, width: 80, height: 15 };

    h.capability.createReplaceText(PON, [rect], rect, 'replace-text');
    await vi.waitFor(() => expect(h.remove).toHaveBeenCalledWith(ref(10)));
    await vi.waitFor(() => expect(h.state().model.order).toHaveLength(0));
  });
});

describe('annotation flags', () => {
  const squareDTO = (n: number, flags: Partial<AnnotationFlags> = {}): AnnotationDTO =>
    ({
      ...base(n),
      flags: { ...NO_FLAGS, ...flags },
      subtype: 'square',
      rect: { left: 100, bottom: 700, right: 180, top: 760 },
      color: { r: 0, g: 0, b: 0 },
      opacity: 1,
      strokeWidth: 2,
      inReplyTo: null,
      replyType: null,
    }) as AnnotationDTO;

  /** Load one page of DTOs into the model through the real `ensurePage` path. */
  const loadPage = async (h: ReturnType<typeof harness>, dtos: AnnotationDTO[]) => {
    h.list.mockResolvedValueOnce({ annotations: dtos });
    h.capability.ensurePage(PON);
    await vi.waitFor(() => expect(h.state().model.order.length).toBe(dtos.length));
  };

  it('updateSelectionFlags writes a flags-only engine patch and keeps the render source', async () => {
    const h = harness();
    await loadPage(h, [squareDTO(20)]);
    const id = h.state().model.order[0];
    h.capability.select(ref(20));
    h.update.mockResolvedValueOnce({ updated: squareDTO(20, { locked: true }) });

    h.capability.updateSelectionFlags({ locked: true });
    // optimistic: the model flips immediately, source untouched (still baked)
    expect(h.state().model.byId[id].flags.locked).toBe(true);
    expect(h.state().model.byId[id].source).toBe('baked');

    await vi.waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
    const [wref, patch] = h.update.mock.calls[0]!;
    expect(wref).toEqual(ref(20));
    // a flags-ONLY patch: no geometry/style keys ride along, so nothing re-bakes
    expect(patch).toEqual({
      subtype: 'square',
      flags: { ...NO_FLAGS, locked: true },
    });
    // the re-sync preserves 'baked'
    await vi.waitFor(() => expect(h.state().model.byId[id].source).toBe('baked'));
  });

  it('getSelectionFlags reports uniform values and null for mixed', async () => {
    const h = harness();
    await loadPage(h, [squareDTO(21, { locked: true }), squareDTO(22)]);
    expect(h.capability.getSelectionFlags()).toBeNull(); // nothing selected
    h.capability.select(ref(21));
    h.capability.select(ref(22), { add: true });
    const flags = h.capability.getSelectionFlags();
    expect(flags?.print).toBe(true); // uniform
    expect(flags?.locked).toBeNull(); // mixed
    expect(flags?.hidden).toBe(false);
  });

  it('unlocking works on a locked annotation (setFlags bypasses the locked gate)', async () => {
    const h = harness();
    await loadPage(h, [squareDTO(23, { locked: true })]);
    const id = h.state().model.order[0];
    h.capability.select(ref(23));
    h.update.mockResolvedValueOnce({ updated: squareDTO(23) });
    h.capability.updateSelectionFlags({ locked: false });
    expect(h.state().model.byId[id].flags.locked).toBe(false);
    await vi.waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
  });

  it('the data-API create defaults /F to print when the caller omits flags', async () => {
    const h = harness();
    h.create.mockResolvedValueOnce({ created: squareDTO(24) });
    await h.capability.create(PON, {
      subtype: 'square',
      rect: { left: 0, bottom: 0, right: 10, top: 10 },
    } as Parameters<typeof h.capability.create>[1]);
    expect(h.create.mock.calls[0]![0]).toMatchObject({ flags: { print: true } });
  });
});
