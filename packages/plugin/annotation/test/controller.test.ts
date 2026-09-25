import type { DocumentEvent } from '@embedpdf/core';
import { textQuadFromRect } from '@embedpdf/core-geometry';
import type {
  AnnotationDTO,
  AnnotationFlags,
  AnnotationRef,
  PdfQuad,
} from '@embedpdf/engine-core/runtime';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { annotationHarness } from './harness';

const PON = 1;
const PON2 = 2;
const PAGE = toPageRef(PON);
const PAGE2 = toPageRef(PON2);
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
  page: PAGE,
  annotObjectNumber,
});

const base = (annotObjectNumber: number) => ({
  ref: ref(annotObjectNumber),
  page: PAGE,
  index: annotObjectNumber,
  identityQuality: 'durable' as const,
  nm: null,
  ...NO_FLAGS,
  contents: null,
  subject: null,
  author: null,
  createdAt: null,
  modifiedAt: null,
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
    reply: null,
    popup: null,
    groupId: null,
    userId: null,
    createdBy: null,
    modifiedBy: null,
    importedBy: null,
    actions: null,
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
    reply: { to: ref(10), type: 'group' },
    popup: null,
    groupId: null,
    userId: null,
    createdBy: null,
    modifiedBy: null,
    importedBy: null,
    actions: null,
  };
};

const createHarness = annotationHarness;

afterEach(() => vi.restoreAllMocks());

describe('Replace Text grouped persistence', () => {
  it('creates the Caret first, then writes StrikeOut /IRT + /RT /Group', async () => {
    const harness = createHarness();
    harness.create
      .mockResolvedValueOnce({ created: caretDTO() })
      .mockResolvedValueOnce({ created: strikeoutDTO() });
    const rect = { x: 10, y: 20, width: 80, height: 15 };

    harness.capability.createReplaceText(
      PAGE,
      [textQuadFromRect(rect)],
      { glyphQuad: textQuadFromRect(rect), advance: 1 },
      'replace-text',
    );
    await vi.waitFor(() => expect(harness.create).toHaveBeenCalledTimes(2));

    expect(harness.create.mock.calls[0]![0]).toMatchObject({
      subtype: 'caret',
      intent: 'replace',
      print: true,
    });
    expect(harness.create.mock.calls[1]![0]).toMatchObject({
      subtype: 'strikeout',
      intent: 'strikeout-text-edit',
      reply: { to: ref(10), type: 'group' },
      print: true,
    });
    const [caretId, strikeoutId] = harness.model().order;
    expect(harness.model().byId[strikeoutId]).toMatchObject({
      irt: caretId,
      group: caretId,
    });
    expect(harness.model().selected).toEqual([caretId, strikeoutId]);
  });

  it('deletes the Caret and removes both optimistic parts when StrikeOut creation fails', async () => {
    const harness = createHarness();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    harness.create
      .mockResolvedValueOnce({ created: caretDTO() })
      .mockRejectedValueOnce(new Error('strikeout failed'));
    const rect = { x: 10, y: 20, width: 80, height: 15 };

    harness.capability.createReplaceText(
      PAGE,
      [textQuadFromRect(rect)],
      { glyphQuad: textQuadFromRect(rect), advance: 1 },
      'replace-text',
    );
    await vi.waitFor(() => expect(harness.remove).toHaveBeenCalledWith(ref(10)));
    await vi.waitFor(() => expect(harness.model().order).toHaveLength(0));
  });
});

describe('annotation flags', () => {
  const squareDTO = (objectNumber: number, flags: Partial<AnnotationFlags> = {}): AnnotationDTO =>
    ({
      ...base(objectNumber),
      ...NO_FLAGS,
      ...flags,
      subtype: 'square',
      rect: { left: 100, bottom: 700, right: 180, top: 760 },
      color: { r: 0, g: 0, b: 0 },
      opacity: 1,
      strokeWidth: 2,
      reply: null,
      popup: null,
      groupId: null,
      userId: null,
      createdBy: null,
      modifiedBy: null,
      importedBy: null,
      actions: null,
    }) as AnnotationDTO;

  /** Load these records as the document's annotations. */
  const loadPage = async (harness: ReturnType<typeof createHarness>, dtos: AnnotationDTO[]) => {
    await harness.load(dtos);
    expect(harness.model().order.length).toBe(dtos.length);
  };

  it('updateSelectionFlags writes a flags-only engine patch and keeps the render source', async () => {
    const harness = createHarness();
    await loadPage(harness, [squareDTO(20)]);
    const id = harness.model().order[0];
    harness.capability.select(ref(20));
    harness.update.mockResolvedValueOnce({ updated: squareDTO(20, { locked: true }) });

    harness.capability.updateSelectionFlags({ locked: true });
    // optimistic: the model flips immediately, source untouched (still baked)
    expect(harness.model().byId[id].flags.locked).toBe(true);
    expect(harness.model().byId[id].source).toBe('baked');

    await vi.waitFor(() => expect(harness.update).toHaveBeenCalledTimes(1));
    const [wref, patch] = harness.update.mock.calls[0]!;
    expect(wref).toEqual(ref(20));
    // a flags-only patch: no geometry/style keys ride along, so nothing re-bakes
    expect(patch).toEqual({
      subtype: 'square',
      ...NO_FLAGS,
      locked: true,
    });
    // the re-sync preserves 'baked'
    await vi.waitFor(() => expect(harness.model().byId[id].source).toBe('baked'));
  });

  it('getSelectionFlags reports uniform values and null for mixed', async () => {
    const harness = createHarness();
    await loadPage(harness, [squareDTO(21, { locked: true }), squareDTO(22)]);
    expect(harness.capability.getSelectionFlags()).toBeNull(); // nothing selected
    harness.capability.select(ref(21));
    harness.capability.select(ref(22), { add: true });
    const flags = harness.capability.getSelectionFlags();
    expect(flags?.print).toBe(true); // uniform
    expect(flags?.locked).toBeNull(); // mixed
    expect(flags?.hidden).toBe(false);
  });

  it('unlocking works on a locked annotation (setFlags bypasses the locked gate)', async () => {
    const harness = createHarness();
    await loadPage(harness, [squareDTO(23, { locked: true })]);
    const id = harness.model().order[0];
    harness.capability.select(ref(23));
    harness.update.mockResolvedValueOnce({ updated: squareDTO(23) });
    harness.capability.updateSelectionFlags({ locked: false });
    expect(harness.model().byId[id].flags.locked).toBe(false);
    await vi.waitFor(() => expect(harness.update).toHaveBeenCalledTimes(1));
  });

  it('update writes each flag it names as its own engine field', async () => {
    const harness = createHarness();
    await loadPage(harness, [squareDTO(25)]);
    harness.update.mockResolvedValueOnce({ updated: squareDTO(25, { hidden: true }) });
    await harness.capability.update(ref(25), { flags: { hidden: true } });
    expect(harness.update.mock.calls[0]![1]).toEqual({ subtype: 'square', hidden: true });
  });

  it('the data-API create defaults /F to print when the caller omits flags', async () => {
    const harness = createHarness();
    harness.create.mockResolvedValueOnce({ created: squareDTO(24) });
    await harness.capability.createRaw(PAGE, {
      subtype: 'square',
      rect: { left: 0, bottom: 0, right: 10, top: 10 },
    } as Parameters<typeof harness.capability.createRaw>[1]);
    expect(harness.create.mock.calls[0]![0]).toMatchObject({ print: true });
  });
});

