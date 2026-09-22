import { scriptColorToRgb } from '@embedpdf/core-acrojs';
import type { ScriptAnnotEffect, ScriptColorArray } from '@embedpdf/core-acrojs';
import { toPageRef, type AnnotationPatch } from '@embedpdf/engine-core/runtime';
import type { AnnotCommitEntry, AnnotCommitResult } from '@embedpdf/plugin-actions/contract/host';

import type { AnnotationContext, AnnotationServices } from '../services';

/** Script patch → the engine's per-kind patch vocabulary. Colors cross the
 *  Acrobat-array → engine {r,g,b}/255 boundary here; everything else maps
 *  one-to-one (the VM's validity matrix already scoped keys per kind). */
const engineScriptPatch = (
  subtype: string,
  patch: ScriptAnnotEffect['patch'],
): AnnotationPatch | Error => {
  const out: Record<string, unknown> = { subtype };
  const toEngineColor = (color: ScriptColorArray) => {
    const rgb = scriptColorToRgb(color);
    return rgb
      ? {
          r: Math.round(rgb.r * 255),
          g: Math.round(rgb.g * 255),
          b: Math.round(rgb.b * 255),
        }
      : null;
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
    out.rect = {
      left: patch.rect[0],
      bottom: patch.rect[1],
      right: patch.rect[2],
      top: patch.rect[3],
    };
  }
  if (patch.contents !== undefined) out.contents = patch.contents;
  if (patch.flags) out.flags = patch.flags;
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
  { store }: Pick<AnnotationServices, 'store'>,
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
        const pageObjectNumber = loaded?.page.pageObjectNumber ?? entry.page?.pageObjectNumber;
        let ref = loaded?.ref ?? null;
        let subtype: string | undefined = loaded?.subtype;
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
        const patch = engineScriptPatch(subtype, entry.patch);
        if (patch instanceof Error) {
          results.push({
            annotObjectNumber: entry.annotObjectNumber,
            status: 'failed',
            error: patch.message,
          });
          continue;
        }
        try {
          await doc.page(toPageRef(pageObjectNumber)).annotations.update(ref, patch);
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
