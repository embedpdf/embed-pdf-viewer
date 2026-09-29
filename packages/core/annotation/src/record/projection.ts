import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';

import type { ModelGeometry, RecordFields } from '../types';

/** An untyped partial wire statement — merged fragments are cast to the
 *  concrete `AnnotationDraft`/`AnnotationPatch` at the derivation boundary. */
export type Wire = Record<string, unknown>;

/**
 * A part of a record's fields a kind's lowering writes: a key of its style
 * (`border` is `borderStyle`, `dashArray` and `cloudyIntensity`), its text,
 * its line endings, its icon or its link.
 */
export type LoweredKey =
  | 'color'
  | 'interiorColor'
  | 'strokeWidth'
  | 'opacity'
  | 'blendMode'
  | 'border'
  | 'lineEndings'
  | 'fontFamily'
  | 'fontSize'
  | 'fontColor'
  | 'textAlign'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'icon'
  | 'link';

/** The kind-specific slice a DTO ingest contributes on top of the generic
 *  base (id/ref/flags/relationships) that `fromDTO` builds for every kind. */
export type IngestSlice = { geometry: ModelGeometry } & Partial<
  Pick<RecordFields, 'text' | 'icon' | 'link' | 'intent' | 'measure'>
>;

/**
 * One declaration per kind family; every wire statement shape derives from it
 * (see `record/index.ts`):
 *
 *   full patch    =  geometry(a)  ∪  props(a, every key the kind declares)
 *   create draft  =  full patch   ∪  draftExtras(a)
 *   scoped patch  =  geometry(a)  |  props(a, the touched keys)
 *
 * This is the wire-side sibling of the core's FieldSpec table: a new kind
 * declares one projection and gets ingest, drafts, full patches, and scoped
 * patches for free. The algebra is sound because of the engine's tri-state
 * law — omission preserves, so a statement never has to restate what it
 * didn't change.
 */
export interface KindProjection {
  /** DTO → the kind's model slice (geom + text/icon/label/link/intent). */
  ingest(dto: AnnotationDTO): IngestSlice;
  /**
   * The committed-geometry wire group: the primary geometry plus every field
   * the engine writers couple to it (the box transform trio, a callout's
   * leader group, advisory rotation). `null` = the kind has no editable
   * geometry (text markup) — geometry statements fall back to the full patch.
   */
  geometry(annotation: RecordFields): Wire | null;
  /** Kind-specific prop lowerings — only the exceptions; `props.ts` generic
   *  covers every 1:1 key. A kind's couplings live here, in its owner's file. */
  prop?: Partial<Record<LoweredKey, (annotation: RecordFields) => Wire>>;
  /** Create-only statement extras (intent, quadPoints, contents seeds…). */
  draftExtras?(annotation: RecordFields): Wire | null;
  /** Kinds whose creates do not go through `toCreateDraft` (stamps carry a
   *  binary source and use their own create path; widgets are form-plane). */
  createable?: false;
}
