import { textQuadFromRect } from '@embedpdf/core-geometry';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AnnotationDTO,
  AnnotationFlags,
  AnnotationRef,
  PdfQuad,
} from '@embedpdf/engine-core/runtime';
import type { DocumentEvent, PluginContext } from '@embedpdf/core';

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
  subject: null,
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
  const listRawAll = vi.fn();
  const ctx = {
    getState: () => state,
    dispatch: (action: AnnotationAction) => {
      state = annotationReducer(state, action);
    },
    document: () => ({ pages: [{ pageObjectNumber: PON, boxes: { crop: CROP } }] }),
    doc: {
      page: () => ({ annotations: { create, update, delete: remove, list } }),
      annotations: { listRawAll },
    },
    tryGet: () => null,
  } as unknown as PluginContext<AnnotationState, AnnotationAction>;
  return {
    capability: createAnnotationCapability(ctx),
    create,
    update,
    remove,
    list,
    listRawAll,
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

    h.capability.createReplaceText(
      PON,
      [textQuadFromRect(rect)],
      { glyphQuad: textQuadFromRect(rect), advance: 1 },
      'replace-text',
    );
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

    h.capability.createReplaceText(
      PON,
      [textQuadFromRect(rect)],
      { glyphQuad: textQuadFromRect(rect), advance: 1 },
      'replace-text',
    );
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

  /** Load one page of DTOs into the model through the real `reloadPage`
   *  path (`ensurePage` is a no-op under whole-document hydration). */
  const loadPage = async (h: ReturnType<typeof harness>, dtos: AnnotationDTO[]) => {
    h.list.mockResolvedValueOnce({ annotations: dtos });
    await h.capability.reloadPage(PON);
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

describe('claimsTouchAt (touch consent)', () => {
  it('a SELECTED text markup does not claim — selectable, not movable', async () => {
    const h = harness();
    h.create
      .mockResolvedValueOnce({ created: caretDTO() })
      .mockResolvedValueOnce({ created: strikeoutDTO() });
    const rect = { x: 10, y: 20, width: 80, height: 15 };
    h.capability.createReplaceText(
      PON,
      [textQuadFromRect(rect)],
      { glyphQuad: textQuadFromRect(rect), advance: 1 },
      'replace-text',
    );
    await vi.waitFor(() => expect(h.create).toHaveBeenCalledTimes(2));
    expect(h.state().model.selected.length).toBe(2);
    // the strikeout's body IS under the point (the hit-test finds it)…
    expect(h.capability.hitKind(PON, { x: 50, y: 27 })).toBe('annot');
    // …but the claim must refuse: the selection cannot MOVE, so a drag here
    // would be a dead zone — it has to keep scrolling instead.
    expect(h.capability.claimsTouchAt(PON, { x: 50, y: 27 })).toBe(false);
  });

  it('empty space never claims', () => {
    const h = harness();
    expect(h.capability.claimsTouchAt(PON, { x: 300, y: 400 })).toBe(false);
  });
});

// ── whole-document hydration + remote delivery ──────────────────────────

const hydrationSquare = (n: number): AnnotationDTO =>
  ({
    ...base(n),
    subtype: 'square',
    rect: { left: 100, bottom: 700, right: 180, top: 760 },
    color: { r: 0, g: 0, b: 0 },
    opacity: 1,
    strokeWidth: 2,
    inReplyTo: null,
    replyType: null,
  }) as AnnotationDTO;

const remoteOrigin = (serverId: number) => ({
  kind: 'remote' as const,
  sessionId: 'cloud:other',
  sub: 'u-2',
  ts: 0,
  serverId,
});

const createdEvent = (dto: AnnotationDTO, serverId: number): DocumentEvent =>
  ({
    type: 'annotation.created',
    pageObjectNumber: PON,
    origin: remoteOrigin(serverId),
    created: dto,
  }) as unknown as DocumentEvent;

const updatedEvent = (dto: AnnotationDTO, serverId: number, changed: boolean): DocumentEvent =>
  ({
    type: 'annotation.updated',
    pageObjectNumber: PON,
    origin: remoteOrigin(serverId),
    updated: dto,
    appearance: { changed },
  }) as unknown as DocumentEvent;

const deletedEvent = (annotObjectNumber: number, serverId: number): DocumentEvent =>
  ({
    type: 'annotation.deleted',
    pageObjectNumber: PON,
    origin: remoteOrigin(serverId),
    deleted: { kind: 'objectNumber', value: annotObjectNumber },
  }) as unknown as DocumentEvent;

const snapshot = (dtos: AnnotationDTO[], auditHead?: number) => ({
  pages: [{ pageState: { pageObjectNumber: PON }, annotations: dtos }],
  ...(auditHead !== undefined ? { auditHead } : {}),
});

describe('whole-document hydration', () => {
  it('ingests the listRawAll snapshot once and reports complete', async () => {
    const h = harness();
    h.listRawAll.mockResolvedValue(snapshot([hydrationSquare(20), hydrationSquare(21)], 40));
    expect(h.state().hydration.status).toBe('loading');
    h.capability.ensureHydrated();
    h.capability.ensureHydrated(); // second kick no-ops
    await vi.waitFor(() => expect(h.state().hydration.status).toBe('complete'));
    expect(h.listRawAll).toHaveBeenCalledTimes(1);
    expect(h.state().model.order).toHaveLength(2);
  });

  it('queues remote events during the window and replays by audit cursor', async () => {
    const h = harness();
    let resolveSnap!: (value: unknown) => void;
    h.listRawAll.mockReturnValueOnce(new Promise((resolve) => (resolveSnap = resolve)));
    h.capability.ensureHydrated();

    // A delete NEWER than the snapshot arrives mid-hydration — the
    // resurrection setup: the stale snapshot still contains obj:30.
    h.capability.deliverRemoteAnnotationEvent(deletedEvent(30, 45));
    // An update ALREADY REFLECTED in the snapshot (serverId ≤ auditHead)
    // must drop — replaying it would regress obj:31 to the event's DTO.
    h.capability.deliverRemoteAnnotationEvent(updatedEvent(hydrationSquare(31), 44, true));

    resolveSnap(snapshot([hydrationSquare(30), hydrationSquare(31)], 44));
    await vi.waitFor(() => expect(h.state().hydration.status).toBe('complete'));

    // obj:30 was ingested from the snapshot, then the queued newer delete
    // replayed on top — resurrection structurally impossible.
    expect(h.state().model.byId['obj:30']).toBeUndefined();
    expect(h.state().model.order).toEqual(['obj:31']);
    // The stale queued update was dropped: no apVersion bump beyond ingest.
    expect(h.state().model.byId['obj:31']!.apVersion ?? 0).toBe(0);
  });

  it('falls back to live application when hydration fails', async () => {
    const h = harness();
    let rejectSnap!: (reason: unknown) => void;
    h.listRawAll.mockReturnValueOnce(new Promise((_r, reject) => (rejectSnap = reject)));
    h.capability.ensureHydrated();
    h.capability.deliverRemoteAnnotationEvent(createdEvent(hydrationSquare(50), 45));

    rejectSnap(new Error('network down'));
    await vi.waitFor(() => expect(h.state().hydration.status).toBe('error'));
    // The queued event applied live — the view stays as correct as it can.
    expect(h.state().model.byId['obj:50']).toBeDefined();

    // A later event applies directly (no window open any more).
    h.capability.deliverRemoteAnnotationEvent(deletedEvent(50, 46));
    expect(h.state().model.byId['obj:50']).toBeUndefined();
  });

  it('rehydrate reaps committed entries missing from the snapshot and keeps optimistic drafts', async () => {
    const h = harness();
    h.listRawAll.mockResolvedValueOnce(snapshot([hydrationSquare(40), hydrationSquare(41)], 40));
    h.capability.ensureHydrated();
    await vi.waitFor(() => expect(h.state().model.order).toHaveLength(2));

    // An optimistic creation whose engine confirm never lands: two tmp
    // annots (caret + strikeout) that a rehydrate must never reap.
    h.create.mockReturnValue(new Promise(() => {}));
    const rect = { x: 10, y: 20, width: 80, height: 15 };
    h.capability.createReplaceText(
      PON,
      [textQuadFromRect(rect)],
      { glyphQuad: textQuadFromRect(rect), advance: 1 },
      'replace-text',
    );
    const tmpIds = h.state().model.order.filter((id) => id.startsWith('tmp:'));
    expect(tmpIds.length).toBeGreaterThan(0);

    // The gap deleted obj:41 — the fresh snapshot no longer contains it.
    h.listRawAll.mockResolvedValueOnce(snapshot([hydrationSquare(40)], 60));
    await h.capability.rehydrate();
    await vi.waitFor(() => expect(h.state().hydration.status).toBe('complete'));

    expect(h.state().model.byId['obj:41']).toBeUndefined();
    expect(h.state().model.byId['obj:40']).toBeDefined();
    // Desync re-ingest bumps rasters once (gap changes were invisible).
    expect(h.state().model.byId['obj:40']!.apVersion).toBe(1);
    for (const id of tmpIds) expect(h.state().model.byId[id]).toBeDefined();
  });
});

describe('conversation plane at the capability boundary', () => {
  it('a remote review-status annotation joins the model but never paints or churns the epoch', async () => {
    const h = harness();
    h.list.mockResolvedValueOnce({ annotations: [hydrationSquare(80)] });
    await h.capability.reloadPage(PON);
    const epochBefore = h.capability.appearanceEpoch(PON);

    const statusDto = {
      ...base(81),
      subtype: 'text',
      rect: { left: 100, bottom: 700, right: 120, top: 720 },
      color: { r: 255, g: 255, b: 0 },
      opacity: 1,
      icon: 'note',
      state: 'accepted',
      stateModel: 'review',
      inReplyTo: ref(80),
      replyType: 'reply',
    } as unknown as AnnotationDTO;
    h.capability.deliverRemoteAnnotationEvent(createdEvent(statusDto, 45));

    // In the model (the conversation plane will read it)…
    expect(h.state().model.byId['obj:81']).toBeDefined();
    // …but invisible to the page: not painted, and the raster cache key of
    // the page is untouched despite the created-event's bake-fetch default.
    expect(h.capability.pageItems(PON).map((i) => i.id)).toEqual(['obj:80']);
    expect(h.capability.appearanceEpoch(PON)).toBe(epochBefore);
  });
});

describe('remote delivery — echo-driven appearance invalidation', () => {
  const seed = async (h: ReturnType<typeof harness>, dto: AnnotationDTO) => {
    h.list.mockResolvedValueOnce({ annotations: [dto] });
    await h.capability.reloadPage(PON);
  };

  it('a PRESERVED remote update re-syncs the model without an appearance re-fetch', async () => {
    const h = harness();
    await seed(h, hydrationSquare(70));
    h.capability.deliverRemoteAnnotationEvent(updatedEvent(hydrationSquare(70), 45, false));
    expect(h.state().model.byId['obj:70']!.apVersion ?? 0).toBe(0);
    expect(h.state().model.byId['obj:70']!.source).toBe('baked');
  });

  it('a REGENERATED remote update advances apVersion exactly once', async () => {
    const h = harness();
    await seed(h, hydrationSquare(70));
    h.capability.deliverRemoteAnnotationEvent(updatedEvent(hydrationSquare(70), 45, true));
    expect(h.state().model.byId['obj:70']!.apVersion).toBe(1);
  });

  it('a remote z-order move never re-fetches appearances', async () => {
    const h = harness();
    await seed(h, hydrationSquare(70));
    h.capability.deliverRemoteAnnotationEvent({
      type: 'annotation.moved',
      pageObjectNumber: PON,
      origin: remoteOrigin(45),
      moved: [hydrationSquare(70)],
    } as unknown as DocumentEvent);
    expect(h.state().model.byId['obj:70']!.apVersion ?? 0).toBe(0);
  });
});
