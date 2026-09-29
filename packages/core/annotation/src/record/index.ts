/**
 * The boundary between the engine's annotation DTOs and the core's
 * `ModelAnnotation`, both in page space — organized kind-major like the rest of the stack
 * (engine-core `kinds/`, the services writer registry, the core FieldSpec
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
 * (`fieldsFor` — the same table a sidebar edits from), so anything outside
 * it can never change in the model. Any key a kind cannot lower degrades to
 * the full patch — verbose, never a dropped write.
 */
import {
  annotationOfDraft,
  appearanceTurnOf,
  assertDeclaredFields,
  mergeAnnotationPatch,
  type AnnotationDraft,
  type AnnotationDTO,
  type AnnotationPatch,
  type AnnotationRef,
} from '@embedpdf/engine-core/runtime';

import { FLAG_KEYS } from '../flags';
import { geomRotation, geomVisualBounds } from '../geometry';
import { fieldsFor } from '../kinds';
import type { ModelAnnotation, ModelGeometry, RecordFields, Style, TextStyle } from '../types';
import { freeText } from './kinds/freeText';
import {
  circle,
  fileAttachment,
  link,
  square,
  stamp,
  textNote,
  unsupported,
  widget,
  widgetKindOf,
} from './kinds/box';
import { caret, highlight, redact, squiggly, strikeout, underline } from './kinds/quads';
import { captionFieldsFor, ink, line, polygon, polyline } from './kinds/stroke';
import type { KindProjection, LoweredKey, Wire } from './projection';
import { GENERIC_PROPS } from './props';
import { annotationKey, flagsOf, styleFromDTO } from './seam';

export {
  boxGeomFields,
  hexColorOf,
  styleFromDTO,
  widgetAppearanceOf,
  writableTarget,
} from './seam';
export { linkChildRects } from './links';

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

const wireSubtypeOf = (annotation: RecordFields): string =>
  annotation.subtype.startsWith('widget') ? 'widget' : annotation.subtype;

/* ── DTO → model ──────────────────────────────────────────────────────────── */

/** The client kind of a read: its subtype, or a widget's field family. */
const kindOf = (dto: AnnotationDTO): string =>
  dto.subtype === 'widget' ? widgetKindOf(dto.fieldFamily) : dto.subtype;

/**
 * Engine DTO → ModelAnnotation, rendering from the engine's
 * appearance raster (`source: 'baked'`, placed by `apBox`). Whether this
 * session renders it live instead is the view's choice (read/view.ts).
 */
export function fromDTO(dto: AnnotationDTO): ModelAnnotation {
  // Rotation-stripped appearances (`appearanceTurnOf`, the engine's own rule):
  // a box kind drawn turned whose drawing stays inside the turned box has a
  // flat raster placed by its `box`, the stripped rotation re-applied as a
  // view transform (`apRot`). Every other raster — vertex kinds, a callout
  // (only its text box tilts), a turned drawing that reaches past its box —
  // is placed by `/Rect`, untransformed.
  const strippedRect = 'box' in dto && appearanceTurnOf(dto) !== null ? dto.box : undefined;
  return {
    id: annotationKey(dto.ref),
    ref: dto.ref,
    page: dto.page,
    subtype: kindOf(dto),
    source: 'baked',
    annotation: dto,
    // Relationship to a parent annotation. `irt` mirrors `/IRT`; `group` is the
    // primary's key for `/RT /Group` subordinates only (a visual group acts as
    // a unit). `/RT /R` (comment replies) keep `irt` but are not a visual group.
    ...(dto.reply ? { irt: annotationKey(dto.reply.to) } : {}),
    ...(dto.reply?.type === 'group' ? { group: annotationKey(dto.reply.to) } : {}),
    apBox: strippedRect ?? dto.rect,
    ...(strippedRect ? { apRot: geomRotation(projected(dto).geometry) } : {}),
  };
}

/** What `fieldsOf` works out from an annotation, beside the record's own keys. */
type Projected = Omit<RecordFields, keyof ModelAnnotation>;

const projections = new WeakMap<AnnotationDTO, Projected>();

/** An annotation's fields in the core's shapes, worked out once per annotation. */
function projected(dto: AnnotationDTO): Projected {
  const cached = projections.get(dto);
  if (cached) return cached;
  const fields: Projected = {
    // `/F` verbatim — every behavioral question (visible? selectable? frozen?)
    // is answered by the core's flag predicates, never derived here.
    flags: flagsOf(dto),
    style: styleFromDTO(dto),
    ...projectionOf(kindOf(dto)).ingest(dto),
  };
  projections.set(dto, fields);
  return fields;
}

