/**
 * Marking: every mark is a `redact` annotation created through the annotation
 * plugin, in the style of the redact tool's defaults, which follow the
 * `overlay` settings (`sync/overlay.ts`). Removing a mark and changing its
 * label are annotation deletes and updates, checked per mark.
 */
import {
  PluginError,
  annotationKey,
  toPluginError,
  toPluginErrorInfo,
  type BatchResult,
  type OperationOptions,
} from '@embedpdf/core';
import type { Rect } from '@embedpdf/core-geometry';
import type {
  Annotation,
  AnnotationDraft,
  AnnotationRef,
  PageRef,
  SearchQuery,
} from '@embedpdf/engine-core';

import type { RedactionCapability, RedactionLabelPatch, RedactionMark } from '../contract';
import type { RedactionPendingReads } from '../read/pending';
import type { RedactionContext, RedactionServices } from '../services';

/** The redact tool's defaults: the fields a mark draft takes from them. */
type RedactDefaults = Pick<
  Extract<AnnotationDraft, { subtype: 'redact' }>,
  'color' | 'interiorColor' | 'opacity' | 'fontFamily' | 'fontSize' | 'fontColor' | 'textAlign'
>;

/** Stop before the next step once the caller cancelled. */
const throwIfCancelled = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) {
    throw new PluginError('operation-cancelled', 'redaction', 'operation cancelled', {
      cause: signal.reason,
    });
  }
};

