/**
 * The form plugin's data, all pure:
 *
 * - `FieldIndex` is the form as the engine confirmed it: the field tree and
 *   every widget row, indexed by field key and by widget. It is the value of
 *   the plugin's `fields` mirror and changes only through `foldFormEvent` and
 *   loads; `predictFormOp` (sync/predict.ts) shows this session's changes on
 *   top of it.
 * - `PageWidgets` is one page's widgets, where each is and how it looks,
 *   derived from the index's widget rows (`pageWidgetsOf`).
 *
 * The text being typed in a field is not here: it waits in `write/typing.ts`
 * until it is committed.
 */
import { reload, type MirrorReload } from '@embedpdf/core';
import {
  annotationKey,
  reorderPart,
  type AnnotationRef,
  type DocumentEvent,
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
  /**
   * Widget annotation object number → the version of its picture. It moves
   * when the engine draws the widget again, and only then: its pictures are
   * fetched again exactly when it moves. A widget that went keeps its entry,
   * so one made again with its number never takes an older picture.
   */
  readonly pictureVersions: Readonly<Record<number, number>>;
}

export const emptyFieldIndex = (): FieldIndex => ({
  snapshot: null,
  byKey: {},
  byName: {},
  byWidget: {},
  rowByWidget: {},
  pictureVersions: {},
});

export function indexFields(
  snapshot: FormSnapshot,
  pictureVersions: FieldIndex['pictureVersions'] = {},
): FieldIndex {
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
  return { snapshot, byKey, byName, byWidget, rowByWidget, pictureVersions };
}

/** The index of `snapshot`, keeping `index`'s picture versions. */
const reindex = (index: FieldIndex, snapshot: FormSnapshot): FieldIndex =>
  indexFields(snapshot, index.pictureVersions);

/**
 * A fresh read of the whole form: every widget's picture version moves past
 * the one it had, so a reload re-fetches every picture (the pictures may
 * have changed while the event stream wasn't trusted). A new widget starts at 0.
 */
export function indexLoadedFields(previous: FieldIndex, snapshot: FormSnapshot): FieldIndex {
  const pictureVersions: Record<number, number> = {};
  for (const [number, version] of Object.entries(previous.pictureVersions)) {
    pictureVersions[Number(number)] = version + 1;
  }
  for (const row of snapshot.widgets) {
    const number = widgetNumber(row);
    if (number > 0) pictureVersions[number] ??= 0;
  }
  return indexFields(snapshot, pictureVersions);
}

/** The picture version of a widget; 0 for one the index has never seen. */
export const pictureVersionOf = (index: FieldIndex, annotObjectNumber: number): number =>
  index.pictureVersions[annotObjectNumber] ?? 0;

/** Replace a field by key, or append it when it is new. */
export function upsertFields(index: FieldIndex, fields: readonly FormFieldDTO[]): FieldIndex {
  if (!index.snapshot || fields.length === 0) return index;
  const next = index.snapshot.fields.slice();
  for (const field of fields) {
    const position = index.byKey[fieldKeyOf(field)];
    if (position === undefined) next.push(field);
    else next[position] = field;
  }
  return reindex(index, { ...index.snapshot, fields: next });
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
  return reindex(index, { ...index.snapshot, widgets: [...next, ...incoming.values()] });
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
  return reindex(index, { ...index.snapshot, widgets });
}

/** Drop the rows of widgets that went (with their field, or with their page). */
export function removeWidgets(index: FieldIndex, gone: readonly FormWidget[]): FieldIndex {
  if (!index.snapshot || gone.length === 0) return index;
  const numbers = new Set(gone.map((widget) => widget.objectNumber));
  const widgets = index.snapshot.widgets.filter((row) => !numbers.has(widgetNumber(row)));
  if (widgets.length === index.snapshot.widgets.length) return index;
  return reindex(index, { ...index.snapshot, widgets });
}

export function removeField(index: FieldIndex, ref: FormFieldRef): FieldIndex {
  if (!index.snapshot) return index;
  const fields = index.snapshot.fields.filter((field) =>
    ref.kind === 'objectNumber'
      ? !(field.ref.kind === 'objectNumber' && field.ref.objectNumber === ref.objectNumber)
      : field.name !== ref.name,
  );
  if (fields.length === index.snapshot.fields.length) return index;
  return reindex(index, { ...index.snapshot, fields });
}

/**
 * Apply one confirmed document event to the field index. Every form event
 * carries the fields and the widget rows it touched as the engine read them
 * back, so the index never needs a re-read except for a repair, whose result
 * reports only counts, and for writes that remove widgets with their pages.
 * The widgets the engine drew again take a new picture version.
 */
export function foldFormEvent(index: FieldIndex, event: DocumentEvent): FieldIndex | MirrorReload {
  return foldFormFacts(withRedrawnPictures(index, redrawnWidgetsOf(event)), event);
}

/** A widget an event says it drew: its page, and its number when the event names it. */
type PlacedWidget = { readonly page: PageRef | null; readonly objectNumber?: number };