const recordFields = new WeakMap<ModelAnnotation, RecordFields>();

/**
 * A record's fields as the core's gestures read them: its geometry, style,
 * text and the rest, worked out from its annotation. The same object for the
 * same record.
 */
export function fieldsOf(record: ModelAnnotation): RecordFields {
  const cached = recordFields.get(record);
  if (cached) return cached;
  const fields: RecordFields = { ...record, ...projected(record.annotation) };
  recordFields.set(record, fields);
  return fields;
}

/** The record `fields` describe, holding `annotation`: its keys and how it is drawn, beside it. */
export function recordOf(fields: RecordFields, annotation: AnnotationDTO): ModelAnnotation {
  const { id, ref, page, subtype, source, apBox, apRot, apVersion, authority, irt, group } = fields;
  return {
    id,
    ref,
    page,
    subtype,
    source,
    annotation,
    ...(apBox ? { apBox } : {}),
    ...(apRot !== undefined ? { apRot } : {}),
    ...(apVersion !== undefined ? { apVersion } : {}),
    ...(authority ? { authority } : {}),
    ...(irt !== undefined ? { irt } : {}),
    ...(group !== undefined ? { group } : {}),
  };
}

/**
 * The record with some of its fields changed: the engine fields the change
 * means (`patchFor`), merged into its annotation as given. `update` then
 * applies them as the engine will. The same record when nothing the engine
 * keeps changed.
 */
export function withFields(
  record: ModelAnnotation,
  change: Partial<RecordFields>,
): ModelAnnotation {
  const before = fieldsOf(record);
  const patch = patchFor(before, { ...before, ...change });
  if (!patch) return record;
  // A field the kind doesn't have is a mistake in the core, never dropped quietly.
  assertDeclaredFields(record.annotation.subtype, patch);
  return { ...record, annotation: mergeAnnotationPatch(record.annotation, patch) };
}

/* ── model → wire statements (the derivation) ─────────────────────────────── */

/** Lower `keys` through the kind's overrides + the generic table. `null` =
 *  some key has no lowering — the caller degrades to the full projection. */
function emitProps(annotation: RecordFields, keys: readonly LoweredKey[]): Wire | null {
  const kind = projectionOf(annotation.subtype);
  const out: Wire = {};
  for (const key of keys) {
    const lower = kind.prop?.[key] ?? GENERIC_PROPS[key];
    if (!lower) return null;
    Object.assign(out, lower(annotation));
  }
  return out;
}

/** The parts of its fields a kind's editable fields lower from: its border picker is its `border`. */
const editableKeys = (subtype: string): LoweredKey[] =>
  fieldsFor(subtype).map((spec) => (spec.key === 'borderStyle' ? 'border' : spec.key));

/** ModelAnnotation → the full engine patch: the kind's geometry group plus every
 *  prop it declares editable. The reference statement — scoped emission and
 *  drafts both build on it. */
export function toPatch(annotation: RecordFields): AnnotationPatch | null {
  const kind = projectionOf(annotation.subtype);
  const geo = kind.geometry(annotation);
  const props = emitProps(annotation, editableKeys(annotation.subtype)) ?? {};
  if (!geo && Object.keys(props).length === 0) return null;
  return { subtype: wireSubtypeOf(annotation), ...geo, ...props } as AnnotationPatch;
}

/** ModelAnnotation → engine create draft: the full statement plus the kind's
 *  create-only extras, with the model's `/F` emitted verbatim, once, for every
 *  kind (a fresh draw carries DRAWN_FLAGS plus any tool seed). `null` for the
 *  kinds whose creates travel their own path (stamps, widgets, icon place). */
export function toCreateDraft(annotation: RecordFields): AnnotationDraft | null {
  const kind = projectionOf(annotation.subtype);
  if (kind.createable === false) return null;
  const base = toPatch(annotation);
  if (!base) return null;
  const extras = kind.draftExtras?.(annotation);
  if (kind.draftExtras && extras === null) return null;
  // The /NM is the name the record's annotation was predicted under
  // (`newRecord`), so the engine's answer is the record the view showed.
  const nm = annotation.annotation?.nm;
  return {
    ...base,
    ...extras,
    ...annotation.flags,
    ...(nm ? { nm } : {}),
  } as unknown as AnnotationDraft;
}