describe('claimsTouchAt (touch consent)', () => {
  it('a SELECTED text markup does not claim — selectable, not movable', async () => {
    const harness = createHarness();
    harness.create
      .mockResolvedValueOnce({ created: caretDTO() })
      .mockResolvedValueOnce({ created: strikeoutDTO() });
    const rect = { x: 10, y: 20, width: 80, height: 15 };
    harness.capability.createReplaceText(
      PAGE,
      [textQuadFromRect(rect)],
      { glyphQuad: textQuadFromRect(rect), advance: 1 },
      'replace-text',
    );
    await vi.waitFor(() => expect(harness.create).toHaveBeenCalledTimes(2));
    expect(harness.model().selected.length).toBe(2);
    // the strikeout's body is under the point (the hit-test finds it)…
    expect(harness.capability.getHitKind(PAGE, { x: 50, y: 27 })).toBe('annot');
    // …but the claim must refuse: the selection cannot move, so a drag here
    // would be a dead zone — it has to keep scrolling instead.
    expect(harness.capability.claimsTouchAt(PAGE, { x: 50, y: 27 })).toBe(false);
  });

  it('empty space never claims', () => {
    const harness = createHarness();
    expect(harness.capability.claimsTouchAt(PAGE, { x: 300, y: 400 })).toBe(false);
  });
});

// ── whole-document hydration + remote delivery ──────────────────────────

const hydrationSquare = (objectNumber: number): AnnotationDTO =>
  ({
    ...base(objectNumber),
    subtype: 'square',
    rect: { left: 100, bottom: 700, right: 180, top: 760 },
    color: { r: 0, g: 0, b: 0 },
    opacity: 1,
    strokeWidth: 2,
    reply: null,
    popup: null,
    groupId: null,
    userId: null,
    createdBy: null,
    modifiedBy: null,
    importedBy: null,
    actions: null,
  }) as AnnotationDTO;

/** The mutation meta every annotation event carries (a remote event replays the writer's result). */
const META = {
  affectedPages: [],
  cacheDelta: null,
  changed: [],
  weakRefsInvalidated: false,
  shouldRefetch: null,
};

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
    page: PAGE,
    origin: remoteOrigin(serverId),
    created: dto,
    meta: META,
  }) as unknown as DocumentEvent;

const updatedEvent = (dto: AnnotationDTO, serverId: number, changed: boolean): DocumentEvent =>
  ({
    type: 'annotation.updated',
    page: PAGE,
    origin: remoteOrigin(serverId),
    updated: dto,
    appearance: { changed },
    meta: META,
  }) as unknown as DocumentEvent;

const deletedEvent = (annotObjectNumber: number, serverId: number): DocumentEvent =>
  ({
    type: 'annotation.deleted',
    page: PAGE,
    origin: remoteOrigin(serverId),
    deleted: { kind: 'objectNumber', value: annotObjectNumber },
    meta: META,
  }) as unknown as DocumentEvent;

const snapshot = (dtos: AnnotationDTO[], auditHead?: number) => ({
  pages: [{ pageState: { page: PAGE }, annotations: dtos }],
  ...(auditHead !== undefined ? { auditHead } : {}),
});

