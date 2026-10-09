import { describe, expect, it, vi } from 'vitest';
import { annotationKey, createEventHook, toPageRef } from '@embedpdf/core';
import { createTestContext } from '@embedpdf/core/testing';
import type {
  Annotation,
  AnnotationRef,
  RedactionApplyResult,
  RedactionApplyScope,
} from '@embedpdf/engine-core';
import type {
  AnnotationCreatedEvent,
  AnnotationDeletedEvent,
} from '@embedpdf/plugin-annotation/contract';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { SelectionToken } from '@embedpdf/plugin-selection/contract';

import {
  REDACTION_DEFAULTS,
  type RedactionAppliedEvent,
  type RedactionConfig,
} from '../src/contract';
import { createRedactionController } from '../src/controller';
import { initialRedactionState } from '../src/model';
import { redactionState } from '../src/state';

const PAGE = toPageRef(7);
const OTHER_PAGE = toPageRef(8);
const MARK: AnnotationRef = { kind: 'objectNumber', objectNumber: 41, page: PAGE };
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

const redactDto = (ref: AnnotationRef, overlayText: string | null = null, repeat = false) =>
  ({
    ref,
    page: ref.page,
    subtype: 'redact',
    rect: { x: 10, y: 10, width: 40, height: 40 },
    quadPoints: [],
    overlayText,
    repeat,
  }) as unknown as Annotation;

const resultOf = (scope: RedactionApplyScope): RedactionApplyResult => ({
  scope,
  results: [],
  removedAnnotationCount: 0,
  meta: { affectedPages: [], cacheDelta: null, opId: 'op-1', undoable: false },
});

/** The annotation plugin's host lens, reduced to what redaction reads; lists stay stable until `setRaws`. */
function fakeAnnotation(
  options: { raws?: Annotation[]; canDelete?: boolean; canUpdate?: boolean } = {},
) {
  let raws = options.raws ?? [];
  let lists = new Map<number, readonly Annotation[]>();
  const created = createEventHook<AnnotationCreatedEvent>();
  const updated = createEventHook<AnnotationCreatedEvent>();
  const deleted = createEventHook<AnnotationDeletedEvent>();
  // The redact tool's defaults, as the annotation plugin keeps them.
  let toolDefaults: Record<string, unknown> = {
    color: '#e44234',
    interiorColor: '#000000',
    fontSize: 14,
    fontColor: '#ffffff',
    opacity: 1,
  };
  let next = 60;
  return {
    createFromSelection: vi.fn(async () => ({ annotations: [redactDto(MARK)] })),
    create: vi.fn(async (page: { objectNumber: number }, draft: Record<string, unknown>) => ({
      annotation: {
        ...redactDto({ kind: 'objectNumber', objectNumber: next++, page } as AnnotationRef),
        ...draft,
      } as unknown as Annotation,
    })),
    update: vi.fn(async (ref: AnnotationRef, patch: Record<string, unknown>) => ({
      annotation: { ...redactDto(ref), ...patch } as unknown as Annotation,
    })),
    delete: vi.fn(async () => {}),
    canDelete: () => options.canDelete ?? true,
    canUpdate: () => options.canUpdate ?? true,
    tools: {
      getDefaults: () => toolDefaults,
      updateDefaults: vi.fn((_toolId: string, changes: Record<string, unknown>) => {
        toolDefaults = { ...toolDefaults, ...changes };
      }),
    },
    list: ({ pages: [page] }: { pages: [{ objectNumber: number }] }) => {
      let list = lists.get(page.objectNumber);
      if (!list) {
        list = raws.filter((raw) => raw.ref.page.objectNumber === page.objectNumber);
        lists.set(page.objectNumber, list);
      }
      return list;
    },
    get: (ref: AnnotationRef) =>
      raws.find((raw) => annotationKey(raw.ref) === annotationKey(ref)) ?? null,
    setRaws: (next: Annotation[]) => {
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
    raws?: Annotation[];
    apply?: (scope: RedactionApplyScope) => Promise<RedactionApplyResult>;
    config?: RedactionConfig;
    canDelete?: boolean;
    canUpdate?: boolean;
  } = {},
) {
  const annotation = fakeAnnotation(options);
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
  const ctx = createTestContext({
    id: 'redaction',
    state: initialRedactionState(),
    settings: { defaults: REDACTION_DEFAULTS, registered: options.config },
    pages: [{ ref: PAGE }, { ref: OTHER_PAGE }],
    capabilities: [
      [AnnotationToken, annotation],
      ...(options.selection ? [[SelectionToken, options.selection] as const] : []),
    ],
    doc: {
      redaction: (options.engineSupport ?? true) ? { apply } : undefined,
      security: {
        allows: (capability: string) => granted.has(capability),
        allowsAnnotation: (action: string) => action !== 'create' || (options.canCreate ?? true),
      },
    } as never,
  });
  const redaction = ctx.connect(createRedactionController(ctx));
  return { ctx, redaction, annotation, apply };
}

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe('marking the selection', () => {
  it('marks through the redact tool and clears the selection, resolving the marks', async () => {
    const { redaction, annotation } = harness({ selection: { hasSelection: () => true } });
    const { marks } = await redaction.markSelection();
    expect(marks).toEqual([expect.objectContaining({ ref: MARK, kind: 'area', repeat: false })]);
    expect(annotation.createFromSelection).toHaveBeenCalledWith('redact', {
      clear: true,
      signal: undefined,
    });
  });

  it('marks nothing without a selection and refuses without a selection plugin', async () => {
    const idle = harness({ selection: { hasSelection: () => false } });
    await expect(idle.redaction.markSelection()).resolves.toEqual({ marks: [] });
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
    await expect(redaction.markSelection()).rejects.toMatchObject({
      code: 'permission-denied',
      permission: 'annotations:create',
    });
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
      pages.push(...event.pages.map((page) => page.objectNumber)),
    );
    const changed = (subtype: string) =>
      ({ annotation: { ref: MARK, page: PAGE, subtype } }) as unknown as AnnotationCreatedEvent;
    annotation.created.emit(changed('redact'));
    annotation.updated.emit(changed('square'));
    annotation.deleted.emit({
      refs: [MARK],
      page: OTHER_PAGE,
    } as unknown as AnnotationDeletedEvent);
    expect(pages).toEqual([7, 8]);
  });
});

