import type { Annot } from '@embedpdf/core-annotation';
import { annotationKey, type AnnotationRef, type PdfRect } from '@embedpdf/engine-core/runtime';

import { fromDTO } from '../repository';
import type { AnnotationContext } from './context';
import type { PageGeometry } from './geometry';
import type { AnnotationStore } from './store';

export type EngineRecord = Parameters<typeof fromDTO>[0];
export type RenderSource = NonNullable<Parameters<typeof fromDTO>[2]>;

/**
 * The bridge from the engine's records to the model: ingest a DTO with this
 * session's authority projected onto it, and fold a confirmed record back into
 * the model.
 */
export function createRecords(
  ctx: Pick<AnnotationContext, 'doc'>,
  store: AnnotationStore,
  geometry: PageGeometry,
) {
  /**
   * Ingest an engine DTO with this session's per-record AUTHORITY projected
   * onto it (permissions.md) — asked of the SAME mirrors the server enforces
   * with, against the record's stamped owner. Fused into
   * `annotTransformable`/`annotDeletable`, so hit-test, chrome, props and
   * delete all agree with the engine by construction. No security context
   * (bare local engines, tests) → unstamped → allowed; the engine enforces.
   */
  const ingest = (dto: EngineRecord, crop: PdfRect, source?: RenderSource): Annot => {
    const a = fromDTO(dto, crop, source);
    const sec = ctx.doc?.security;
    if (!sec) return a;
    const target = {
      ...(dto.userId !== undefined ? { userId: dto.userId } : {}),
      ...(dto.groupId !== undefined ? { groupId: dto.groupId } : {}),
    };
    return {
      ...a,
      authority: {
        update: sec.allowsAnnotationMutation('update', target),
        delete: sec.allowsAnnotationMutation('delete', target),
      },
    };
  };

  /**
   * Re-sync one annotation into the model from the authoritative engine DTO,
   * with the render `source` the caller decides: `'vector'` when WE authored or
   * changed the appearance (create / restyle / resize), `'baked'` when the AP is
   * still authoritative (a move, which preserves it, or a remote edit).
   * `bumpAp` marks the upsert as confirming an engine /AP re-bake with new
   * content, advancing the annotation's `apVersion`. Only baked annotations
   * contribute to the page's appearance epoch and trigger a raster fetch.
   */
  const sync = (dto: EngineRecord, source: RenderSource, bumpAp = false): void => {
    const crop = geometry.cropOf(dto.page.pageObjectNumber);
    if (crop) store.commit({ t: 'upsert', annots: [ingest(dto, crop, source)], bumpAp });
  };

  /** The page a ref lives on: from the loaded model first (the page it was
   *  ingested on), else the ref's own page address. */
  const pageOf = (ref: AnnotationRef): number | null =>
    store.model().byId[annotationKey(ref)]?.page.pageObjectNumber ?? ref.page.pageObjectNumber;

  return { ingest, sync, pageOf };
}

export type Records = ReturnType<typeof createRecords>;