describe('the records mirror', () => {
  it('loads the whole document once, after connect', async () => {
    const harness = createHarness();
    harness.listRawAll.mockResolvedValue(snapshot([hydrationSquare(20), hydrationSquare(21)], 40));
    expect(harness.capability.getStatus()).toBe('idle');
    harness.startSync();
    expect(harness.capability.getStatus()).toBe('loading');
    await harness.capability.whenSynced();
    expect(harness.capability.getStatus()).toBe('ready');
    expect(harness.listRawAll).toHaveBeenCalledTimes(1);
    expect(harness.model().order).toHaveLength(2);
  });

  it('queues events during the load and replays them past the audit cursor', async () => {
    const harness = createHarness();
    let resolveSnap!: (value: unknown) => void;
    harness.listRawAll.mockReturnValueOnce(new Promise((resolve) => (resolveSnap = resolve)));
    harness.startSync();

    // A delete newer than the snapshot arrives during the load: the snapshot
    // still contains obj:30, and must not bring it back.
    harness.emit(deletedEvent(30, 45));
    // An update the snapshot already contains (serverId ≤ auditHead) is
    // skipped: replaying it would regress obj:31 to the event's record.
    harness.emit(updatedEvent(hydrationSquare(31), 44, true));

    resolveSnap(snapshot([hydrationSquare(30), hydrationSquare(31)], 44));
    await harness.capability.whenSynced();

    expect(harness.model().byId['obj:30']).toBeUndefined();
    expect(harness.model().order).toEqual(['obj:31']);
    expect(harness.model().byId['obj:31']!.apVersion ?? 0).toBe(0);
  });

  it('applies events live when the load fails', async () => {
    const harness = createHarness();
    let rejectSnap!: (reason: unknown) => void;
    harness.listRawAll.mockReturnValueOnce(
      new Promise((_resolve, reject) => (rejectSnap = reject)),
    );
    harness.startSync();
    harness.emit(createdEvent(hydrationSquare(50), 45));

    rejectSnap(new Error('network down'));
    await harness.capability.whenSynced();
    expect(harness.capability.getStatus()).toBe('error');
    // The queued event applied to the previous (empty) view.
    expect(harness.model().byId['obj:50']).toBeDefined();

    harness.emit(deletedEvent(50, 46));
    expect(harness.model().byId['obj:50']).toBeUndefined();
  });

  it('a reload reaps confirmed records missing from the snapshot and keeps optimistic ones', async () => {
    const harness = createHarness();
    await harness.load([hydrationSquare(40), hydrationSquare(41)], 40);
    expect(harness.model().order).toHaveLength(2);

    // An optimistic create whose engine write never resolves: its temporary
    // records (caret and strikeout) must survive a reload.
    harness.create.mockReturnValue(new Promise(() => {}));
    const rect = { x: 10, y: 20, width: 80, height: 15 };
    harness.capability.createReplaceText(
      PAGE,
      [textQuadFromRect(rect)],
      { glyphQuad: textQuadFromRect(rect), advance: 1 },
      'replace-text',
    );
    const newIds = harness.model().order.filter((id) => id.startsWith('new:'));
    expect(newIds.length).toBeGreaterThan(0);

    // obj:41 was deleted while the stream could not be trusted.
    harness.listRawAll.mockResolvedValueOnce(snapshot([hydrationSquare(40)], 60));
    harness.emit({ type: 'stream.desynced', reason: 'backlog-overflow', ts: 0 } as DocumentEvent);
    await harness.capability.whenSynced();

    expect(harness.model().byId['obj:41']).toBeUndefined();
    expect(harness.model().byId['obj:40']).toBeDefined();
    // A reload re-fetches rasters once: changes during the gap were invisible.
    expect(harness.model().byId['obj:40']!.apVersion).toBe(1);
    for (const id of newIds) expect(harness.model().byId[id]).toBeDefined();
  });

  it("matches this session's create to its optimistic record by /NM, whatever arrives first", async () => {
    const harness = createHarness();
    await harness.load([]);
    harness.create.mockImplementationOnce(async (draft: { nm: string }) => ({
      created: { ...hydrationSquare(60), nm: draft.nm },
    }));
    const created = await harness.capability.create({
      subtype: 'square',
      page: PAGE,
      bounds: { x: 10, y: 10, width: 50, height: 40 },
      select: true,
    });
    expect(created).toEqual(ref(60));
    expect(harness.model().order).toEqual(['obj:60']);
    expect(harness.model().selected).toEqual(['obj:60']);
  });

  it('announces its own changes with the engine session as origin', async () => {
    const harness = createHarness();
    await harness.load([hydrationSquare(70)]);
    const updated = vi.fn();
    harness.capability.onUpdated(updated);
    harness.update.mockResolvedValueOnce({
      updated: hydrationSquare(70),
      appearance: { changed: true },
    });
    await harness.capability.updateRaw(ref(70), { subtype: 'square', contents: 'x' } as never);
    expect(updated).toHaveBeenCalledTimes(1);
    expect(updated.mock.calls[0]![0].origin).toEqual({
      locality: 'local',
      sessionId: 'me',
      actorId: null,
    });
  });
});

describe('links lens — substrate children, no ledger', () => {
  const TARGET = { kind: 'uri', uri: 'https://www.embedpdf.com/' } as const;
  const childDTO = (objectNumber: number, parent: number): AnnotationDTO =>
    ({
      ...hydrationSquare(objectNumber),
      subtype: 'link',
      target: TARGET,
      reply: { to: ref(parent), type: 'group' },
      popup: null,
      groupId: null,
      userId: null,
      createdBy: null,
      modifiedBy: null,
      importedBy: null,
      actions: null,
    }) as unknown as AnnotationDTO;

  it('links.of derives from the committed child; a remote child delete clears it (no sweep)', async () => {
    const harness = createHarness();
    await harness.load([hydrationSquare(20), childDTO(21, 20)]);
    expect(harness.capability.links.get(ref(20))).toEqual(TARGET);
    // The child is substrate: never painted, never hit as itself.
    // A remote session deletes the child → ordinary remove, lens re-derives.
    harness.emit({
      type: 'annotation.deleted',
      page: PAGE,
      deleted: { kind: 'objectNumber', value: 21 },
      meta: META,
      origin: { kind: 'remote', sub: 'alice' },
      ts: Date.now(),
    } as unknown as DocumentEvent);
    expect(harness.capability.links.get(ref(20))).toBe(null);
  });

  it('a linked annotation selects as a SINGLE unit: no ungroup, full selection', async () => {
    const harness = createHarness();
    await harness.load([hydrationSquare(20), childDTO(21, 20)]);
    harness.capability.select(ref(20));
    // One selected id — the child never joins the selection…
    expect(harness.capability.getSelection()).toEqual([ref(20)]);
    // …and the group verbs stay hidden: ungroup on this "group" would strip
    // the child's /IRT and orphan it into an unmanaged standalone link.
    expect(harness.capability.canUngroup()).toBe(false);
    expect(harness.capability.canGroup()).toBe(false);
  });

  it('links.set creates the grouped child and resolves when committed; clear deletes it', async () => {
    const harness = createHarness();
    await harness.load([hydrationSquare(20)]);
    harness.create.mockResolvedValueOnce({ created: childDTO(30, 20) });

    await harness.capability.links.set(ref(20), TARGET);
    // The engine write is the grouped child create…
    expect(harness.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subtype: 'link',
        target: TARGET,
        reply: { to: ref(20), type: 'group' },
      }),
    );
    // …and the lens reads the new value the moment the promise settles.
    expect(harness.capability.links.get(ref(20))).toEqual(TARGET);

    await harness.capability.links.clear(ref(20));
    expect(harness.remove).toHaveBeenCalledWith(ref(30));
    expect(harness.capability.links.get(ref(20))).toBe(null);
  });
});

