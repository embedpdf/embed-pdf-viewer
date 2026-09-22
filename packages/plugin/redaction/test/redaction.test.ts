import { describe, expect, it, vi } from 'vitest';
import { annotationKey, createEventHook, toPageRef } from '@embedpdf/core';
import { createTestContext } from '@embedpdf/core/testing';
import type {
  AnnotationDTO,
  AnnotationRef,
  RedactionApplyResult,
  RedactionApplyScope,
} from '@embedpdf/engine-core';
import type {
  AnnotationChangedEvent,
  AnnotationDeletedEvent,
} from '@embedpdf/plugin-annotation/contract';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { SelectionToken } from '@embedpdf/plugin-selection/contract';

import type { RedactionAppliedEvent } from '../src/contract';
import { createRedactionController } from '../src/controller';
import { initialRedactionState, type RedactionState } from '../src/model';

const PAGE = toPageRef(7);
const OTHER_PAGE = toPageRef(8);
const MARK: AnnotationRef = { kind: 'objectNumber', annotObjectNumber: 41, page: PAGE };
const LOCAL_ORIGIN = {
  kind: 'local',
  sessionId: 'session-a',
  sub: null,
  ts: 0,
  serverId: null,
} as const;
const REMOTE_ORIGIN = {
  kind: 'remote',
  sessionId: 'session-b',
  sub: 'user-b',
  ts: 0,
  serverId: 7,
} as const;
const APPLY_CAPABILITIES = ['doc.redact', 'doc.pages.modify', 'doc.annotate.modify'] as const;

const redactDto = (ref: AnnotationRef, overlayText: string | null = null) =>
  ({
    ref,
    page: ref.page,
    subtype: 'redact',
    rect: { left: 10, bottom: 10, right: 50, top: 50 },
    quadPoints: [],
    overlayText,
  }) as unknown as AnnotationDTO;

const resultOf = (scope: RedactionApplyScope): RedactionApplyResult => ({
  scope,
  results: [],
  removedAnnotationCount: 0,
  meta: null,
});

/** The annotation plugin's host lens, reduced to what redaction reads; lists stay stable until `setRaws`. */
function fakeAnnotation(options: { canCreate?: boolean; raws?: AnnotationDTO[] } = {}) {
  let raws = options.raws ?? [];
  let lists = new Map<number, readonly { ref: AnnotationRef; bounds: object }[]>();
  const created = createEventHook<AnnotationChangedEvent>();
  const updated = createEventHook<AnnotationChangedEvent>();
  const deleted = createEventHook<AnnotationDeletedEvent>();
  return {
    canCreate: () => options.canCreate ?? true,
    createFromSelection: vi.fn(async () => [MARK]),
    list: ({ page }: { page: { pageObjectNumber: number } }) => {
      let list = lists.get(page.pageObjectNumber);
      if (!list) {
        list = raws
          .filter((raw) => raw.ref.page.pageObjectNumber === page.pageObjectNumber)
          .map((raw) => ({ ref: raw.ref, bounds: { x: 10, y: 10, width: 40, height: 40 } }));
        lists.set(page.pageObjectNumber, list);
      }
      return list;
    },
    getRaw: (ref: AnnotationRef) =>
      raws.find((raw) => annotationKey(raw.ref) === annotationKey(ref)) ?? null,
    listRaw: ({ page }: { page: { pageObjectNumber: number } }) =>
      raws.filter((raw) => raw.ref.page.pageObjectNumber === page.pageObjectNumber),
    setRaws: (next: AnnotationDTO[]) => {
      raws = next;
      lists = new Map();
    },
    onCreated: created.on,
    onUpdated: updated.on,
    onDeleted: deleted.on,
    created,
    updated,
    deleted,
  };
}

