/** Marking: every mark is a `redact` annotation created through the annotation plugin. */
import { PluginError, annotationKey, toPluginError, toPluginErrorInfo } from '@embedpdf/core';
import type { BatchResult } from '@embedpdf/core';
import type { Rect } from '@embedpdf/core-geometry';
import type { AnnotationRef, PageRef, SearchQuery } from '@embedpdf/engine-core';
import type { AnnotationPropsPatch } from '@embedpdf/plugin-annotation/contract';

import type { RedactionCapability, RedactionConfig, RedactionLabelPatch } from '../contract';
import type { RedactionPendingReads } from '../read/pending';
import type { RedactionContext, RedactionServices } from '../services';

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
  const overlayProps = (): AnnotationPropsPatch => {
    const overlay = config.overlay;
    if (!overlay) return {};
    return {
      ...(overlay.fill ? { interiorColor: overlay.fill } : {}),
      ...(overlay.text?.color ? { fontColor: overlay.text.color } : {}),
      ...(overlay.text?.fontFamily ? { fontFamily: overlay.text.fontFamily } : {}),
      ...(overlay.text?.fontSize !== undefined ? { fontSize: overlay.text.fontSize } : {}),
    } as AnnotationPropsPatch;
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

  const markArea = (page: PageRef, bounds: Rect): Promise<AnnotationRef> => {
    assertCanMark();
    return annotation.create({
      page,
      subtype: 'redact',
      bounds,
      tool: 'redact',
      props: overlayProps(),
    });
  };

  const markPage = (page: PageRef): Promise<AnnotationRef> => {
    const layout = ctx
      .document()
      ?.pages.find((p) => p.ref.pageObjectNumber === page.pageObjectNumber);
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
    const wanted = options?.pages ? new Set(options.pages.map((p) => p.pageObjectNumber)) : null;
    const refs: AnnotationRef[] = [];
    for (const hit of finder.listHits()) {
      if (wanted && !wanted.has(hit.page.pageObjectNumber)) continue;
      if (hit.segments.length === 0) continue;
      refs.push(
        await annotation.create({
          page: hit.page,
          subtype: 'redact',
          quads: hit.segments.map((segment) => segment.quad),
          tool: 'redact',
          props: overlayProps(),
        }),
      );
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
    const result = await annotation.deleteMany(marks);
    return { ...result, skipped: [...result.skipped, ...skipped] };
  };
  const clearPending = (): Promise<BatchResult<AnnotationRef, AnnotationRef>> =>
    unmark(listPending().map((mark) => mark.ref));

  const updateLabel = async (ref: AnnotationRef, patch: RedactionLabelPatch): Promise<void> => {
    const current = annotation.getRaw(ref);
    if (!current || current.subtype !== 'redact') {
      throw new PluginError('not-found', 'redaction', 'the target is not a redaction mark');
    }
    try {
      // Always carry the current /DA styling: the engine rewrites /DA whenever
      // a label field rides a patch, so a text-only edit must not let the
      // styling fall back to defaults.
      await annotation.updateRaw(ref, {
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
// `toPluginErrorInfo` is what a batch failure carries; re-exported for the apply area.
export { toPluginErrorInfo };