describe('link nav items — attached vs standalone', () => {
  it('labels attached children so the nav layer can defer to editing', async () => {
    const harness = createHarness();
    await harness.load([
      hydrationSquare(20),
      // The square's attached link child (`/RT /Group` → parent): folds into
      // parent.link and surfaces as an attached nav item over the parent.
      {
        ...hydrationSquare(21),
        subtype: 'link',
        target: { kind: 'uri', uri: 'https://example.com' },
        reply: { to: ref(20), type: 'group' },
        popup: null,
        groupId: null,
        userId: null,
        createdBy: null,
        modifiedBy: null,
        importedBy: null,
        actions: null,
      } as unknown as AnnotationDTO,
      // A standalone document link (no group): navigates under any link-nav
      // tool — never stands down.
      {
        ...hydrationSquare(22),
        subtype: 'link',
        target: { kind: 'uri', uri: 'https://docs.example.com' },
      } as unknown as AnnotationDTO,
    ]);
    const items = harness.capability.listLinkItems(PAGE);
    const byAttached = new Map(items.map((i) => [i.attached, i]));
    expect(items).toHaveLength(2);
    expect(byAttached.get(true)?.target).toEqual({ kind: 'uri', uri: 'https://example.com' });
    expect(byAttached.get(false)?.target).toEqual({ kind: 'uri', uri: 'https://docs.example.com' });
  });
});

describe('conversation plane at the capability boundary', () => {
  it('a remote review-status annotation joins the model but never paints or churns the epoch', async () => {
    const harness = createHarness();
    await harness.load([hydrationSquare(80)]);
    const epochBefore = harness.capability.getAppearanceEpoch(PAGE);

    const statusDto = {
      ...base(81),
      subtype: 'text',
      rect: { left: 100, bottom: 700, right: 120, top: 720 },
      color: { r: 255, g: 255, b: 0 },
      opacity: 1,
      icon: 'note',
      state: 'accepted',
      stateModel: 'review',
      reply: { to: ref(80), type: 'reply' },
      popup: null,
      groupId: null,
      userId: null,
      createdBy: null,
      modifiedBy: null,
      importedBy: null,
      actions: null,
    } as unknown as AnnotationDTO;
    harness.emit(createdEvent(statusDto, 45));

    // In the model (the conversation plane will read it)…
    expect(harness.model().byId['obj:81']).toBeDefined();
    // …but invisible to the page: not painted, and the raster cache key of
    // the page is untouched despite the created-event's bake-fetch default.
    expect(harness.capability.listPageItems(PAGE).map((i) => i.id)).toEqual(['obj:80']);
    expect(harness.capability.getAppearanceEpoch(PAGE)).toBe(epochBefore);
  });
});