function harness(
  options: {
    canCreate?: boolean;
    granted?: readonly string[];
    engineSupport?: boolean;
    selection?: unknown;
    raws?: AnnotationDTO[];
    apply?: (scope: RedactionApplyScope) => Promise<RedactionApplyResult>;
  } = {},
) {
  const annotation = fakeAnnotation({ canCreate: options.canCreate, raws: options.raws });
  const granted = new Set<string>(options.granted ?? APPLY_CAPABILITIES);
  // Like the engines: the event for this session's apply is published before the apply resolves.
  const apply = vi.fn(
    options.apply ??
      (async (scope: RedactionApplyScope) => {
        const result = resultOf(scope);
        ctx.emitDocumentEvent({ type: 'redaction.applied', origin: LOCAL_ORIGIN, ...result });
        return result;
      }),
  );
  const ctx = createTestContext<RedactionState>({
    id: 'redaction',
    state: initialRedactionState(),
    pages: [{ ref: PAGE }, { ref: OTHER_PAGE }],
    capabilities: [
      [AnnotationToken, annotation],
      ...(options.selection ? [[SelectionToken, options.selection] as const] : []),
    ],
    doc: {
      redaction: (options.engineSupport ?? true) ? { apply } : undefined,
      security: { allows: (capability: string) => granted.has(capability) },
    } as never,
  });
  const redaction = ctx.connect(createRedactionController(ctx));
  return { ctx, redaction, annotation, apply };
}

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe('marking the selection', () => {
  it('marks through the annotation plugin with the redact preset and clears the selection', async () => {
    const { redaction, annotation } = harness({ selection: { hasSelection: () => true } });
    await expect(redaction.markSelection()).resolves.toEqual([MARK]);
    expect(annotation.createFromSelection).toHaveBeenCalledWith('redact', {
      preset: 'redact',
      clear: true,
    });
  });

  it('marks nothing without a selection and refuses without a selection plugin', async () => {
    const idle = harness({ selection: { hasSelection: () => false } });
    await expect(idle.redaction.markSelection()).resolves.toEqual([]);
    expect(idle.annotation.createFromSelection).not.toHaveBeenCalled();
    await expect(harness().redaction.markSelection()).rejects.toMatchObject({
      code: 'unsupported',
    });
  });

  it('is refused without create authority', async () => {
    const { redaction, annotation } = harness({
      canCreate: false,
      selection: { hasSelection: () => true },
    });
    await expect(redaction.markSelection()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(annotation.createFromSelection).not.toHaveBeenCalled();
  });
});

describe('marking an area or a page', () => {
  it('rejects, never throws, without authority or for an unknown page', async () => {
    const refused = harness({ canCreate: false }).redaction;
    const area = { x: 0, y: 0, width: 10, height: 10 };
    let marking: Promise<unknown> | undefined;
    expect(() => {
      marking = refused.markArea(PAGE, area);
    }).not.toThrow();
    await expect(marking).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(harness().redaction.markPage(toPageRef(99))).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});

describe('authority', () => {
  it('canMark is annotation create authority, because marks are annotations', () => {
    expect(harness({ canCreate: true }).redaction.canMark()).toBe(true);
    expect(harness({ canCreate: false }).redaction.canMark()).toBe(false);
  });

  it('canApply mirrors all three capabilities the engine asserts, not just doc.redact', () => {
    expect(harness().redaction.canApply()).toBe(true);
    // A doc.redact grant without its page and annotation siblings must not arm Apply.
    for (const missing of APPLY_CAPABILITIES) {
      const granted = APPLY_CAPABILITIES.filter((capability) => capability !== missing);
      expect(harness({ granted }).redaction.canApply()).toBe(false);
    }
    expect(harness({ engineSupport: false }).redaction.canApply()).toBe(false);
  });
});

describe('the pending view', () => {
  it('projects redact annotations as marks, reference-stable until the plane changes', () => {
    const { redaction, annotation } = harness({ raws: [redactDto(MARK, 'Secret')] });
    const pending = redaction.listPending();
    expect(pending).toEqual([
      expect.objectContaining({
        ref: MARK,
        pageIndex: 0,
        kind: 'area',
        overlayText: 'Secret',
      }),
    ]);
    expect(redaction.listPending()).toBe(pending);
    expect(redaction.getPendingCount(PAGE)).toBe(1);
    expect(redaction.getPendingCount(OTHER_PAGE)).toBe(0);
    expect(redaction.getPending(MARK)?.overlayText).toBe('Secret');

    annotation.setRaws([]);
    expect(redaction.listPending()).toEqual([]);
    expect(redaction.getPending(MARK)).toBeNull();
  });

  it('announces pending changes from the annotation plugin events', () => {
    const { redaction, annotation } = harness();
    const pages: number[] = [];
    redaction.onPendingChanged((event) =>
      pages.push(...event.pages.map((page) => page.pageObjectNumber)),
    );
    const changed = (subtype: string) =>
      ({ ref: MARK, page: PAGE, subtype }) as unknown as AnnotationChangedEvent;
    annotation.created.emit(changed('redact'));
    annotation.updated.emit(changed('square'));
    annotation.deleted.emit({ ref: MARK, page: OTHER_PAGE } as AnnotationDeletedEvent);
    expect(pages).toEqual([7, 8]);
  });
});

describe('applying', () => {
  it('takes the result and the event of its own apply from the confirmed document event', async () => {
    const { redaction, apply } = harness({ raws: [redactDto(MARK)] });
    const applied: RedactionAppliedEvent[] = [];
    redaction.onApplied((event) => applied.push(event));

    const result = await redaction.apply([MARK]);

    expect(apply).toHaveBeenCalledWith({ kind: 'annotations', refs: [MARK] });
    expect(result.scope).toEqual({ kind: 'annotations', refs: [MARK] });
    expect(redaction.getLastResult()).toEqual(result);
    expect(applied).toHaveLength(1);
    expect(applied[0]!.result).toEqual(result);
    expect(applied[0]!.origin).toEqual({
      locality: 'local',
      sessionId: 'session-a',
      actorId: null,
    });
    expect(redaction.isApplying()).toBe(false);
  });

  it('records a collaborator apply and fires onApplied with its origin', () => {
    const { ctx, redaction } = harness();
    const applied: RedactionAppliedEvent[] = [];
    redaction.onApplied((event) => applied.push(event));
    const result = resultOf({ kind: 'pages', pages: [PAGE] });

    ctx.emitDocumentEvent({ type: 'redaction.applied', origin: REMOTE_ORIGIN, ...result });

    expect(redaction.getLastResult()).toEqual(result);
    expect(applied).toEqual([
      { result, origin: { locality: 'remote', sessionId: 'session-b', actorId: 'user-b' } },
    ]);
  });

  it('is applying only while the engine call runs', async () => {
    let release: () => void = () => {};
    const { ctx, redaction } = harness({
      apply: (scope) =>
        new Promise((resolve) => {
          release = () => {
            const result = resultOf(scope);
            ctx.emitDocumentEvent({ type: 'redaction.applied', origin: LOCAL_ORIGIN, ...result });
            resolve(result);
          };
        }),
    });
    const running = redaction.applyPages([PAGE]);
    await tick();
    expect(redaction.isApplying()).toBe(true);
    release();
    await running;
    expect(redaction.isApplying()).toBe(false);
  });

  it('runs concurrent applies one at a time, in call order', async () => {
    const releases: (() => void)[] = [];
    let active = 0;
    let maxActive = 0;
    const { ctx, redaction, apply } = harness({
      raws: [redactDto(MARK)],
      apply: (scope) =>
        new Promise((resolve) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          releases.push(() => {
            active -= 1;
            const result = resultOf(scope);
            ctx.emitDocumentEvent({ type: 'redaction.applied', origin: LOCAL_ORIGIN, ...result });
            resolve(result);
          });
        }),
    });

    const first = redaction.apply([MARK]);
    const second = redaction.applyPages([OTHER_PAGE]);
    await tick();
    expect(apply).toHaveBeenCalledTimes(1);

    releases[0]!();
    await first;
    await tick();
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply.mock.calls[1]![0]).toEqual({ kind: 'pages', pages: [OTHER_PAGE] });

    releases[1]!();
    await second;
    expect(maxActive).toBe(1);
    expect(redaction.getLastResult()?.scope).toEqual({ kind: 'pages', pages: [OTHER_PAGE] });
  });

  it('keeps applying after a failed apply', async () => {
    let calls = 0;
    const { ctx, redaction } = harness({
      apply: async (scope) => {
        calls += 1;
        if (calls === 1) throw new Error('engine failure');
        const result = resultOf(scope);
        ctx.emitDocumentEvent({ type: 'redaction.applied', origin: LOCAL_ORIGIN, ...result });
        return result;
      },
    });
    const failed = redaction.applyPages([PAGE]);
    const next = redaction.applyPages([OTHER_PAGE]);
    await expect(failed).rejects.toThrow('engine failure');
    await expect(next).resolves.toMatchObject({ scope: { kind: 'pages', pages: [OTHER_PAGE] } });
    expect(redaction.isApplying()).toBe(false);
  });

  it('refuses refs that are not pending marks, empty page lists and a missing engine service', async () => {
    const { redaction, apply } = harness();
    await expect(redaction.apply([MARK])).rejects.toMatchObject({ code: 'not-found' });
    await expect(redaction.applyPages([])).rejects.toMatchObject({ code: 'invalid-input' });
    expect(apply).not.toHaveBeenCalled();
    await expect(harness({ engineSupport: false }).redaction.applyAll()).rejects.toMatchObject({
      code: 'unsupported',
    });
  });

  it('applies every page of the document in pages scope', async () => {
    const { redaction, apply } = harness();
    await redaction.applyAll();
    expect(apply).toHaveBeenCalledWith({ kind: 'pages', pages: [PAGE, OTHER_PAGE] });
  });
});