/**
 * The widgets a confirmed fact drew again: the ones the engine says it
 * redrew (`meta.redrawnWidgets`: a checkbox that only switched its state isn't
 * one), else the ones it changed; the signed widget of a signing.
 */
function redrawnWidgetsOf(event: DocumentEvent): readonly PlacedWidget[] {
  if (event.type === 'signatures.completed') {
    return event.signature.widget ? [event.signature.widget] : [];
  }
  if (!event.type.startsWith('forms.') || !('meta' in event)) return [];
  const meta = event.meta as {
    readonly changedWidgets?: readonly PlacedWidget[];
    readonly redrawnWidgets?: readonly PlacedWidget[];
  };
  return meta.redrawnWidgets ?? meta.changedWidgets ?? [];
}

/** Each widget drawn again takes a new picture version; one named by its page only, all of that page's. */
function withRedrawnPictures(index: FieldIndex, redrawn: readonly PlacedWidget[]): FieldIndex {
  if (redrawn.length === 0) return index;
  const numbers = new Set<number>();
  for (const widget of redrawn) {
    if (widget.objectNumber) numbers.add(widget.objectNumber);
    else if (widget.page) {
      for (const row of index.snapshot?.widgets ?? []) {
        if (row.page.objectNumber === widget.page.objectNumber) numbers.add(widgetNumber(row));
      }
    }
  }
  if (numbers.size === 0) return index;
  const pictureVersions = { ...index.pictureVersions };
  for (const number of numbers) pictureVersions[number] = (pictureVersions[number] ?? 0) + 1;
  return { ...index, pictureVersions };
}

/**
 * A merged field split as it took a second widget: its widget half moved to a new number (one
 * of the event's widgets), and the row at the field's own number is gone with it.
 */
function withoutSplitRow(index: FieldIndex, field: FormFieldDTO): FieldIndex {
  if (field.ref.kind !== 'objectNumber') return index;
  const own = field.ref.objectNumber;
  if (field.widgets.some((widget) => widget.objectNumber === own)) return index;
  const row = widgetRowOf(index, own);
  return row ? removeWidgets(index, [{ ref: row.ref, objectNumber: own, page: row.page }]) : index;
}

function foldFormFacts(index: FieldIndex, event: DocumentEvent): FieldIndex | MirrorReload {
  switch (event.type) {
    case 'forms.widgetAdded':
      return withoutSplitRow(
        upsertWidgets(upsertFields(index, [event.field]), event.widgets),
        event.field,
      );
    case 'forms.valueSet':
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
          ? reindex(created, { ...created.snapshot, formKind: 'acroform' })
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
    // A repair reports only counts; the others add or remove pages, or paint their
    // widgets into the content.
    case 'forms.repaired':
    case 'pages.deleted':
    case 'pages.inserted':
    case 'pages.restored':
    case 'pages.flattened':
    case 'annotations.flattened':
    case 'redaction.applied':
      return reload();
    default:
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

/** The index with the calculation order a write answered, when the write changed it. */
export function withCalculationOrder(
  index: FieldIndex,
  order: readonly (FormFieldRef | null)[] | undefined,
): FieldIndex {
  if (!order || !index.snapshot) return index;
  return reindex(index, { ...index.snapshot, calculationOrder: [...order] });
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

/** A widget a page shows: its address, the appearance state it shows, and how new its look is. */
export interface ShownWidget {
  readonly ref: AnnotationRef;
  /** Where it stands on its page, in page space: its picture's box, and the painter's. */
  readonly rect: Box;
  /** The state it shows (`/AS`), or `null` for a widget without states. */
  readonly appearanceState: string | null;
  /**
   * Its look in the view isn't its confirmed look yet (a value, a restyle, a
   * new field): its picture shows something older, so the painter draws it.
   */
  readonly pending: boolean;
  /** Its confirmed picture version: a picture drawn at another one shows another look. */
  readonly pictureVersion: number;
}

/** How new a shown widget's look is: whether it's pending, and its confirmed picture version. */
export type WidgetLookOf = (
  row: WidgetAnnotation,
) => Pick<ShownWidget, 'pending' | 'pictureVersion'>;

const AT_REST: ReturnType<WidgetLookOf> = { pending: false, pictureVersion: 0 };

/** The widgets one page shows, in the order the page draws them. */
export function shownWidgetsOf(
  index: FieldIndex,
  pageObjectNumber: number,
  lookOf: WidgetLookOf = () => AT_REST,
): ShownWidget[] {
  const shown: ShownWidget[] = [];
  for (const row of index.snapshot?.widgets ?? []) {
    if (row.page.objectNumber !== pageObjectNumber || !shownOnScreen(row)) continue;
    shown.push({
      ref: row.ref,
      rect: row.rect,
      appearanceState: row.appearanceState,
      ...lookOf(row),
    });
  }
  return shown;
}

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

/** The box the cursor is in: its field and its annotation object number. */
export interface FocusedWidget {
  readonly field: FieldKey;
  readonly widget: number;
}

/** The plugin's session state: the box the cursor is in; a write in flight shows in the mirror's view. */
export interface FormModel {
  readonly focused: FocusedWidget | null;
}

export const initialFormModel = (): FormModel => ({ focused: null });