describe('the comments lens', () => {
  const NOTE_RECT = { left: 100, bottom: 700, right: 120, top: 720 };
  const textDto = (objectNumber: number, over: Record<string, unknown>): AnnotationDTO =>
    ({
      ...base(objectNumber),
      subtype: 'text',
      rect: NOTE_RECT,
      color: { r: 255, g: 255, b: 0 },
      opacity: 1,
      icon: 'note',
      state: null,
      stateModel: null,
      reply: null,
      popup: null,
      groupId: null,
      userId: null,
      createdBy: null,
      modifiedBy: null,
      importedBy: null,
      actions: null,
      ...over,
    }) as unknown as AnnotationDTO;
  const rootAt = (objectNumber: number, top: number): AnnotationDTO =>
    ({
      ...hydrationSquare(objectNumber),
      rect: { left: 100, bottom: top - 60, right: 180, top },
    }) as AnnotationDTO;
  const page2Root = (objectNumber: number): AnnotationDTO =>
    ({
      ...hydrationSquare(objectNumber),
      ref: { kind: 'objectNumber', page: PAGE2, annotObjectNumber: objectNumber },
      page: PAGE2,
    }) as AnnotationDTO;

  /** Seed: two threads on page 1 (root 20 high, root 25 lower — 20's thread
   *  has a reply and alice's accepted status), one thread on page 2. */
  const seed = async (harness: ReturnType<typeof createHarness>) => {
    await harness.load([
      rootAt(25, 500),
      rootAt(20, 760),
      textDto(21, { reply: { to: ref(20), type: 'reply' }, contents: 'a reply' }),
      textDto(22, {
        reply: { to: ref(20), type: 'reply' },
        popup: null,
        groupId: null,
        createdBy: null,
        modifiedBy: null,
        importedBy: null,
        actions: null,
        state: 'accepted',
        stateModel: 'review',
        userId: 'alice',
        modifiedAt: '2026-08-29T10:00:00Z',
      }),
      page2Root(30),
    ]);
  };

  it('composes display-ordered threads and resolves any member to its thread', async () => {
    const harness = createHarness();
    await seed(harness);
    const threads = harness.capability.comments.listThreads();
    // Page 1 first (top-of-page before lower), then page 2.
    expect(
      threads.map((thread) =>
        thread.root.ref.kind === 'objectNumber' ? thread.root.ref.annotObjectNumber : -1,
      ),
    ).toEqual([20, 25, 30]);
    const t20 = threads[0]!;
    expect(t20.replies).toHaveLength(1);
    expect(t20.review.byReviewer['alice']?.state).toBe('accepted');
    expect(t20.review.mine).toBe(null); // session user 'me' has no status
    // Any member resolves: the reply and the state annotation.
    expect(harness.capability.comments.getThread(ref(21))).toBe(t20);
    expect(harness.capability.comments.getThread(ref(22))).toBe(t20);
    // Memoized: same inputs, same array.
    expect(harness.capability.comments.listThreads()).toBe(threads);
  });

  it('reply writes FLAT to the root, whatever member was passed', async () => {
    const harness = createHarness();
    await seed(harness);
    harness.create.mockResolvedValueOnce({
      created: textDto(40, { reply: { to: ref(20), type: 'reply' }, contents: 'agreed' }),
    });
    const created = await harness.capability.comments.reply(ref(21), 'agreed'); // via the reply
    expect(harness.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subtype: 'text',
        contents: 'agreed',
        icon: 'comment',
        reply: { to: ref(20) }, // the root, not the reply
        print: true,
        noZoom: true,
        noRotate: true,
      }),
    );
    expect(created).toEqual(ref(40));
    expect(harness.model().byId['obj:40']).toBeDefined();
  });

  it('setStatus chains: first to the root, the next to my previous status', async () => {
    const harness = createHarness();
    await seed(harness);
    harness.create.mockResolvedValueOnce({
      created: textDto(41, {
        reply: { to: ref(20), type: 'reply' },
        popup: null,
        groupId: null,
        createdBy: null,
        modifiedBy: null,
        importedBy: null,
        actions: null,
        state: 'accepted',
        stateModel: 'review',
        userId: 'me',
        modifiedAt: '2026-08-29T11:00:00Z',
      }),
    });
    await harness.capability.comments.setStatus(ref(20), 'accepted');
    expect(harness.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        state: 'accepted',
        stateModel: 'review',
        reply: { to: ref(20) },
        hidden: true,
        noZoom: true,
        noRotate: true,
      }),
    );
    expect(harness.capability.comments.getThread(ref(20))!.review.mine?.state).toBe('accepted');

    harness.create.mockResolvedValueOnce({
      created: textDto(42, {
        reply: { to: ref(41), type: 'reply' },
        popup: null,
        groupId: null,
        createdBy: null,
        modifiedBy: null,
        importedBy: null,
        actions: null,
        state: 'rejected',
        stateModel: 'review',
        userId: 'me',
        modifiedAt: '2026-08-29T12:00:00Z',
      }),
    });
    await harness.capability.comments.setStatus(ref(20), 'rejected');
    expect(harness.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'rejected', reply: { to: ref(41) } }), // the ISO chain
    );
    expect(harness.capability.comments.getThread(ref(20))!.review.mine?.state).toBe('rejected');
  });

  it('edit patches contents with the wire subtype', async () => {
    const harness = createHarness();
    await seed(harness);
    harness.update.mockResolvedValueOnce({ updated: rootAt(20, 760) });
    await harness.capability.comments.setText(ref(20), 'new text');
    expect(harness.update).toHaveBeenCalledWith(
      ref(20),
      expect.objectContaining({ subtype: 'square', contents: 'new text' }),
    );
  });

  it('removeThread deletes children first, root last', async () => {
    const harness = createHarness();
    await seed(harness);
    const result = await harness.capability.comments.deleteThread(ref(20));
    expect(result.failed).toEqual([]);
    expect(result.deleted).toEqual([ref(21), ref(22), ref(20)]);
    expect(harness.remove.mock.calls.map((call) => call[0])).toEqual([ref(21), ref(22), ref(20)]);
    expect(harness.capability.comments.getThread(ref(20))).toBe(null);
  });

  it('removeThread preflight: one locked member blocks the whole cascade', async () => {
    const harness = createHarness();
    await harness.load([
      rootAt(20, 760),
      {
        ...textDto(21, { reply: { to: ref(20), type: 'reply' } }),
        ...NO_FLAGS,
        locked: true,
      } as unknown as AnnotationDTO,
    ]);
    const result = await harness.capability.comments.deleteThread(ref(20));
    expect(result.deleted).toEqual([]);
    expect(result.failed.map((failure) => failure.ref)).toEqual([ref(21)]);
    expect(harness.remove).not.toHaveBeenCalled();
  });

  it('permissionsFor splits the two lock flags and aggregates the thread gate', async () => {
    const harness = createHarness();
    await harness.load([
      {
        ...rootAt(20, 760),
        ...NO_FLAGS,
        lockedContents: true,
      } as unknown as AnnotationDTO,
      textDto(21, { reply: { to: ref(20), type: 'reply' } }),
    ]);
    const perms = harness.capability.comments.getPermissions(ref(20));
    expect(perms.canEditText).toBe(false); // lockedContents gates text
    expect(perms.canDelete).toBe(true); // …but not deletion
    expect(perms.canReply).toBe(true);
    expect(perms.canSetStatus).toBe(true);
    expect(perms.canDeleteThread).toBe(true);

    // Lock the reply: the thread gate flips, single-delete of root stays.
    await harness.load([
      rootAt(20, 760),
      {
        ...textDto(21, { reply: { to: ref(20), type: 'reply' } }),
        ...NO_FLAGS,
        locked: true,
      } as unknown as AnnotationDTO,
    ]);
    const perms2 = harness.capability.comments.getPermissions(ref(20));
    expect(perms2.canDelete).toBe(true);
    expect(perms2.canDeleteThread).toBe(false);
  });

  it('a foreign status annotation blocks the THREAD gate for a self-only deleter', async () => {
    const harness = createHarness();
    // `annotations:delete:self`-shaped narrowing: only records stamped
    // with the session's own userId pass.
    harness.allowsAnnotationMutation.mockImplementation(
      (_action, target) => target.userId === 'me',
    );
    await harness.load([
      { ...rootAt(20, 760), userId: 'me' } as unknown as AnnotationDTO,
      textDto(21, { reply: { to: ref(20), type: 'reply' }, userId: 'me' }),
      textDto(22, {
        reply: { to: ref(20), type: 'reply' },
        popup: null,
        groupId: null,
        createdBy: null,
        modifiedBy: null,
        importedBy: null,
        actions: null,
        state: 'accepted',
        stateModel: 'review',
        userId: 'alice',
      }),
    ]);
    const perms = harness.capability.comments.getPermissions(ref(20));
    // My own root and reply delete fine one-by-one…
    expect(perms.canDelete).toBe(true);
    // …but alice's status is a thread member (statusRefs), and the
    // all-or-nothing gate answers for every member.
    expect(perms.canDeleteThread).toBe(false);
  });

  it('canReply/canSetStatus gate on the CREATE mirror, not the target owner', async () => {
    const harness = createHarness();
    harness.allowsAnnotationCreate.mockReturnValue(false);
    await seed(harness);
    const perms = harness.capability.comments.getPermissions(ref(20));
    expect(perms.canReply).toBe(false);
    expect(perms.canSetStatus).toBe(false);
    // Mutation authority is unaffected — separate questions.
    expect(perms.canDelete).toBe(true);
    expect(harness.capability.canCreate()).toBe(false);
  });
});

