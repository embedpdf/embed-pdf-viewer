/**
 * The boundary between the engine's PDF-space annotation DTOs and the core's
 * content-space `Annot` — organized KIND-MAJOR like the rest of the stack
 * (engine-core `kinds/`, the services writer registry, the core PropSpec
 * table): each family declares ONE {@link KindProjection} and every wire
 * statement shape derives from it here:
 *
 *   full patch    =  geometry(a)  ∪  props(a, every key the kind declares)
 *   create draft  =  full patch   ∪  draftExtras(a)   (+ `/F` verbatim)
 *   scoped patch  =  geometry(a)  |  props(a, the touched keys)
 *
 * The derivation is sound because of the engine's tri-state law ("a patch
 * touches what it states, preserves what it omits"): a statement never has to
 * restate what it didn't change, and the emitted key set IS the editable set
 * (`propsFor` — the same table that routes `setProps`), so anything outside
 * it can never change in the model. Any key a kind cannot lower degrades to
 * the FULL patch — verbose, never a dropped write.
 */
import type {
  AnnotationDraft,
  AnnotationDTO,
  AnnotationPatch,
  PdfRect,
} from '@embedpdf/engine-core/runtime';
import { propsFor, type Annot, type PatchScope, type PropKey } from '@embedpdf/core-annotation';

import { boxEmit, type KindProjection, type Wire } from './projection';
import { GENERIC_PROPS } from './props';
import { circle, square } from './kinds/shape';
import { ink, line, polygon, polyline } from './kinds/stroke';
import { freeText } from './kinds/freeText';
import { caret, highlight, redact, squiggly, strikeout, underline } from './kinds/quads';
import {
  fileAttachment,
  link,
  stamp,
  textNote,
  unsupported,
  widget,
  widgetKindOf,
} from './kinds/misc';
import { pdfToContentRect, refKey, styleFromDTO } from './seam';
import { geomRotation } from '@embedpdf/core-annotation';

export {
  boxGeomFields,
  colorToCss,
  cssToColor,
  refKey,
  styleFromDTO,
  widgetAppearanceFromProps,
  writableTarget,
} from './seam';
export { foldAttachedLinks, linkChildRects } from './links';
export { boxEmit } from './projection';
export type { KindProjection } from './projection';

/** Every wire subtype declares exactly one projection — a missing kind is a
 *  COMPILE error, not a silent fall-through. */
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
  unsupported,
} satisfies Record<AnnotationDTO['subtype'], KindProjection>;

/** Model subtypes are wire subtypes except the widget CLIENT kinds
 *  (`widget-text`…), which all project through the widget family. */
const projectionOf = (subtype: string): KindProjection =>
  subtype.startsWith('widget')
    ? KINDS.widget
    : ((KINDS as Record<string, KindProjection>)[subtype] ?? KINDS.unsupported);

const wireSubtypeOf = (a: Annot): string => (a.subtype.startsWith('widget') ? 'widget' : a.subtype);

/* ── DTO → content model ──────────────────────────────────────────────────── */

/**
 * Engine DTO → content-space Annot. `source` decides how it renders: `'baked'`
 * shows the engine's appearance raster (a page load, or a remote edit — trust
 * the authored AP); `'vector'` renders live from geom/style (we authored or
 * changed it). `apBox` is the raster's content-space box, used while baked.
 */
