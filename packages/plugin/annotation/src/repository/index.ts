/**
 * The boundary between the engine's PDF-space annotation DTOs and the core's
 * content-space `ModelAnnotation` — organized kind-major like the rest of the stack
 * (engine-core `kinds/`, the services writer registry, the core PropSpec
 * table): each family declares one {@link KindProjection} and every wire
 * statement shape derives from it here:
 *
 *   full patch    =  geometry(a)  ∪  props(a, every key the kind declares)
 *   create draft  =  full patch   ∪  draftExtras(a)   (+ `/F` verbatim)
 *   scoped patch  =  geometry(a)  |  props(a, the touched keys)
 *
 * The derivation is sound because of the engine's tri-state law ("a patch
 * touches what it states, preserves what it omits"): a statement never has to
 * restate what it didn't change, and the emitted key set is the editable set
 * (`propsFor` — the same table that routes `setProps`), so anything outside
 * it can never change in the model. Any key a kind cannot lower degrades to
 * the full patch — verbose, never a dropped write.
 */
import {
  propsFor,
  type ModelAnnotation,
  type PatchScope,
  type PropKey,
} from '@embedpdf/core-annotation';
import { geomRotation } from '@embedpdf/core-annotation';
import type {
  AnnotationDraft,
  AnnotationDTO,
  AnnotationPatch,
  PdfRect,
} from '@embedpdf/engine-core/runtime';

import { freeText } from './kinds/freeText';
import {
  fileAttachment,
  link,
  stamp,
  textNote,
  unsupported,
  widget,
  widgetKindOf,
} from './kinds/misc';
import { caret, highlight, redact, squiggly, strikeout, underline } from './kinds/quads';
import { circle, square } from './kinds/shape';
import { captionFieldsOf, ink, line, polygon, polyline } from './kinds/stroke';
import { boxEmit, type KindProjection, type Wire } from './projection';
import { GENERIC_PROPS } from './props';
import { pdfToContentRect, annotationKey, flagsOf, styleFromDTO } from './seam';

export {
  boxGeomFields,
  colorToCss,
  cssToColor,
  annotationKey,
  styleFromDTO,
  widgetAppearanceFromProps,
  writableTarget,
} from './seam';
export { linkChildRects } from './links';
export { boxEmit } from './projection';
export type { KindProjection } from './projection';

/** Every wire subtype declares exactly one projection — a missing kind is a
 *  Compile error, not a silent fall-through. */
const KINDS = {
  square,
  circle,
  line,
  polygon,
  polyline,
  ink,
  'free-text': freeText,
  highlight,
  underline,
  squiggly,
  strikeout,
  caret,
  redact,
  text: textNote,
  'file-attachment': fileAttachment,
  stamp,
  link,
  widget,
  // A popup is its parent's window; the plugin draws nothing for it itself.
  popup: unsupported,
  unsupported,
} satisfies Record<AnnotationDTO['subtype'], KindProjection>;

/** Model subtypes are wire subtypes except the widget client kinds
 *  (`widget-text`…), which all project through the widget family. */
const projectionOf = (subtype: string): KindProjection =>
  subtype.startsWith('widget')
    ? KINDS.widget
    : ((KINDS as Record<string, KindProjection>)[subtype] ?? KINDS.unsupported);

const wireSubtypeOf = (annotation: ModelAnnotation): string =>
  annotation.subtype.startsWith('widget') ? 'widget' : annotation.subtype;

/* ── DTO → content model ──────────────────────────────────────────────────── */

/**
 * Engine DTO → content-space ModelAnnotation, rendering from the engine's
 * appearance raster (`source: 'baked'`, placed by `apBox`). Whether this
 * session renders it live instead is the view's choice (read/view.ts).
 */
export function fromDTO(dto: AnnotationDTO, crop: PdfRect): ModelAnnotation {
  const slice = projectionOf(dto.subtype).ingest(dto, crop);
  // Rotation-stripped appearances (mirrors the engine's exact condition — see
  // AnnotationAppearanceReader): only when the DTO carries both `rotation` and
  // `unrotatedRect` (box-family kinds) is the raster flat and placed by the
  // unrotated box, with the stripped rotation re-applied as a view transform
  // (`apRot`). Vertex kinds pre-rotate their geometry and never carry
  // `unrotatedRect` — their rasters stay placed by `/Rect`, untransformed.
  // A callout is excluded even when it carries both fields: only its text box
  // tilts, via an inline matrix mid-stream (the leader is page-space), so its
  // /AP form `/Matrix` is identity and the raster stays placed by `/Rect`.
  const isCallout = dto.subtype === 'free-text' && dto.intent === 'free-text-callout';
  const strippedRect =
    !isCallout && 'unrotatedRect' in dto && 'rotation' in dto && dto.rotation
      ? dto.unrotatedRect
      : undefined;
  return {
    id: annotationKey(dto.ref),
    ref: dto.ref,
    page: dto.page,
    subtype: dto.subtype === 'widget' ? widgetKindOf(dto.fieldFamily) : dto.subtype,
    // `/F` verbatim — every behavioral question (visible? selectable? frozen?)
    // is answered by the core's flag predicates, never derived here.
    flags: flagsOf(dto),
    source: 'baked',
    // Carry the canonical DTO; geom/style below are derived projections of it.
    data: dto,
    // Relationship to a parent annotation. `irt` mirrors `/IRT`; `group` is the
    // primary's key for `/RT /Group` subordinates only (a visual group acts as
    // a unit). `/RT /R` (comment replies) keep `irt` but are not a visual group.
    ...(dto.reply ? { irt: annotationKey(dto.reply.to) } : {}),
    ...(dto.reply?.type === 'group' ? { group: annotationKey(dto.reply.to) } : {}),
    style: styleFromDTO(dto),
    ...slice,
    apBox: pdfToContentRect(strippedRect ?? dto.rect, crop),
    ...(strippedRect ? { apRot: geomRotation(slice.geometry) } : {}),
  };
}

