/**
 * The form plugin's data, all pure:
 *
 * - `FieldIndex` is the form as the engine confirmed it: the field tree and
 *   every widget row, indexed by field key and by widget. It is the value of
 *   the plugin's `fields` mirror and changes only through `foldFormEvent` and
 *   loads; `predictFormOp` shows this session's changes on top of it.
 * - `PageWidgets` is one page's widgets, where each is and how it looks,
 *   derived from the index's widget rows (`pageWidgetsOf`).
 *
 * The text being typed in a field is not here: it waits in `write/typing.ts`
 * until it is committed.
 */
import { reload, type MirrorReload, type PredictedOp } from '@embedpdf/core';
import {
  annotationKey,
  fieldAfterReset,
  fieldAfterValue,
  reorderPart,
  widgetsAfterDisplay,
  type AnnotationRef,
  type DocumentEvent,
  type FieldWithWidgets,
  type FormFieldDTO,
  type FormFieldRef,
  type FormSnapshot,
  type FormWidget,
  type PageRef,
  type WidgetAnnotation,
} from '@embedpdf/engine-core/runtime';

/** A page-space box (top-left origin, y-down, PDF points). */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Stable client key for a field: its object number when durable, else its fully qualified name. */
export type FieldKey = string;

export const fieldKeyOfRef = (ref: FormFieldRef): FieldKey =>
  ref.kind === 'objectNumber' ? `obj:${ref.objectNumber}` : `fqn:${ref.name}`;

/** A field's ref is its object number, or its name when it has none. */
export const fieldKeyOf = (field: { ref: FormFieldRef }): FieldKey => fieldKeyOfRef(field.ref);

// ── the field index (the `fields` mirror) ────────────────────────────────────

export interface FieldIndex {
  readonly snapshot: FormSnapshot | null;
  /** Field key → index into `snapshot.fields`. */
  readonly byKey: Readonly<Record<FieldKey, number>>;
  /** Full name → index into `snapshot.fields`, for a ref made with `toFieldRef(name)`. */
  readonly byName: Readonly<Record<string, number>>;
  /** Widget annotation object number → index into `snapshot.fields`. */
  readonly byWidget: Readonly<Record<number, number>>;
  /** Widget annotation object number → index into `snapshot.widgets`, its row. */
  readonly rowByWidget: Readonly<Record<number, number>>;
}

export const emptyFieldIndex = (): FieldIndex => ({
  snapshot: null,
  byKey: {},
  byName: {},
  byWidget: {},
  rowByWidget: {},
});