describe('the twin law — authority fused into presentation and gestures', () => {
  const selfOnly = (harness: ReturnType<typeof createHarness>) =>
    harness.allowsAnnotationMutation.mockImplementation(
      (_action, target) => target.userId === 'me',
    );
  const stamped = (objectNumber: number, userId?: string): AnnotationDTO =>
    ({ ...hydrationSquare(objectNumber), ...(userId ? { userId } : {}) }) as AnnotationDTO;

  it('a foreign record renders the LOCKED treatment: selectable, zero handles', async () => {
    const harness = createHarness();
    selfOnly(harness);
    await harness.load([stamped(20, 'me'), stamped(21, 'alice')]);
    // Own record: full selection chrome.
    harness.capability.select(ref(20));
    expect(
      harness.capability.listChromeNodes(PAGE, 1, 0, 1).filter((node) => node.kind === 'handle')
        .length,
    ).toBeGreaterThan(0);
    // Alice's record under `:self`: selectable, but the same fused predicate
    // that answers canEdit(false) strips every handle — pixels can't lie.
    harness.capability.select(ref(21));
    expect(
      harness.capability.listChromeNodes(PAGE, 1, 0, 1).filter((node) => node.kind === 'handle'),
    ).toHaveLength(0);
    expect(harness.capability.canEdit(ref(21))).toBe(false);
    expect(harness.capability.canDelete(ref(21))).toBe(false);
    expect(harness.capability.canEdit(ref(20))).toBe(true);
  });

  it('no create authority → creation gestures are inert (no ghost, no draft, no 403)', async () => {
    const harness = createHarness();
    harness.allowsAnnotationCreate.mockReturnValue(false);
    harness.capability.createPointer('square', 'down', PAGE, { x: 10, y: 10 });
    harness.capability.createPointer('square', 'move', PAGE, { x: 80, y: 60 });
    harness.capability.createPointer('square', 'up', PAGE, { x: 80, y: 60 }, true);
    expect(harness.model().order).toHaveLength(0);
    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.capability.canCreate()).toBe(false);
  });

  it('EVERY optimistic create door self-refuses, not just the pointer', async () => {
    const harness = createHarness();
    harness.allowsAnnotationCreate.mockReturnValue(false);
    const rect = { x: 10, y: 20, width: 80, height: 15 };
    harness.capability.createMarkup('highlight', PAGE, [textQuadFromRect(rect)], 'highlight');
    harness.capability.createCaret(PAGE, { glyphQuad: textQuadFromRect(rect), advance: 1 });
    harness.capability.createReplaceText(
      PAGE,
      [textQuadFromRect(rect)],
      { glyphQuad: textQuadFromRect(rect), advance: 1 },
      'replace-text',
    );
    await expect(harness.capability.createFromSelection('highlight')).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(harness.model().order).toHaveLength(0);
    expect(harness.create).not.toHaveBeenCalled();
  });

  it('without doc.annotate.read the records are never requested', async () => {
    const harness = createHarness();
    harness.allows.mockImplementation((capability: string) => capability !== 'doc.annotate.read');
    await harness.capability.refresh();
    expect(harness.capability.getStatus()).toBe('forbidden');
    expect(harness.listRawAll).not.toHaveBeenCalled();
    expect(harness.capability.canRead()).toBe(false);
  });

  it('a refused patch rolls the optimistic change back', async () => {
    const harness = createHarness();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await harness.load([stamped(20, 'me')]);
    harness.capability.select(ref(20));
    const id = harness.model().order[0]!;
    const before = harness.model().byId[id]!.style.color;
    harness.update.mockRejectedValueOnce(new Error('Forbidden'));
    harness.capability.updateSelection({ color: '#00ff00' });
    // optimistic first…
    expect(harness.model().byId[id]!.style.color).toBe('#00ff00');
    // …then the refusal restores the pre-patch annotation.
    await vi.waitFor(() => expect(harness.model().byId[id]!.style.color).toBe(before));
  });
});

describe('per-record authorization (collab-resolver mirrors)', () => {
  const stamped = (objectNumber: number, userId?: string): AnnotationDTO =>
    ({ ...hydrationSquare(objectNumber), ...(userId ? { userId } : {}) }) as AnnotationDTO;
  /** `annotations:*:self`-shaped narrowing installed on the harness mirror. */
  const selfOnly = (harness: ReturnType<typeof createHarness>) =>
    harness.allowsAnnotationMutation.mockImplementation(
      (_action, target) => target.userId === 'me',
    );

  it('canEdit/canDelete answer per annotation from the stamped owner', async () => {
    const harness = createHarness();
    selfOnly(harness);
    await harness.load([stamped(20, 'me'), stamped(21, 'alice'), stamped(22)]);
    expect(harness.capability.canEdit(ref(20))).toBe(true);
    expect(harness.capability.canEdit(ref(21))).toBe(false);
    expect(harness.capability.canDelete(ref(20))).toBe(true);
    // Unstamped record → `{}` target: denied under narrowing, same as the engine.
    expect(harness.capability.canDelete(ref(22))).toBe(false);
    // The mirror received the target's own stamp, not the caller's.
    expect(harness.allowsAnnotationMutation).toHaveBeenCalledWith('update', { userId: 'alice' });
    expect(harness.allowsAnnotationMutation).toHaveBeenCalledWith('delete', {});
  });

  it('canGroup requires the per-record update check on EVERY member', async () => {
    const harness = createHarness();
    selfOnly(harness);
    await harness.load([stamped(20, 'me'), stamped(21, 'alice')]);
    harness.capability.select(ref(20));
    harness.capability.select(ref(21), { add: true });
    expect(harness.capability.canGroup()).toBe(false);

    const h2 = createHarness();
    selfOnly(h2);
    await h2.load([stamped(20, 'me'), stamped(21, 'me')]);
    h2.capability.select(ref(20));
    h2.capability.select(ref(21), { add: true });
    expect(h2.capability.canGroup()).toBe(true);
  });
});

describe('remote delivery — echo-driven appearance invalidation', () => {
  const seed = async (harness: ReturnType<typeof createHarness>, dto: AnnotationDTO) => {
    await harness.load([dto]);
  };

  it('a PRESERVED remote update re-syncs the model without an appearance re-fetch', async () => {
    const harness = createHarness();
    await seed(harness, hydrationSquare(70));
    harness.emit(updatedEvent(hydrationSquare(70), 45, false));
    expect(harness.model().byId['obj:70']!.apVersion ?? 0).toBe(0);
    expect(harness.model().byId['obj:70']!.source).toBe('baked');
  });

  it('a REGENERATED remote update advances apVersion exactly once', async () => {
    const harness = createHarness();
    await seed(harness, hydrationSquare(70));
    harness.emit(updatedEvent(hydrationSquare(70), 45, true));
    expect(harness.model().byId['obj:70']!.apVersion).toBe(1);
  });

  it('a remote z-order move never re-fetches appearances', async () => {
    const harness = createHarness();
    await seed(harness, hydrationSquare(70));
    harness.emit({
      type: 'annotation.moved',
      page: PAGE,
      origin: remoteOrigin(45),
      moved: [hydrationSquare(70)],
      meta: META,
    } as unknown as DocumentEvent);
    expect(harness.model().byId['obj:70']!.apVersion ?? 0).toBe(0);
  });
});