/* ── content model → wire statements (the derivation) ─────────────────────── */

/** Lower `keys` through the kind's overrides + the generic table. `null` =
 *  some key has no lowering — the caller degrades to the full projection. */
function emitProps(
  annotation: ModelAnnotation,
  crop: PdfRect,
  keys: readonly PropKey[],
): Wire | null {
  const kind = projectionOf(annotation.subtype);
  const out: Wire = {};
  for (const key of keys) {
    const lower = kind.prop?.[key] ?? GENERIC_PROPS[key];
    if (!lower) return null;
    Object.assign(out, lower(annotation, crop));
  }
  return out;
}

const editableKeys = (subtype: string): PropKey[] => propsFor(subtype).map((spec) => spec.key);

/** Content ModelAnnotation → the full engine patch: the kind's geometry group plus every
 *  prop it declares editable. The reference statement — scoped emission and
 *  drafts both build on it. */
export function toPatch(annotation: ModelAnnotation, crop: PdfRect): AnnotationPatch | null {
  const kind = projectionOf(annotation.subtype);
  const geo = kind.geometry(annotation, crop);
  const props = emitProps(annotation, crop, editableKeys(annotation.subtype)) ?? {};
  if (!geo && Object.keys(props).length === 0) return null;
  return { subtype: wireSubtypeOf(annotation), ...geo, ...props } as AnnotationPatch;
}

/**
 * Content ModelAnnotation + a {@link PatchScope} → the sparse patch for exactly that
 * intent (the shell's `patch` effect emitter): the reducer says what changed —
 * geometry, or the props keys verbatim — and this lowers only that. Kinds
 * without editable geometry (text markup) and unlowerable keys degrade to the
 * full patch: verbose, never a dropped write.
 */
export function toScopedPatch(
  annotation: ModelAnnotation,
  scope: PatchScope,
  crop: PdfRect,
): AnnotationPatch | null {
  const kind = projectionOf(annotation.subtype);
  if (scope.kind === 'caption') {
    return annotation.measure
      ? ({
          subtype: wireSubtypeOf(annotation),
          ...captionFieldsOf(annotation.measure),
        } as AnnotationPatch)
      : null;
  }
  if (scope.kind === 'leader') {
    return annotation.measure?.intent === 'LineDimension'
      ? { subtype: 'line', leader: annotation.measure.leader }
      : null;
  }
  if (scope.kind === 'geometry') {
    const geo = kind.geometry(annotation, crop);
    return geo
      ? ({ subtype: wireSubtypeOf(annotation), ...geo } as AnnotationPatch)
      : toPatch(annotation, crop);
  }
  const props = emitProps(annotation, crop, scope.keys);
  if (props === null) return toPatch(annotation, crop);
  if (Object.keys(props).length === 0) return null;
  return { subtype: wireSubtypeOf(annotation), ...props } as AnnotationPatch;
}

/** Content ModelAnnotation → engine create draft: the full statement plus the kind's
 *  create-only extras, with the model's `/F` emitted verbatim, once, for every
 *  kind (a fresh draw carries DRAWN_FLAGS plus any tool seed). `null` for the
 *  kinds whose creates travel their own path (stamps, widgets, icon place). */
export function toCreateDraft(annotation: ModelAnnotation, crop: PdfRect): AnnotationDraft | null {
  const kind = projectionOf(annotation.subtype);
  if (kind.createable === false) return null;
  const base = toPatch(annotation, crop);
  if (!base) return null;
  const extras = kind.draftExtras?.(annotation, crop);
  if (kind.draftExtras && extras === null) return null;
  // The /NM comes from `named()` at the write, like every create of this plugin.
  return { ...base, ...extras, ...annotation.flags } as unknown as AnnotationDraft;
}
