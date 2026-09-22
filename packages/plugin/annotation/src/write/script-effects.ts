import { scriptColorToRgb } from '@embedpdf/core-acrojs';
import type { ScriptAnnotEffect, ScriptColorArray } from '@embedpdf/core-acrojs';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import type { AnnotCommitEntry, AnnotCommitResult } from '@embedpdf/plugin-actions/contract/host';

import type { AnnotationContext, AnnotationServices } from '../services';
import type { Hydration } from '../sync/hydration';

/** Script patch → the engine's per-kind patch vocabulary. Colors cross the
 *  Acrobat-array → engine {r,g,b}/255 boundary here; everything else maps
 *  one-to-one (the VM's validity matrix already scoped keys per kind). */
const engineScriptPatch = (
  subtype: string,
  patch: ScriptAnnotEffect['patch'],
): Record<string, unknown> | Error => {
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
  return out;
};

/**
 * The actions plane's commit sink: document JavaScript patches annotations
 * through this plugin, which owns the model, so the engine write and the
 * visible model can never diverge.
 */
export function createScriptEffects(
  ctx: Pick<AnnotationContext, 'doc'>,
  { store }: Pick<AnnotationServices, 'store'>,
  hydration: Pick<Hydration, 'reloadPage'>,
) {
  const api = {
    commitScriptEffects: async (entries: AnnotCommitEntry[]): Promise<AnnotCommitResult> => {
      const doc = ctx.doc;
      if (!doc) {
        return {
          results: entries.map((entry) => ({
            annotObjectNumber: entry.annotObjectNumber,
            status: 'failed' as const,
            error: 'no document',
          })),
        };
      }
      const results: AnnotCommitResult['results'] = [];
      const touchedPons = new Set<number>();
      let failed = false;
      for (const entry of entries) {
        if (failed) {
          results.push({ annotObjectNumber: entry.annotObjectNumber, status: 'skipped' });
          continue;
        }
        const loaded = store.model().byId[`obj:${entry.annotObjectNumber}`];
        const pon = loaded?.page.pageObjectNumber ?? entry.page?.pageObjectNumber;
        let ref = loaded?.ref ?? null;
        let subtype: string | undefined = loaded?.subtype;
        if ((!ref || !subtype) && pon !== undefined) {
          // Engine fallback for pages the model hasn't loaded.
          try {
            const { annotations } = await doc.page(toPageRef(pon)).annotations.list();
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
        if (pon === undefined || !ref || !subtype) {
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
          await doc.page(toPageRef(pon)).annotations.update(ref, patch as never);
          touchedPons.add(pon);
          results.push({ annotObjectNumber: entry.annotObjectNumber, status: 'applied' });
        } catch (error) {
          // Stop-on-failure: PermissionDenied and friends fail THIS entry and
          // skip the rest — the declared cross-plane law, per-plane too.
          failed = true;
          results.push({
            annotObjectNumber: entry.annotObjectNumber,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      // Reconcile OUR model (the engine emitted local events both listeners
      // deliberately ignore — the owner folds its own writes).
      for (const touched of touchedPons) await hydration.reloadPage(touched);
      return { results };
    },
  };

  return { api };
}