describe.each([
  { name: 'line', subtype: 'line' as const, intent: undefined },
  { name: 'distance', subtype: 'line' as const, intent: 'LineDimension' as const },
  { name: 'perimeter', subtype: 'polyline' as const, intent: 'PolyLineDimension' as const },
  { name: 'area', subtype: 'polygon' as const, intent: 'PolygonDimension' as const },
])('$name rendering after local edits', ({ intent, subtype }) => {
  const dto = {
    ...base(72),
    subtype,
    vertices: [
      { x: 100, y: 700 },
      { x: 300, y: 700 },
      { x: 300, y: 600 },
    ],
    intent,
    rect: { left: 100, bottom: 680, right: 300, top: 700 },
    linePoints: { start: { x: 100, y: 700 }, end: { x: 300, y: 700 } },
    color: { r: 0, g: 0, b: 0 },
    strokeWidth: 1,
    interiorColor: null,
    borderStyle: 'solid',
    opacity: 1,
    captionEnabled: true,
    leader: { length: -20 },
    lineEndings: { start: 'none', end: 'none' },
    contents: '200 pt',
    reply: null,
    popup: null,
    groupId: null,
    userId: null,
    createdBy: null,
    modifiedBy: null,
    importedBy: null,
    actions: null,
  } as unknown as AnnotationDTO;

  it('a programmatic update keeps the raster and fetches the one the engine re-baked', async () => {
    const harness = createHarness();
    await harness.load([dto]);
    expect(harness.capability.listPageItems(PAGE)[0].source).toBe('baked');
    const epoch = harness.capability.getAppearanceEpoch(PAGE);

    const updated = { ...dto, strokeWidth: 2 };
    harness.update.mockResolvedValueOnce({ updated, appearance: { changed: true } });
    await harness.capability.updateRaw(dto.ref, { subtype, strokeWidth: 2 });

    expect(harness.capability.getRaw(dto.ref)).toEqual(updated);
    expect(harness.capability.listPageItems(PAGE)[0].source).toBe('baked');
    expect(harness.capability.getAppearanceEpoch(PAGE)).not.toBe(epoch);
  });

  it('preserves vector rendering through consecutive local edits and engine responses', async () => {
    const harness = createHarness();
    await harness.load([dto]);
    harness.capability.select(dto.ref);

    for (const strokeWidth of [2, 3]) {
      const updated = { ...dto, strokeWidth };
      let finishWrite!: (result: unknown) => void;
      harness.update.mockReturnValueOnce(
        new Promise((resolve) => {
          finishWrite = resolve;
        }),
      );
      harness.capability.updateSelection({ strokeWidth });
      expect(harness.capability.listPageItems(PAGE)[0].source).toBe('vector');
      const epoch = harness.capability.getAppearanceEpoch(PAGE);
      expect(epoch).toBe('');

      finishWrite({ updated, appearance: { changed: true } });
      await vi.waitFor(() => expect(harness.capability.getRaw(dto.ref)).toEqual(updated));

      expect(harness.capability.listPageItems(PAGE)[0].source).toBe('vector');
      expect(harness.capability.getAppearanceEpoch(PAGE)).toBe(epoch);
    }
  });
});