export function indexFields(snapshot: FormSnapshot): FieldIndex {
  const byKey: Record<FieldKey, number> = {};
  const byName: Record<string, number> = {};
  const byWidget: Record<number, number> = {};
  const rowByWidget: Record<number, number> = {};
  snapshot.fields.forEach((field, position) => {
    byKey[fieldKeyOf(field)] = position;
    byName[field.name] ??= position;
    for (const widget of field.widgets) {
      if (widget.objectNumber > 0) byWidget[widget.objectNumber] = position;
    }
  });
  snapshot.widgets.forEach((row, position) => {
    if (row.ref.kind === 'objectNumber') rowByWidget[row.ref.objectNumber] = position;
  });
  return { snapshot, byKey, byName, byWidget, rowByWidget };
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

const widgetNumber = (widget: WidgetAnnotation): number =>
  widget.ref.kind === 'objectNumber' ? widget.ref.objectNumber : 0;

/** Replace widget rows by object number, or append the ones that are new. */
export function upsertWidgets(index: FieldIndex, rows: readonly WidgetAnnotation[]): FieldIndex {
  if (!index.snapshot || rows.length === 0) return index;
  const incoming = new Map(rows.map((row) => [widgetNumber(row), row]));
  const next = index.snapshot.widgets.map((row) => {
    const replaced = incoming.get(widgetNumber(row));
    if (replaced) incoming.delete(widgetNumber(row));
    return replaced ?? row;
  });
  return indexFields({ ...index.snapshot, widgets: [...next, ...incoming.values()] });
}

/** The page's widget rows in `order` (bottom to top), in their slots: other pages' keep theirs. */
export function reorderWidgetRows(
  index: FieldIndex,
  page: PageRef,
  order: readonly AnnotationRef[],
): FieldIndex {
  if (!index.snapshot) return index;
  const widgets = reorderPart(
    index.snapshot.widgets,
    (row) => row.page.objectNumber === page.objectNumber,
    order.map(annotationKey),
    (row) => annotationKey(row.ref),
  );
  return indexFields({ ...index.snapshot, widgets });
}

/** Drop the rows of widgets that went (with their field, or with their page). */
export function removeWidgets(index: FieldIndex, gone: readonly FormWidget[]): FieldIndex {
  if (!index.snapshot || gone.length === 0) return index;
  const numbers = new Set(gone.map((widget) => widget.objectNumber));
  const widgets = index.snapshot.widgets.filter((row) => !numbers.has(widgetNumber(row)));
  if (widgets.length === index.snapshot.widgets.length) return index;
  return indexFields({ ...index.snapshot, widgets });
}

export function removeField(index: FieldIndex, ref: FormFieldRef): FieldIndex {
  if (!index.snapshot) return index;
  const fields = index.snapshot.fields.filter((field) =>
    ref.kind === 'objectNumber'
      ? !(field.ref.kind === 'objectNumber' && field.ref.objectNumber === ref.objectNumber)
      : field.name !== ref.name,
  );
  if (fields.length === index.snapshot.fields.length) return index;
  return indexFields({ ...index.snapshot, fields });
}

/**
 * Apply one confirmed document event to the field index. Every form event
 * carries the fields and the widget rows it touched as the engine read them
 * back, so the index never needs a re-read except for a repair, whose result
 * reports only counts, and for writes that remove widgets with their pages.
 */
export function foldFormEvent(index: FieldIndex, event: DocumentEvent): FieldIndex | MirrorReload {
  switch (event.type) {
    case 'forms.valueSet':
    case 'forms.widgetAdded':
    case 'forms.widgetRemoved':
    case 'forms.restored':
      return upsertWidgets(upsertFields(index, [event.field]), event.widgets);
    case 'forms.updated':
      return withCalculationOrder(
        upsertWidgets(upsertFields(index, [event.field]), event.widgets),
        event.calculationOrder,
      );
    case 'forms.created': {
      // The first field of a document without a form creates its /AcroForm.
      const created = upsertWidgets(upsertFields(index, [event.field]), event.widgets);
      return withCalculationOrder(
        created.snapshot?.formKind === 'none'
          ? indexFields({ ...created.snapshot, formKind: 'acroform' })
          : created,
        event.calculationOrder,
      );
    }
    case 'forms.calculationsReordered':
      return withCalculationOrder(index, event.calculationOrder);
    case 'forms.widgetDeleted': {
      const gone = removeWidgets(index, event.meta.changedWidgets);
      return event.field ? upsertFields(gone, [event.field]) : gone;
    }
    case 'forms.widgetRestored':
      return upsertWidgets(event.field ? upsertFields(index, [event.field]) : index, event.widgets);
    case 'forms.widgetUpdated':
      return upsertWidgets(index, [event.widget]);
    case 'forms.widgetsReordered':
      return reorderWidgetRows(index, event.page, event.order);
    case 'forms.deleted':
      return event.deleted
        ? withCalculationOrder(
            removeWidgets(removeField(index, event.deleted), event.meta.changedWidgets),
            event.calculationOrder,
          )
        : reload();
    // A repair reports only counts; the others remove pages, or paint their
    // widgets into the content.
    case 'forms.repaired':
    case 'pages.deleted':
    case 'pages.inserted':
    case 'pages.flattened':
    case 'annotations.flattened':
    case 'redaction.applied':
      return reload();
    default:
      return index;
  }
}

/** The rows of a field's widgets, in its widget order. */
function rowsOfField(index: FieldIndex, field: FormFieldDTO): WidgetAnnotation[] {
  return field.widgets.flatMap((widget) => {
    const row = widgetRowOf(index, widget.objectNumber);
    return row ? [row] : [];
  });
}

/** A field and the rows of its widgets, as the index holds them. */
const withRows = (index: FieldIndex, field: FormFieldDTO): FieldWithWidgets => ({
  field,
  widgets: rowsOfField(index, field),
});

/** Fields and their widget rows put into the index, all at once. */
function withFields(index: FieldIndex, parts: readonly FieldWithWidgets[]): FieldIndex {
  if (parts.length === 0) return index;
  return upsertWidgets(
    upsertFields(
      index,
      parts.map((part) => part.field),
    ),
    parts.flatMap((part) => part.widgets),
  );
}

/** The fields a reset of the whole form puts back: the ones that hold a value. */
const resetTargets = (index: FieldIndex): FormFieldDTO[] =>
  (index.snapshot?.fields ?? []).filter((field) => RESET_FAMILIES.has(field.family));

const RESET_FAMILIES = new Set(['text', 'checkbox', 'radio', 'combobox', 'listbox']);

/**
 * One op of a change this session staged, shown before the engine answers,
 * by the engine's own rules (`fieldAfterValue`, `fieldAfterReset`,
 * `widgetsAfterDisplay`): what the field and its widgets hold after it. An op
 * the engine would refuse shows nothing; its refusal takes the change away.
 * The design ops show once the engine answers.
 *
 * The view replays every pending change each time any change is staged; the
 * same op over the same form gives the same form, so a field keeps its object
 * while nothing about it changed.
 */
export function predictFormOp(index: FieldIndex, op: PredictedOp): FieldIndex {
  let byOp = predictions.get(index);
  const known = byOp?.get(op);
  if (known) return known;
  const next = predictOnce(index, op);
  if (!byOp) predictions.set(index, (byOp = new WeakMap()));
  byOp.set(op, next);
  return next;
}

const predictions = new WeakMap<FieldIndex, WeakMap<PredictedOp, FieldIndex>>();

function predictOnce(index: FieldIndex, op: PredictedOp): FieldIndex {
  try {
    switch (op.type) {
      case 'forms.setValue': {
        const field = fieldByRef(index, op.field);
        return field
          ? withFields(index, [fieldAfterValue(withRows(index, field), op.value)])
          : index;
      }
      case 'forms.reset': {
        const targets = op.fields
          ? op.fields.flatMap((ref) => fieldByRef(index, ref) ?? [])
          : resetTargets(index);
        return withFields(
          index,
          targets.map((field) => fieldAfterReset(withRows(index, field))),
        );
      }
      case 'forms.setDisplay': {
        const field = fieldByRef(index, op.field);
        if (!field) return index;
        return upsertWidgets(index, widgetsAfterDisplay(rowsOfField(index, field), op.display));
      }
      case 'forms.restore':
        return withFields(index, [op]);
      case 'forms.restoreWidget': {
        const restored = upsertWidgets(index, [op.widget]);
        return op.field ? upsertFields(restored, [op.field]) : restored;
      }
      default:
        return index;
    }
  } catch {
    return index;
  }
}

/** Whether any field has a keystroke, validate, calculate or format script. */
export function formHasScripts(index: FieldIndex): boolean {
  return (index.snapshot?.fields ?? []).some(
    ({ actions }) =>
      !!(actions?.keystroke || actions?.validate || actions?.calculate || actions?.format),
  );
}

/** The fields a change's ops write a value or a look to, each once, in op order. */
export function fieldsNamedBy(index: FieldIndex, ops: readonly PredictedOp[]): FormFieldDTO[] {
  const named = new Map<FieldKey, FormFieldDTO>();
  const add = (field: FormFieldDTO | null): void => {
    if (field && !named.has(fieldKeyOf(field))) named.set(fieldKeyOf(field), field);
  };
  for (const op of ops) {
    switch (op.type) {
      case 'forms.setValue':
      case 'forms.setDisplay':
      case 'forms.setAppearanceText':
        add(fieldByRef(index, op.field));
        break;
      case 'forms.reset':
        for (const field of op.fields
          ? op.fields.map((ref) => fieldByRef(index, ref))
          : resetTargets(index)) {
          add(field);
        }
        break;
      default:
        break;
    }
  }
  return [...named.values()];
}

/** `index` with these fields, and their widget rows, as `source` holds them. */
export function withFieldsFrom(
  index: FieldIndex,
  source: FieldIndex,
  fields: readonly FormFieldDTO[],
): FieldIndex {
  return withFields(
    index,
    fields.flatMap((field) => {
      const held = fieldByKey(source, fieldKeyOf(field));
      return held ? [withRows(source, held)] : [];
    }),
  );
}

/** What undoing a change of these ops looks like: each field they write, and its widgets, as `before` holds them. */
export function restoresOf(before: FieldIndex, ops: readonly PredictedOp[]): PredictedOp[] {
  return fieldsNamedBy(before, ops).map((field) => ({
    type: 'forms.restore',
    field,
    widgets: rowsOfField(before, field),
  }));
}

/** The index with the calculation order a write answered, when the write changed it. */
function withCalculationOrder(index: FieldIndex, order: FormFieldRef[] | undefined): FieldIndex {
  if (!order || !index.snapshot) return index;
  return indexFields({ ...index.snapshot, calculationOrder: order });
}

export const fieldByKey = (index: FieldIndex, key: FieldKey): FormFieldDTO | null => {
  const position = index.byKey[key];
  return position === undefined ? null : (index.snapshot?.fields[position] ?? null);
};

/** The field a ref names: by object number, or by full name for `toFieldRef(name)`. */
export function fieldByRef(index: FieldIndex, ref: FormFieldRef): FormFieldDTO | null {
  const position = ref.kind === 'fqn' ? index.byName[ref.name] : index.byKey[fieldKeyOfRef(ref)];
  return position === undefined ? null : (index.snapshot?.fields[position] ?? null);
}

/** The key a field is known by, whichever ref names it: a name ref resolves to its field's key. */
export const canonicalKey = (index: FieldIndex, ref: FormFieldRef): FieldKey => {
  const field = fieldByRef(index, ref);
  return field ? fieldKeyOf(field) : fieldKeyOfRef(ref);
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

// ── widgets (each page's, from the index's widget rows) ──────────────────────

/**
 * How a widget looks in the PDF, as its own appearance settings say: `null`
 * where it has none of its own. A viewer that draws controls over the field
 * uses these, and its own settings where the field has nothing.
 */
export interface FormWidgetLook {
  /** The border color (`/MK /BC`), or `null` for a widget without a border. */
  readonly border: string | null;
  /** The border width in points. */
  readonly borderWidth: number;
  readonly borderStyle: 'solid' | 'dashed' | 'beveled' | 'inset' | 'underline';
  /** The background color (`/MK /BG`), or `null` for a see-through widget. */
  readonly background: string | null;
  /** The text color (`/DA`), or `null` when the field names none. */
  readonly color: string | null;
  /** One of the 14 standard PDF fonts, such as `'helvetica'`, or `null` when the field names none. */
  readonly fontFamily: string | null;
  /** The font size in points; `0` or `null` sizes the text to the box. */
  readonly fontSize: number | null;
  readonly textAlign: 'left' | 'center' | 'right';
}

/** One widget on its page: its page-space box and its look. */
export interface PageWidget {
  readonly box: Box;
  readonly look: FormWidgetLook;
}

/** One page's widgets: widget annotation object number → where it is and how it looks. */
export type PageWidgets = Readonly<Record<number, PageWidget>>;

/** Whether a widget shows on screen: its `hidden` and `noView` flags hide it. */
export const shownOnScreen = (row: WidgetAnnotation): boolean => !row.hidden && !row.noView;

/** The widgets one page shows, from the form's widget rows. */
export function pageWidgetsOf(index: FieldIndex, pageObjectNumber: number): PageWidgets {
  const widgets: Record<number, PageWidget> = {};
  for (const row of index.snapshot?.widgets ?? []) {
    if (row.page.objectNumber !== pageObjectNumber || row.ref.kind !== 'objectNumber') continue;
    if (!shownOnScreen(row)) continue;
    widgets[row.ref.objectNumber] = {
      box: row.rect,
      look: {
        border: row.color ?? null,
        borderWidth: row.strokeWidth ?? 1,
        borderStyle: row.borderStyle ?? 'solid',
        background: row.interiorColor ?? null,
        color: row.fontColor ?? null,
        fontFamily: row.fontFamily ?? null,
        fontSize: row.fontSize ?? null,
        textAlign: row.textAlign ?? 'left',
      },
    };
  }
  return widgets;
}

/** A widget a page shows: its address and the appearance state it shows. */
export interface ShownWidget {
  readonly ref: AnnotationRef;
  /** The state it shows (`/AS`), or `null` for a widget without states. */
  readonly appearanceState: string | null;
}

/** The widgets one page shows, in the order the page draws them. */
export function shownWidgetsOf(index: FieldIndex, pageObjectNumber: number): ShownWidget[] {
  const shown: ShownWidget[] = [];
  for (const row of index.snapshot?.widgets ?? []) {
    if (row.page.objectNumber !== pageObjectNumber || !shownOnScreen(row)) continue;
    shown.push({ ref: row.ref, appearanceState: row.appearanceState });
  }
  return shown;
}

/** A widget's row, by its object number; `null` when no page shows it. */
export function widgetRowOf(index: FieldIndex, annotObjectNumber: number): WidgetAnnotation | null {
  const position = index.rowByWidget[annotObjectNumber];
  return position === undefined ? null : (index.snapshot?.widgets[position] ?? null);
}

/** A widget hit: the annotation under the point and the field it belongs to. */
export interface WidgetHit {
  readonly annotObjectNumber: number;
  readonly field: FormFieldDTO;
  /** The widget's page-space box. */
  readonly box: Box;
}

export const boxContains = (box: Box, point: { x: number; y: number }): boolean =>
  point.x >= box.x &&
  point.x <= box.x + box.width &&
  point.y >= box.y &&
  point.y <= box.y + box.height;

/** The widget under a page-space point; nested widgets resolve to the smallest box. */
export function widgetAt(
  index: FieldIndex,
  widgets: PageWidgets | undefined,
  point: { x: number; y: number },
): WidgetHit | null {
  if (!widgets) return null;
  let best: WidgetHit | null = null;
  for (const [key, { box }] of Object.entries(widgets)) {
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

/** The plugin's session state: nothing yet; a write in flight shows in the mirror's view. */
export type FormState = Readonly<Record<string, never>>;

export const initialFormState = (): FormState => ({});
