/** Marking: every mark is a `redact` annotation created through the annotation plugin. */
import { PluginError, annotationKey, toPluginError, toPluginErrorInfo } from '@embedpdf/core';
import type { BatchResult } from '@embedpdf/core';
import type { Rect } from '@embedpdf/core-geometry';
import type {
  AnnotationDraft,
  AnnotationRef,
  PageRef,
  SearchQuery,
  StandardFont,
} from '@embedpdf/engine-core';

import type { RedactionCapability, RedactionConfig, RedactionLabelPatch } from '../contract';
import type { RedactionPendingReads } from '../read/pending';
import type { RedactionContext, RedactionServices } from '../services';

/** The redact tool's defaults: the fields a mark draft takes from them. */
type RedactDefaults = Pick<
  Extract<AnnotationDraft, { subtype: 'redact' }>,
  'color' | 'interiorColor' | 'opacity' | 'fontFamily' | 'fontSize' | 'fontColor' | 'textAlign'
>;

export function createMarking(
  ctx: RedactionContext,
  { siblings }: Pick<RedactionServices, 'siblings'>,
  config: RedactionConfig,
  { listPending }: Pick<RedactionPendingReads, 'listPending'>,
) {
  const { annotation, selection, search } = siblings;

  const assertCanMark = (): void => {
    if (!annotation.canCreate()) {
      throw new PluginError(
        'permission-denied',
        'redaction',
        'marking needs annotation create authority',
      );
    }
  };
  /** The configured overlay look, as annotation props. */
  /**
   * A new mark's style, as the engine takes it: the redact tool's current
   * defaults (the user's drawing preferences), with the configured overlay
   * over them.
   */
  const markStyle = () => {
    const tool = annotation.getToolDefaults('redact') as RedactDefaults;
    const overlay = config.overlay;
    return {
      color: tool.color,
      interiorColor: overlay?.fill ?? tool.interiorColor,
      opacity: tool.opacity,
      fontFamily: (overlay?.text?.fontFamily ?? tool.fontFamily) as StandardFont,
      fontSize: overlay?.text?.fontSize ?? tool.fontSize,
      fontColor: overlay?.text?.color ?? tool.fontColor,
      textAlign: tool.textAlign,
    };
  };

  const markSelection = async (): Promise<readonly AnnotationRef[]> => {
    assertCanMark();
    const plane = selection();
    if (!plane) throw new PluginError('unsupported', 'redaction', 'no selection plugin');
    if (!plane.hasSelection()) return [];
    // The selected text frame rides all the way into `/QuadPoints`: native
    // apply uses these exact cells, so marked == previewed == applied.
    return annotation.createFromSelection('redact', { preset: 'redact', clear: true });
  };

  const markArea = async (page: PageRef, bounds: Rect): Promise<AnnotationRef> => {
    assertCanMark();
    const created = await annotation.create(page, {
      subtype: 'redact',
      rect: bounds,
      ...markStyle(),
    });
    return created.annotation.ref;
  };

  const markPage = async (page: PageRef): Promise<AnnotationRef> => {
    const layout = ctx.getPage(page);
    if (!layout) throw new PluginError('not-found', 'redaction', 'no such page');
    return markArea(page, { x: 0, y: 0, width: layout.size.width, height: layout.size.height });
  };

  const markMatches = async (
    query: SearchQuery,
    options?: { pages?: readonly PageRef[] },
  ): Promise<readonly AnnotationRef[]> => {
    assertCanMark();
    const finder = search();
    if (!finder) throw new PluginError('unsupported', 'redaction', 'no search plugin');
    await finder.search(query);
    const wanted = options?.pages ? new Set(options.pages.map((page) => page.objectNumber)) : null;
    const refs: AnnotationRef[] = [];
    for (const hit of finder.listHits()) {
      if (wanted && !wanted.has(hit.page.objectNumber)) continue;
      if (hit.segments.length === 0) continue;
      // The engine's rect covers the quads.
      const created = await annotation.create(hit.page, {
        subtype: 'redact',
        quadPoints: hit.segments.map((segment) => segment.quad),
        ...markStyle(),
      });
      refs.push(created.annotation.ref);
    }
    return refs;
  };

  const unmark = async (
    refs: readonly AnnotationRef[],
  ): Promise<BatchResult<AnnotationRef, AnnotationRef>> => {
    const pending = new Set(listPending().map((mark) => annotationKey(mark.ref)));
    const marks = refs.filter((ref) => pending.has(annotationKey(ref)));
    const skipped = refs
      .filter((ref) => !pending.has(annotationKey(ref)))
      .map((ref) => ({ ref, reason: 'not a pending redaction mark' }));
    if (marks.length === 0) return { applied: [], skipped, failed: [] };
    const applied: AnnotationRef[] = [];
    const failed: BatchResult<AnnotationRef, AnnotationRef>['failed'][number][] = [];
    for (const ref of marks) {
      try {
        await annotation.delete(ref);
        applied.push(ref);
      } catch (error) {
        failed.push({ ref, error: toPluginErrorInfo(toPluginError('redaction', error)) });
      }
    }
    return { applied, skipped, failed };
  };
  const clearPending = (): Promise<BatchResult<AnnotationRef, AnnotationRef>> =>
    unmark(listPending().map((mark) => mark.ref));

  const updateLabel = async (ref: AnnotationRef, patch: RedactionLabelPatch): Promise<void> => {
    const current = annotation.get(ref);
    if (!current || current.subtype !== 'redact') {
      throw new PluginError('not-found', 'redaction', 'the target is not a redaction mark');
    }
    try {
      // Always carry the current /DA styling: the engine rewrites /DA whenever
      // a label field rides a patch, so a text-only edit must not let the
      // styling fall back to defaults.
      await annotation.update(ref, {
        subtype: 'redact',
        ...(patch.overlayText !== undefined ? { overlayText: patch.overlayText } : {}),
        ...(patch.repeat !== undefined ? { repeat: patch.repeat } : {}),
        fontFamily: current.fontFamily,
        fontSize: current.fontSize,
        fontColor: current.fontColor,
        textAlign: current.textAlign,
      });
    } catch (error) {
      throw toPluginError('redaction', error);
    }
  };

  return {
    api: {
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