describe('distance authoring and recalibration', () => {
  it('uses the viewport at the first point, retaining that snapshot throughout the drag', async () => {
    const harness = createHarness();
    const { measureFromKnownLength } = await import('@embedpdf/engine-core/runtime');
    const fallback = measureFromKnownLength(100, { value: 1, unit: 'm' });
    const region = measureFromKnownLength(100, { value: 10, unit: 'ft' });
    harness.capability.setPageViewports(
      PAGE,
      [{ owned: false, bbox: { left: 0, right: 60, bottom: 700, top: 800 }, measure: region }],
      fallback,
    );
    const dto = {
      ...base(71),
      color: { r: 0, g: 0, b: 0 },
      strokeWidth: 1,
      opacity: 1,
      borderStyle: 'solid',
      subtype: 'line',
      intent: 'LineDimension',
      rect: CROP,
      linePoints: { start: { x: 20, y: 780 }, end: { x: 220, y: 780 } },
      measure: region,
      captionEnabled: true,
    } as AnnotationDTO;
    harness.create.mockResolvedValue({ created: dto });
    harness.capability.createPointer('distance', 'down', PAGE, { x: 20, y: 20 });
    harness.capability.setPageViewports(PAGE, [], fallback);
    harness.capability.createPointer('distance', 'move', PAGE, { x: 220, y: 20 });
    harness.capability.createPointer('distance', 'up', PAGE, { x: 220, y: 20 });
    expect(harness.capability.distanceCreationPage()).toEqual(PAGE);
    harness.capability.createPointer('distance', 'down', PAGE, { x: 220, y: 8 });
    expect(harness.create).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'LineDimension',
        measure: region,
        contents: '20.00 ft',
        captionEnabled: true,
        captionPosition: 'inline',
        leader: { length: 12, extension: 5, offset: 0 },
      }),
    );
    await vi.waitFor(() => expect(harness.capability.getRaw(ref(71))).toBeTruthy());
    expect(harness.capability.listPageItems(PAGE)[0].source).toBe('vector');
    expect(harness.capability.getAppearanceEpoch(PAGE)).toBe('');
    expect(harness.capability.comments.getPermissions(ref(71)).canEditText).toBe(false);
    await expect(harness.capability.comments.setText(ref(71), 'fake value')).rejects.toThrow(
      'derived',
    );
  });
  it('does not create over a winning foreign viewport or before viewport hydration', async () => {
    const harness = createHarness();
    const { measureFromRatio } = await import('@embedpdf/engine-core/runtime');
    harness.capability.createPointer('distance', 'down', PAGE, { x: 20, y: 20 });
    expect(harness.model().draft).toBeNull();
    harness.capability.setPageViewports(
      PAGE,
      [
        { owned: true, bbox: CROP, measure: measureFromRatio(1, 1, 'm') },
        { owned: false, bbox: CROP, measure: { subtype: 'GEO' } },
      ],
      measureFromRatio(1, 1, 'm'),
    );
    harness.capability.createPointer('distance', 'down', PAGE, { x: 20, y: 20 });
    expect(harness.model().draft).toBeNull();
  });
  it('captures calibration with modify authority even without create authority', () => {
    const harness = createHarness(),
      captured = vi.fn();
    harness.allowsAnnotationCreate.mockReturnValue(false);
    harness.capability.onDraftCaptured(captured);
    harness.capability.createPointer('calibrate', 'down', PAGE, { x: 20, y: 20 });
    harness.capability.createPointer('calibrate', 'move', PAGE, { x: 120, y: 20 });
    harness.capability.createPointer('calibrate', 'up', PAGE, { x: 120, y: 20 });
    expect(captured).toHaveBeenCalledWith({
      tool: 'calibrate',
      page: PAGE,
      from: { x: 20, y: 780 },
      to: { x: 120, y: 780 },
    });
    expect(harness.create).not.toHaveBeenCalled();
    harness.allows.mockReturnValue(false);
    harness.capability.createPointer('calibrate', 'down', PAGE, { x: 20, y: 20 });
    expect(harness.model().draft).toBeNull();
  });
  it('reports locked, foreign, unauthorized and failed annotations independently', async () => {
    const harness = createHarness();
    const { measureFromKnownLength } = await import('@embedpdf/engine-core/runtime');
    const scale = measureFromKnownLength(100, { value: 2, unit: 'm' });
    const dtos = [80, 81, 82, 83, 84].map(
      (objectNumber) =>
        ({
          ...base(objectNumber),
          color: { r: 0, g: 0, b: 0 },
          strokeWidth: 1,
          opacity: 1,
          borderStyle: 'solid',
          subtype: 'line',
          rect: CROP,
          intent: 'LineDimension',
          measure: objectNumber === 82 ? { subtype: 'GEO' } : scale,
          captionEnabled: true,
          linePoints: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
          ...NO_FLAGS,
          locked: objectNumber === 81,
          userId: objectNumber === 83 ? 'other' : 'me',
        }) as unknown as AnnotationDTO,
    );
    harness.listRawAll.mockResolvedValue(snapshot(dtos));
    harness.allowsAnnotationMutation.mockImplementation(
      (_action, target) => target.userId !== 'other',
    );
    harness.update.mockImplementation(async (ref: AnnotationRef) => {
      if (ref.kind === 'objectNumber' && ref.annotObjectNumber === 84)
        throw new Error('write failed');
      return { updated: dtos[0], appearance: { changed: true } };
    });
    const report = await harness.capability.remeasurePage(PAGE, scale);
    expect(report.updated).toEqual([ref(80)]);
    expect(report.skipped).toEqual([
      { ref: ref(81), reason: 'locked' },
      { ref: ref(82), reason: 'foreign-measure' },
      { ref: ref(83), reason: 'no-authority' },
    ]);
    expect(report.failed).toMatchObject([{ ref: ref(84), error: { message: 'write failed' } }]);
  });
});

describe.each(['area', 'perimeter'])('%s scale resolution', (tool) => {
  it('freezes the first viewport through multiple vertices and writes shape caption defaults', async () => {
    const harness = createHarness();
    const { measureFromKnownLength } = await import('@embedpdf/engine-core/runtime');
    const region = measureFromKnownLength(100, { value: 10, unit: 'm' });
    const fallback = measureFromKnownLength(100, { value: 1, unit: 'm' });
    harness.capability.setPageViewports(
      PAGE,
      [{ owned: false, bbox: { left: 0, right: 60, bottom: 700, top: 800 }, measure: region }],
      fallback,
    );
    const subtype = tool === 'area' ? 'polygon' : 'polyline';
    harness.create.mockResolvedValue({
      created: {
        ...base(75),
        subtype,
        rect: CROP,
        vertices: [
          { x: 20, y: 780 },
          { x: 220, y: 780 },
          { x: 220, y: 680 },
        ],
        intent: tool === 'area' ? 'PolygonDimension' : 'PolyLineDimension',
        measure: region,
        captionEnabled: true,
        color: { r: 239, g: 68, b: 68 },
        strokeWidth: 1,
        opacity: 1,
      },
    });
    harness.capability.createPointer(tool, 'down', PAGE, { x: 20, y: 20 });
    harness.capability.setPageViewports(PAGE, [], fallback);
    harness.capability.createPointer(tool, 'down', PAGE, { x: 220, y: 20 });
    harness.capability.createPointer(tool, 'down', PAGE, { x: 220, y: 120 });
    harness.capability.finishCreationDraft();
    expect(harness.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subtype,
        measure: region,
        captionEnabled: true,
        contents: tool === 'area' ? '100.00 m²' : '30.00 m',
      }),
    );
    await vi.waitFor(() => expect(harness.capability.getRaw(ref(75))).toBeTruthy());
    expect(harness.capability.listPageItems(PAGE)[0].source).toBe('vector');
    expect(harness.capability.getAppearanceEpoch(PAGE)).toBe('');
  });

  it('rejects unhydrated, foreign and unauthorized creation without starting a draft', async () => {
    const harness = createHarness();
    const { measureFromRatio } = await import('@embedpdf/engine-core/runtime');
    harness.capability.createPointer(tool, 'down', PAGE, { x: 20, y: 20 });
    expect(harness.model().draft).toBeNull();
    harness.capability.setPageViewports(
      PAGE,
      [{ owned: false, bbox: CROP, measure: { subtype: 'GEO' } }],
      measureFromRatio(1, 1, 'm'),
    );
    harness.capability.createPointer(tool, 'down', PAGE, { x: 20, y: 20 });
    expect(harness.model().draft).toBeNull();
    harness.capability.setPageViewports(PAGE, [], measureFromRatio(1, 1, 'm'));
    harness.allowsAnnotationCreate.mockReturnValue(false);
    harness.capability.createPointer(tool, 'down', PAGE, { x: 20, y: 20 });
    expect(harness.model().draft).toBeNull();
  });
});