export function createMarking(
  ctx: RedactionContext,
  { siblings }: Pick<RedactionServices, 'siblings'>,
  { listPending, markFor }: Pick<RedactionPendingReads, 'listPending' | 'markFor'>,
) {
  const { annotation, selection, search } = siblings;

  /**
   * A new mark's style, as the engine takes it: the redact tool's current
   * defaults, which carry the `overlay` settings, so a mark from code looks
   * like one drawn with the tool.
   */
  const markStyle = (): RedactDefaults => {
    const tool = annotation.tools.getDefaults('redact') as RedactDefaults;
    return {
      color: tool.color,
      interiorColor: tool.interiorColor,
      opacity: tool.opacity,
      fontFamily: tool.fontFamily,
      fontSize: tool.fontSize,
      fontColor: tool.fontColor,
      textAlign: tool.textAlign,
    };
  };

  /** The mark a created or changed record is. */
  const markOfRecord = (record: Annotation): RedactionMark => {
    const mark = markFor(record);
    if (!mark) throw new PluginError('operation-failed', 'redaction', 'the record is not a mark');
    return mark;
  };

  /** Whether a ref is a mark waiting to be applied. */
  const isPending = (ref: AnnotationRef): boolean => {
    const key = annotationKey(ref);
    return listPending().some((mark) => annotationKey(mark.ref) === key);
  };

  const canUnmark = (ref: AnnotationRef): boolean => isPending(ref) && annotation.canDelete(ref);
  const canUpdateLabel = (ref: AnnotationRef): boolean =>
    isPending(ref) && annotation.canUpdate(ref);

  const markSelection = async (
    options?: OperationOptions,
  ): Promise<{ marks: readonly RedactionMark[] }> => {
    ctx.assertAllowed('annotations:create', 'redaction.markSelection');
    const plane = selection();
    if (!plane) throw new PluginError('unsupported', 'redaction', 'no selection plugin');
    if (!plane.hasSelection()) return { marks: [] };
    // The selected text frame rides all the way into `/QuadPoints`: native
    // apply uses these exact cells, so marked == previewed == applied.
    const { annotations } = await annotation.createFromSelection('redact', {
      clear: true,
      signal: options?.signal,
    });
    return { marks: annotations.map(markOfRecord) };
  };

  const createMark = async (
    page: PageRef,
    region: Pick<Extract<AnnotationDraft, { subtype: 'redact' }>, 'rect' | 'quadPoints'>,
    signal: AbortSignal | undefined,
  ): Promise<RedactionMark> => {
    const created = await annotation.create(
      page,
      { subtype: 'redact', ...region, ...markStyle() },
      undefined,
      { signal },
    );
    return markOfRecord(created.annotation);
  };

  const markArea = async (
    page: PageRef | number,
    bounds: Rect,
    options?: OperationOptions,
  ): Promise<{ mark: RedactionMark }> => {
    ctx.assertAllowed('annotations:create', 'redaction.markArea');
    const target = ctx.pageOf(page).ref;
    return { mark: await createMark(target, { rect: bounds }, options?.signal) };
  };

  const markPage = async (
    page: PageRef | number,
    options?: OperationOptions,
  ): Promise<{ mark: RedactionMark }> => {
    ctx.assertAllowed('annotations:create', 'redaction.markPage');
    const layout = ctx.pageOf(page);
    const whole = { x: 0, y: 0, width: layout.size.width, height: layout.size.height };
    return { mark: await createMark(layout.ref, { rect: whole }, options?.signal) };
  };

  const markMatches = async (
    query: SearchQuery,
    options?: { pages?: readonly (PageRef | number)[] } & OperationOptions,
  ): Promise<{ marks: readonly RedactionMark[] }> => {
    ctx.assertAllowed('annotations:create', 'redaction.markMatches');
    const signal = options?.signal;
    const finder = search();
    if (!finder) throw new PluginError('unsupported', 'redaction', 'no search plugin');
    const wanted = options?.pages
      ? new Set(options.pages.map((page) => ctx.pageOf(page).ref.objectNumber))
      : null;
    await finder.search(query, { signal });
    const marks: RedactionMark[] = [];
    for (const hit of finder.listHits()) {
      if (wanted && !wanted.has(hit.page.objectNumber)) continue;
      if (hit.segments.length === 0) continue;
      throwIfCancelled(signal);
      // The engine's rect covers the quads.
      marks.push(
        await createMark(
          hit.page,
          { quadPoints: hit.segments.map((segment) => segment.quad) },
          signal,
        ),
      );
    }
    return { marks };
  };

  const unmark = async (
    refs: readonly AnnotationRef[],
    options?: OperationOptions,
  ): Promise<BatchResult<AnnotationRef, AnnotationRef>> => {
    const signal = options?.signal;
    throwIfCancelled(signal);
    const applied: AnnotationRef[] = [];
    const skipped: BatchResult<AnnotationRef, AnnotationRef>['skipped'][number][] = [];
    const failed: BatchResult<AnnotationRef, AnnotationRef>['failed'][number][] = [];
    for (const ref of refs) {
      if (!isPending(ref)) {
        skipped.push({ ref, reason: 'not a pending redaction mark' });
        continue;
      }
      if (!annotation.canDelete(ref)) {
        const refused = new PluginError(
          'permission-denied',
          'redaction',
          'redaction.unmark requires annotations:delete',
          { permission: 'annotations:delete' },
        );
        failed.push({ ref, error: toPluginErrorInfo(refused) });
        continue;
      }
      try {
        await annotation.delete(ref, { signal });
        applied.push(ref);
      } catch (error) {
        const refused = toPluginError('redaction', error);
        // A cancel ends the batch: the marks removed so far stay removed.
        if (refused.code === 'operation-cancelled') throw refused;
        failed.push({ ref, error: toPluginErrorInfo(refused) });
      }
    }
    return { applied, skipped, failed };
  };
  const clearPending = (options?: OperationOptions) =>
    unmark(
      listPending().map((mark) => mark.ref),
      options,
    );

  const updateLabel = async (
    ref: AnnotationRef,
    patch: RedactionLabelPatch,
    options?: OperationOptions,
  ): Promise<{ mark: RedactionMark }> => {
    const current = annotation.get(ref);
    if (!current || current.subtype !== 'redact') {
      throw new PluginError('not-found', 'redaction', 'the target is not a redaction mark');
    }
    if (!annotation.canUpdate(ref)) {
      throw new PluginError(
        'permission-denied',
        'redaction',
        'redaction.updateLabel requires annotations:update',
        { permission: 'annotations:update' },
      );
    }
    try {
      // Always carry the current /DA styling: the engine rewrites /DA whenever
      // a label field rides a patch, so a text-only edit must not let the
      // styling fall back to defaults.
      const updated = await annotation.update(
        ref,
        {
          subtype: 'redact',
          ...(patch.overlayText !== undefined ? { overlayText: patch.overlayText } : {}),
          ...(patch.repeat !== undefined ? { repeat: patch.repeat } : {}),
          fontFamily: current.fontFamily,
          fontSize: current.fontSize,
          fontColor: current.fontColor,
          textAlign: current.textAlign,
        },
        undefined,
        { signal: options?.signal },
      );
      return { mark: markOfRecord(updated.annotation) };
    } catch (error) {
      throw toPluginError('redaction', error);
    }
  };

  return {
    api: {
      canUnmark,
      canUpdateLabel,
      markSelection,
      markArea,
      markPage,
      markMatches,
      unmark,
      clearPending,
      updateLabel,
    } satisfies Partial<RedactionCapability>,
  };
}
