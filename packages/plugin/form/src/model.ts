/**
 * The form plugin's data, all pure:
 *
 * - `FieldIndex` is the field tree as the engine confirmed it, indexed by
 *   field key and by widget. It is the value of the plugin's `fields` mirror
 *   and changes only through `foldFormEvent` and loads.
 * - `WidgetBoxes` is one page's widget geometry, the value of the
 *   `widgetBoxes` page mirror.
 * - `FormState` is the session state: which fields have a write in flight.
 *
 * Keystroke drafts are not here: a focused input already holds its draft,
 * and the plugin learns a value only when it is committed.
 */
import { reload, type MirrorReload } from '@embedpdf/core';
import type {
  DocumentEvent,
  FormFieldDTO,
  FormFieldRef,
  FormSnapshot,
} from '@embedpdf/engine-core/runtime';

/** A content-space box (top-left origin, y-down, PDF points). */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Stable client key for a field: its object number when durable, else its fully qualified name. */
export type FieldKey = string;

export const fieldKeyOf = (field: { fieldObjectNumber: number; name: string }): FieldKey =>
  field.fieldObjectNumber > 0 ? `obj:${field.fieldObjectNumber}` : `fqn:${field.name}`;

export const fieldKeyOfRef = (ref: FormFieldRef): FieldKey =>
  ref.kind === 'objectNumber' ? `obj:${ref.fieldObjectNumber}` : `fqn:${ref.name}`;

// ── the field index (the `fields` mirror) ────────────────────────────────────

export interface FieldIndex {
  readonly snapshot: FormSnapshot | null;
  /** Field key → index into `snapshot.fields`. */
  readonly byKey: Readonly<Record<FieldKey, number>>;
  /** Widget annotation object number → index into `snapshot.fields`. */
  readonly byWidget: Readonly<Record<number, number>>;
}

export const emptyFieldIndex = (): FieldIndex => ({ snapshot: null, byKey: {}, byWidget: {} });

export function indexFields(snapshot: FormSnapshot): FieldIndex {
  const byKey: Record<FieldKey, number> = {};
  const byWidget: Record<number, number> = {};
  snapshot.fields.forEach((field, position) => {
    byKey[fieldKeyOf(field)] = position;
    for (const widget of field.widgets) {
      if (widget.annotObjectNumber > 0) byWidget[widget.annotObjectNumber] = position;
    }
  });
  return { snapshot, byKey, byWidget };
}

/** Replace a field by key, or append it when it is new. */
export function upsertFields(index: FieldIndex, fields: readonly FormFieldDTO[]): FieldIndex {
  if (!index.snapshot || fields.length === 0) return index;
  const next = index.snapshot.fields.slice();
  for (const field of fields) {
    const position = index.byKey[fieldKeyOf(field)];
    if (position === undefined) next.push(field);
    else next[position] = field;
  }
  return indexFields({ ...index.snapshot, fields: next });
}

export function removeField(index: FieldIndex, ref: FormFieldRef): FieldIndex {
  if (!index.snapshot) return index;
  const fields = index.snapshot.fields.filter((field) =>
    ref.kind === 'objectNumber'
      ? field.fieldObjectNumber !== ref.fieldObjectNumber
      : field.name !== ref.name,
  );
  if (fields.length === index.snapshot.fields.length) return index;
  return indexFields({ ...index.snapshot, fields });
}

/**
 * Apply one confirmed document event to the field index. Every form event
 * carries the fields it touched as the engine read them back, so the index
 * never needs a re-read except for a repair, whose result reports only counts.
 */
export function foldFormEvent(index: FieldIndex, event: DocumentEvent): FieldIndex | MirrorReload {
  switch (event.type) {
    case 'forms.valueSet':
    case 'forms.updated':
    case 'forms.widgetAdded':
    case 'forms.widgetRemoved':
      return upsertFields(index, [event.field]);
    case 'forms.created': {
      // The first field of a document without a form creates its /AcroForm.
      const created = upsertFields(index, [event.field]);
      return created.snapshot?.formKind === 'none'
        ? indexFields({ ...created.snapshot, formKind: 'acroform' })
        : created;
    }
    case 'forms.deleted':
      return event.deleted ? removeField(index, event.deleted) : reload();
    case 'forms.effectsApplied':
      return upsertFields(
        index,
        event.results.flatMap((result) => result.fields),
      );
    case 'forms.imported':
      return indexFields(event.form);
    case 'forms.repaired':
      return reload();
    default:
      return index;
  }
}

export const fieldByKey = (index: FieldIndex, key: FieldKey): FormFieldDTO | null => {
  const position = index.byKey[key];
  return position === undefined ? null : (index.snapshot?.fields[position] ?? null);
};

export const fieldForWidget = (
  index: FieldIndex,
  annotObjectNumber: number,
): FormFieldDTO | null => {
  const position = index.byWidget[annotObjectNumber];
  return position === undefined ? null : (index.snapshot?.fields[position] ?? null);
};

/** The fields whose value entry differs between two indexes (new fields included). */
export function fieldsWithChangedValues(previous: FieldIndex, next: FieldIndex): FormFieldDTO[] {
  return (next.snapshot?.fields ?? []).filter((field) => {
    const before = fieldByKey(previous, fieldKeyOf(field));
    return !before || JSON.stringify(valueEntryOf(before)) !== JSON.stringify(valueEntryOf(field));
  });
}

const valueEntryOf = (field: FormFieldDTO): unknown =>
  'valueEntry' in field ? field.valueEntry : null;

// ── widget geometry (the `widgetBoxes` page mirror) ──────────────────────────

/** One page's widget geometry: widget annotation object number → content-space box. */
export type WidgetBoxes = Readonly<Record<number, Box>>;

/** A widget hit: the annotation under the point and the field it belongs to. */
export interface WidgetHit {
  readonly annotObjectNumber: number;
  readonly field: FormFieldDTO;
  /** The widget's content-space box. */
  readonly box: Box;
}

export const boxContains = (box: Box, point: { x: number; y: number }): boolean =>
  point.x >= box.x &&
  point.x <= box.x + box.width &&
  point.y >= box.y &&
  point.y <= box.y + box.height;

/** The widget under a content-space point; nested widgets resolve to the smallest box. */
export function widgetAt(
  index: FieldIndex,
  boxes: WidgetBoxes | undefined,
  point: { x: number; y: number },
): WidgetHit | null {
  if (!boxes) return null;
  let best: WidgetHit | null = null;
  for (const [key, box] of Object.entries(boxes)) {
    if (!boxContains(box, point)) continue;
    const annotObjectNumber = Number(key);
    const field = fieldForWidget(index, annotObjectNumber);
    if (!field) continue;
    if (!best || box.width * box.height < best.box.width * best.box.height) {
      best = { annotObjectNumber, field, box };
    }
  }
  return best;
}

// ── session state ────────────────────────────────────────────────────────────

export interface FormState {
  /** Fields with an engine write in flight; their controls render disabled. */
  readonly writing: Readonly<Record<FieldKey, true>>;
}

export const initialFormState = (): FormState => ({ writing: {} });

export const beginWrite = (state: FormState, key: FieldKey): FormState =>
  state.writing[key] ? state : { ...state, writing: { ...state.writing, [key]: true } };

export function endWrite(state: FormState, key: FieldKey): FormState {
  if (!state.writing[key]) return state;
  const { [key]: _settled, ...writing } = state.writing;
  return { ...state, writing };
}