export function fromDTO(
  dto: AnnotationDTO,
  crop: PdfRect,
  source: 'baked' | 'vector' = 'baked',
): Annot {
  const slice = projectionOf(dto.subtype).ingest(dto, crop);
  // Rotation-stripped appearances (mirrors the engine's EXACT condition — see
  // AnnotationAppearanceReader): only when the DTO carries BOTH `rotation` and
  // `unrotatedRect` (box-family kinds) is the raster flat and placed by the
  // unrotated box, with the stripped rotation re-applied as a view transform
  // (`apRot`). Vertex kinds pre-rotate their geometry and never carry
  // `unrotatedRect` — their rasters stay placed by `/Rect`, untransformed.
  // A CALLOUT is excluded even when it carries both fields: only its text BOX
  // tilts, via an INLINE matrix mid-stream (the leader is page-space), so its
  // /AP form `/Matrix` is identity and the raster stays placed by `/Rect`.
  const isCallout = dto.subtype === 'free-text' && dto.intent === 'free-text-callout';
  const strippedRect =
    !isCallout && 'unrotatedRect' in dto && 'rotation' in dto && dto.rotation
      ? dto.unrotatedRect
      : undefined;
  return {
    id: refKey(dto.ref),
    ref: dto.ref,
    pon: dto.pageObjectNumber,
    subtype: dto.subtype === 'widget' ? widgetKindOf(dto.fieldFamily) : dto.subtype,
    // `/F` verbatim — every behavioral question (visible? selectable? frozen?)
    // is answered by the core's flag predicates, never derived here.
    flags: dto.flags,
    source,
    // Carry the canonical DTO; geom/style below are derived projections of it.
    data: dto,
    // Relationship to a parent annotation. `irt` mirrors `/IRT`; `group` is the
    // primary's key for `/RT /Group` subordinates only (a visual group acts as
    // a unit). `/RT /R` (comment replies) keep `irt` but are NOT a visual group.
    ...(dto.inReplyTo ? { irt: refKey(dto.inReplyTo) } : {}),
    ...(dto.replyType === 'group' && dto.inReplyTo ? { group: refKey(dto.inReplyTo) } : {}),
    style: styleFromDTO(dto),
    ...slice,
    apBox: pdfToContentRect(strippedRect ?? dto.rect, crop),
    ...(strippedRect ? { apRot: geomRotation(slice.geom) } : {}),
  };
}

/* ── content model → wire statements (the derivation) ─────────────────────── */

/** Lower `keys` through the kind's overrides + the generic table. `null` =
 *  some key has no lowering — the caller degrades to the full projection. */
function emitProps(a: Annot, crop: PdfRect, keys: readonly PropKey[]): Wire | null {
  const kind = projectionOf(a.subtype);
  const out: Wire = {};
  for (const key of keys) {
    const lower = kind.prop?.[key] ?? GENERIC_PROPS[key];
    if (!lower) return null;
    Object.assign(out, lower(a, crop));
  }
  return out;
}

const editableKeys = (subtype: string): PropKey[] => propsFor(subtype).map((s) => s.key);

/** Content Annot → the FULL engine patch: the kind's geometry group plus every
 *  prop it declares editable. The reference statement — scoped emission and
 *  drafts both build on it. */
export function toPatch(a: Annot, crop: PdfRect): AnnotationPatch | null {
  const kind = projectionOf(a.subtype);
  const geo = kind.geometry(a, crop);
  const props = emitProps(a, crop, editableKeys(a.subtype)) ?? {};
  if (!geo && Object.keys(props).length === 0) return null;
  return { subtype: wireSubtypeOf(a), ...geo, ...props } as AnnotationPatch;
}

/**
 * Content Annot + a {@link PatchScope} → the SPARSE patch for exactly that
 * intent (the shell's `patch` effect emitter): the reducer says WHAT changed —
 * geometry, or the props keys verbatim — and this lowers only that. Kinds
 * without editable geometry (text markup) and unlowerable keys degrade to the
 * full patch: verbose, never a dropped write.
 */
export function toScopedPatch(a: Annot, scope: PatchScope, crop: PdfRect): AnnotationPatch | null {
  const kind = projectionOf(a.subtype);
  if (scope.kind === 'geometry') {
    const geo = kind.geometry(a, crop);
    return geo ? ({ subtype: wireSubtypeOf(a), ...geo } as AnnotationPatch) : toPatch(a, crop);
  }
  const props = emitProps(a, crop, scope.keys);
  if (props === null) return toPatch(a, crop);
  if (Object.keys(props).length === 0) return null;
  return { subtype: wireSubtypeOf(a), ...props } as AnnotationPatch;
}

/** Content Annot → engine create draft: the full statement plus the kind's
 *  create-only extras, with the model's `/F` emitted verbatim, once, for every
 *  kind (a fresh draw carries DRAWN_FLAGS plus any tool seed). `null` for the
 *  kinds whose creates travel their own path (stamps, widgets, icon place). */
export function toCreateDraft(a: Annot, crop: PdfRect): AnnotationDraft | null {
  const kind = projectionOf(a.subtype);
  if (kind.createable === false) return null;
  const base = toPatch(a, crop);
  if (!base) return null;
  const extras = kind.draftExtras?.(a, crop);
  if (kind.draftExtras && extras === null) return null;
  return { ...base, ...extras, flags: a.flags } as AnnotationDraft;
}