describe('applying', () => {
  it('takes the result and the event of its own apply from the confirmed document event', async () => {
    const { redaction, apply } = harness({ raws: [redactDto(MARK)] });
    const applied: RedactionAppliedEvent[] = [];
    redaction.onApplied((event) => applied.push(event));

    const result = await redaction.apply([MARK]);

    expect(apply).toHaveBeenCalledWith({ annotations: [MARK] });
    expect(result.scope).toEqual({ annotations: [MARK] });
    expect(redaction.getLastResult()).toEqual(result);
    expect(applied).toHaveLength(1);
    expect(applied[0]!.result).toEqual(result);
    expect(applied[0]!.origin).toEqual(LOCAL_ORIGIN);
    expect(redaction.isApplying()).toBe(false);
  });

  it('records a collaborator apply and fires onApplied with its origin', () => {
    const { ctx, redaction } = harness();
    const applied: RedactionAppliedEvent[] = [];
    redaction.onApplied((event) => applied.push(event));
    const result = resultOf({ pages: [PAGE] });

    ctx.emitDocumentEvent({ type: 'redaction.applied', origin: REMOTE_ORIGIN, ...result });

    expect(redaction.getLastResult()).toEqual(result);
    expect(applied).toEqual([{ result, origin: REMOTE_ORIGIN }]);
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
    expect(apply.mock.calls[1]![0]).toEqual({ pages: [OTHER_PAGE] });

    releases[1]!();
    await second;
    expect(maxActive).toBe(1);
    expect(redaction.getLastResult()?.scope).toEqual({ pages: [OTHER_PAGE] });
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
    await expect(next).resolves.toMatchObject({ scope: { pages: [OTHER_PAGE] } });
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
    expect(apply).toHaveBeenCalledWith({ pages: [PAGE, OTHER_PAGE] });
  });
});

