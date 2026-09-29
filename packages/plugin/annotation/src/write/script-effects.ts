import { scriptColorToRgb } from '@embedpdf/core-acrojs';
import type { ScriptAnnotEffect, ScriptColorArray } from '@embedpdf/core-acrojs';
import { refOf } from '@embedpdf/core-annotation';
import {
  colorOf,
  pageBoxOf,
  toPageRef,
  type AnnotationPatch,
  type PdfRect,
} from '@embedpdf/engine-core/runtime';
import type { AnnotCommitEntry, AnnotCommitResult } from '@embedpdf/plugin-actions/contract/host';

import type { AnnotationContext, AnnotationServices } from '../services';
import { appliedOrThrow } from './outcomes';

/** Script patch → the engine's per-kind patch vocabulary. Colors cross the
 *  Acrobat-array → engine {r,g,b}/255 boundary here; a script's rect, in the
 *  file's numbers as Acrobat's JavaScript keeps it, is the annotation's
 *  `rect` in page space for every kind, which puts its shape there as in
 *  Acrobat (`shapeForRect`); everything else maps one-to-one (the VM's
 *  validity matrix already scoped keys per kind). `crop` is the page's
 *  `pdfCropBox`. */
const engineScriptPatch = (
  subtype: string,
  patch: ScriptAnnotEffect['patch'],
  crop: PdfRect | null,
): AnnotationPatch | Error => {
  const out: Record<string, unknown> = { subtype };
  const toEngineColor = (color: ScriptColorArray) => {
    const rgb = scriptColorToRgb(color);
    return rgb ? colorOf(rgb.r * 255, rgb.g * 255, rgb.b * 255) : null;
  };
  if (patch.strokeColor) {
    const color = toEngineColor(patch.strokeColor);
    if (!color) return new Error('transparent stroke colours are not supported');
    out.color = color;
  }
  if (patch.fillColor) out.interiorColor = toEngineColor(patch.fillColor);
  if (patch.opacity !== undefined) out.opacity = patch.opacity;
  if (patch.width !== undefined) out.strokeWidth = patch.width;
  if (patch.borderStyle) out.borderStyle = patch.borderStyle === 'D' ? 'dashed' : 'solid';
  if (patch.dash) out.dashArray = patch.dash;
  if (patch.rect) {
    if (!crop) return new Error('annotation page not loaded');
    // Acrobat's [x1, y1, x2, y2] names two corners, in either order.
    const [x1, y1, x2, y2] = patch.rect;
    out.rect = pageBoxOf(
      {
        left: Math.min(x1, x2),
        bottom: Math.min(y1, y2),
        right: Math.max(x1, x2),
        top: Math.max(y1, y2),
      },
      crop,
    );
  }
  if (patch.contents !== undefined) out.contents = patch.contents;
  // Each `/F` flag is its own engine field.
  if (patch.flags) Object.assign(out, patch.flags);
  // Assembled key by key: the script VM already limited the keys to the ones
  // this kind accepts, and the engine validates the patch against the subtype.
  return out as unknown as AnnotationPatch;
};

/**
 * The actions plugin's commit sink: document JavaScript patches annotations
 * through this plugin, which owns them. Each confirmed write reaches the model
 * through the records mirror.
 */
export function createScriptEffects(
  ctx: Pick<AnnotationContext, 'doc'>,
  { store, geometry }: Pick<AnnotationServices, 'store' | 'geometry'>,
) {
  const api = {
    commitScriptEffects: async (entries: AnnotCommitEntry[]): Promise<AnnotCommitResult> => {
      const doc = ctx.doc;
      const results: AnnotCommitResult['results'] = [];
      let failed = false;
      for (const entry of entries) {
        if (failed) {
          results.push({ annotObjectNumber: entry.annotObjectNumber, status: 'skipped' });
          continue;
        }
        const loaded = store.model().byId[`obj:${entry.annotObjectNumber}`];
        const pageObjectNumber =
          loaded?.annotation.page.pageObjectNumber ?? entry.page?.pageObjectNumber;
        let ref = refOf(loaded);
        let subtype: string | undefined = loaded?.annotation.subtype;
        if ((!ref || !subtype) && pageObjectNumber !== undefined) {
          // Read the page from the engine when the model does not have the annotation.
          try {
            const { annotations } = await doc.page(toPageRef(pageObjectNumber)).annotations.list();
            const dto = annotations.find(
              (candidate) =>
                candidate.ref.kind === 'objectNumber' &&
                candidate.ref.annotObjectNumber === entry.annotObjectNumber,
            );
            if (dto) {
              ref = dto.ref;
              subtype = dto.subtype;
            }
          } catch {
            /* resolved as a failure below */
          }
        }
        if (pageObjectNumber === undefined || !ref || !subtype) {
          results.push({
            annotObjectNumber: entry.annotObjectNumber,
            status: 'failed',
            error: 'annotation not resolved (page not loaded)',
          });
          continue;
        }
        const patch = engineScriptPatch(subtype, entry.patch, geometry.cropOf(pageObjectNumber));
        if (patch instanceof Error) {
          results.push({
            annotObjectNumber: entry.annotObjectNumber,
            status: 'failed',
            error: patch.message,
          });
          continue;
        }
        try {
          await appliedOrThrow(store.apply([{ type: 'update', ref, patch }]));
          results.push({ annotObjectNumber: entry.annotObjectNumber, status: 'applied' });
        } catch (error) {
          // Stop on the first failure: a refused entry (for example a
          // permission refusal) fails, and every later entry is skipped.
          failed = true;
          results.push({
            annotObjectNumber: entry.annotObjectNumber,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return { results };
    },
  };

  return { api };
}
