import type { AnnotationDTO, PdfRect } from '@embedpdf/engine-core/runtime';
import { geomRotation, type Annot, type PropKey } from '@embedpdf/core-annotation';

import { boxGeomFields } from './seam';

/** An untyped partial wire statement — merged fragments are cast to the
 *  concrete `AnnotationDraft`/`AnnotationPatch` at the derivation boundary. */
export type Wire = Record<string, unknown>;

/** The kind-specific slice a DTO ingest contributes on top of the generic
 *  base (id/ref/flags/relationships) that `fromDTO` builds for every kind. */
export type IngestSlice = { geom: Annot['geom'] } & Partial<
  Pick<Annot, 'text' | 'icon' | 'label' | 'link' | 'intent'>
>;

/**
 * ONE declaration per kind family; every wire statement shape derives from it
 * (see `repository/index.ts`):
 *
 *   full patch    =  geometry(a)  ∪  props(a, every key the kind declares)
 *   create draft  =  full patch   ∪  draftExtras(a)
 *   scoped patch  =  geometry(a)  |  props(a, the touched keys)
 *
 * This is the wire-side sibling of the core's PropSpec table: a new kind
 * declares one projection and gets ingest, drafts, full patches, and scoped
 * patches for free. The algebra is sound because of the engine's tri-state
 * law — omission preserves, so a statement never has to restate what it
 * didn't change.
 */
export interface KindProjection {
  /** DTO → the kind's model slice (geom + text/icon/label/link/intent). */
  ingest(dto: AnnotationDTO, crop: PdfRect): IngestSlice;
  /**
   * The committed-geometry wire group: the primary geometry plus every field
   * the engine writers couple to it (the box transform trio, a callout's
   * leader group, advisory rotation). `null` = the kind has no editable
   * geometry (text markup) — geometry statements fall back to the full patch.
   */
  geometry(a: Annot, crop: PdfRect): Wire | null;
  /** Kind-specific prop lowerings — ONLY the exceptions; `props.ts` GENERIC
   *  covers every 1:1 key. A kind's couplings live here, in its owner's file. */
  prop?: Partial<Record<PropKey, (a: Annot, crop: PdfRect) => Wire>>;
  /** Create-only statement extras (intent, quadPoints, contents seeds…). */
  draftExtras?(a: Annot, crop: PdfRect): Wire | null;
  /** Kinds whose creates do NOT go through the repository (stamps carry a
   *  binary source and use their own create path; widgets are form-plane). */
  createable?: false;
}

/** Box-kind geometry emission: the model's unrotated `rect` + applied tilt →
 *  `/Rect`(+`unrotatedRect`+`rotation`), total (nulls state the clears). */
export const boxEmit = (a: Annot, crop: PdfRect): Wire => {
  const g = a.geom as Extract<Annot['geom'], { t: 'rect' } | { t: 'text' }>;
  return boxGeomFields(g.rect, geomRotation(a.geom), crop);
};