describe('the shared contract', () => {
  it('marks an area or a page given by its index, and resolves the mark', async () => {
    const { redaction, annotation } = harness();
    const area = { x: 0, y: 0, width: 10, height: 10 };
    const { mark } = await redaction.markArea(1, area);
    expect(mark).toMatchObject({
      page: OTHER_PAGE,
      kind: 'area',
      overlayText: null,
      repeat: false,
    });
    expect(annotation.create).toHaveBeenCalledWith(
      OTHER_PAGE,
      expect.objectContaining({ subtype: 'redact', rect: area }),
      undefined,
      { signal: undefined },
    );
    const page = await redaction.markPage(0);
    expect(page.mark.page).toEqual(PAGE);
    await expect(redaction.markArea(5, area)).rejects.toMatchObject({ code: 'not-found' });
  });

  it('gives every mark the overlay settings, the tool and the selection included', async () => {
    const { redaction, annotation } = harness({
      config: { overlay: { fill: '#112233', text: { fontSize: 12 } } },
    });
    // The redact tool's defaults carry the settings from the start.
    expect(annotation.tools.updateDefaults).toHaveBeenCalledWith('redact', {
      interiorColor: '#112233',
      fontColor: '#ffffff',
      fontFamily: 'helvetica',
      fontSize: 12,
    });
    await redaction.markArea(PAGE, { x: 0, y: 0, width: 10, height: 10 });
    expect(annotation.create.mock.calls[0]![1]).toMatchObject({
      interiorColor: '#112233',
      fontSize: 12,
      color: '#e44234',
    });

    // A change reaches the next mark.
    redaction.updateSettings({ overlay: { text: { color: '#ff0000' } } });
    expect(redaction.getSettings().overlay).toEqual({
      fill: '#112233',
      text: { color: '#ff0000', fontFamily: 'helvetica', fontSize: 12 },
    });
    await redaction.markPage(PAGE);
    expect(annotation.create.mock.calls[1]![1]).toMatchObject({ fontColor: '#ff0000' });
    redaction.resetSettings();
    expect(annotation.tools.updateDefaults).toHaveBeenLastCalledWith(
      'redact',
      expect.objectContaining({ fontColor: '#ffffff' }),
    );
  });

  it('checks removing a mark and changing its label per mark, and names the permission', async () => {
    const allowed = harness({ raws: [redactDto(MARK)] });
    expect(allowed.redaction.canUnmark(MARK)).toBe(true);
    expect(allowed.redaction.canUpdateLabel(MARK)).toBe(true);
    // Not a mark: neither.
    const other = { ...MARK, objectNumber: 99 };
    expect(allowed.redaction.canUnmark(other)).toBe(false);

    const refused = harness({ raws: [redactDto(MARK)], canDelete: false, canUpdate: false });
    expect(refused.redaction.canUnmark(MARK)).toBe(false);
    expect(refused.redaction.canUpdateLabel(MARK)).toBe(false);
    const result = await refused.redaction.unmark([MARK, other]);
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual([{ ref: other, reason: 'not a pending redaction mark' }]);
    expect(result.failed).toEqual([
      {
        ref: MARK,
        error: expect.objectContaining({
          code: 'permission-denied',
          permission: 'annotations:delete',
        }),
      },
    ]);
    expect(refused.annotation.delete).not.toHaveBeenCalled();
    await expect(
      refused.redaction.updateLabel(MARK, { overlayText: 'Classified' }),
    ).rejects.toMatchObject({ code: 'permission-denied', permission: 'annotations:update' });
    expect(refused.annotation.update).not.toHaveBeenCalled();
  });

  it('changes a label and resolves the mark, repeat included', async () => {
    const { redaction, annotation } = harness({ raws: [redactDto(MARK)] });
    const { mark } = await redaction.updateLabel(MARK, { overlayText: 'Classified', repeat: true });
    expect(mark).toMatchObject({ ref: MARK, overlayText: 'Classified', repeat: true });
    expect(annotation.update).toHaveBeenCalledWith(
      MARK,
      expect.objectContaining({ overlayText: 'Classified', repeat: true }),
      undefined,
      { signal: undefined },
    );
  });

  it('removes every mark with clearPending', async () => {
    const second = { ...MARK, objectNumber: 42 };
    const { redaction, annotation } = harness({ raws: [redactDto(MARK), redactDto(second)] });
    const result = await redaction.clearPending();
    expect(result.applied).toEqual([MARK, second]);
    expect(annotation.delete).toHaveBeenCalledTimes(2);
  });

  it('has the state the page lists', async () => {
    const { redaction } = harness({ raws: [redactDto(MARK)] });
    expect(redactionState.read(redaction)).toEqual({
      pendingCount: 1,
      applying: false,
      lastResult: null,
    });
    const result = await redaction.apply([MARK]);
    expect(redactionState.read(redaction).lastResult).toEqual(result);
  });

  it('a cancelled apply never starts', async () => {
    const { redaction, apply } = harness({ raws: [redactDto(MARK)] });
    const cancel = new AbortController();
    cancel.abort();
    await expect(redaction.applyAll({ signal: cancel.signal })).rejects.toMatchObject({
      code: 'operation-cancelled',
    });
    expect(apply).not.toHaveBeenCalled();
    expect(redaction.isApplying()).toBe(false);
  });

  it('applies the marks on pages given by their index', async () => {
    const { redaction, apply } = harness();
    await redaction.applyPages([1]);
    expect(apply).toHaveBeenCalledWith({ pages: [OTHER_PAGE] });
    await expect(redaction.applyPages([4])).rejects.toMatchObject({ code: 'not-found' });
  });
});