/* ── the annotation a record holds ────────────────────────────────────────── */

/** What a record's annotation says beside its fields: the ref and the place the engine gives it. */
export interface AnnotationPlace {
  /** The ref the engine answers to: an `nm` ref for a record not written yet. */
  readonly ref: AnnotationRef;
  /** Its position among the page's annotations. */
  readonly index: number;
  /** The annotation it belongs to: a group's primary, or the note it answers. */
  readonly reply?: NonNullable<AnnotationDTO['reply']>;
}

/**
 * The annotation a record's fields predict: its create, read back as the
 * engine will (the kind's defaults filled in, related fields following),
 * named by an `nm` ref. A kind whose `rect` the engine works out from its
 * drawing gets the drawn bounds; attribution waits for the engine.
 */
export function annotationOfRecord(record: RecordFields, place: AnnotationPlace): AnnotationDTO {
  const statement =
    toCreateDraft(record) ??
    ({ ...toPatch(record), ...record.flags } as unknown as AnnotationDraft);
  const draft = (
    place.ref.kind === 'nm' ? { ...statement, nm: place.ref.nm } : statement
  ) as AnnotationDraft;
  const drawn =
    'rect' in draft
      ? undefined
      : geomVisualBounds(record.geometry, record.style.strokeWidth, record.style.border);
  const annotation = annotationOfDraft(draft, {
    ref: place.ref,
    index: place.index,
    ...(drawn ? { rect: drawn } : {}),
  });
  return place.reply ? { ...annotation, reply: place.reply } : annotation;
}

const STYLE_KEYS = [
  'color',
  'interiorColor',
  'strokeWidth',
  'opacity',
  'blendMode',
  'border',
] as const satisfies readonly (keyof Style)[];

const TEXT_KEYS = [
  'fontFamily',
  'fontSize',
  'fontColor',
  'textAlign',
  'bold',
  'italic',
  'underline',
] as const satisfies readonly (keyof TextStyle)[];

const sameValue = (left: unknown, right: unknown): boolean =>
  left === right || JSON.stringify(left) === JSON.stringify(right);

const endsOf = (geometry: ModelGeometry) =>
  'lineEndings' in geometry ? geometry.lineEndings : undefined;

/** Whether the shape moved: its geometry other than its line endings (those are a prop). */
const shapeMoved = (before: ModelGeometry, after: ModelGeometry): boolean =>
  before !== after &&
  !sameValue({ ...before, lineEndings: undefined }, { ...after, lineEndings: undefined });

/**
 * What the change from `before` to `after` means to the engine: the kind's
 * geometry group when its geometry moved, a measurement's caption or leader
 * when that moved, each prop whose value changed, and each flag that changed.
 * `null` when nothing the engine keeps changed.
 */
function patchFor(before: RecordFields, after: RecordFields): AnnotationPatch | null {
  const takes = new Set(editableKeys(after.subtype));
  const keys: LoweredKey[] = [];
  const compare = (key: LoweredKey, was: unknown, now: unknown) => {
    if (takes.has(key) && !sameValue(was, now)) keys.push(key);
  };
  if (before.style !== after.style) {
    for (const key of STYLE_KEYS) compare(key, before.style[key], after.style[key]);
  }
  if (before.text !== after.text) {
    for (const key of TEXT_KEYS) compare(key, before.text?.[key], after.text?.[key]);
  }
  compare('lineEndings', endsOf(before.geometry), endsOf(after.geometry));
  compare('icon', before.icon, after.icon);
  compare('link', before.link, after.link);

  const out: Wire = {};
  if (shapeMoved(before.geometry, after.geometry)) {
    Object.assign(out, projectionOf(after.subtype).geometry(after));
  }
  // A measurement's caption and leader, as it has them: the write carries what
  // changed. Its label is the engine's.
  if (after.measure && before.measure !== after.measure) {
    Object.assign(out, captionFieldsFor(after));
  }
  if (keys.length) Object.assign(out, emitProps(after, keys) ?? toPatch(after));
  for (const flag of FLAG_KEYS) {
    if (before.flags[flag] !== after.flags[flag]) out[flag] = after.flags[flag];
  }
  return Object.keys(out).length
    ? ({ ...out, subtype: wireSubtypeOf(after) } as AnnotationPatch)
    : null;
}
