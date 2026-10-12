/**
 * What this session asked for and the engine hasn't answered, on top of the
 * form: `predictFormOp`, the fields mirror's `predict` (the view replays it
 * op by op), and `undoLookOf`, what undoing a change looks like. Both follow
 * the engine's own rules (engine-core's form prediction helpers). Pure.
 */
import type { PredictedOp } from '@embedpdf/core';
import {
  annotationKey,
  fieldAfterReset,
  fieldAfterValue,
  formFieldAfter,
  formFieldOfDraft,
  reorderedList,
  widgetAfterPatch,
  widgetsAfterDisplay,
  type AnnotationRef,
  type FieldWithWidgets,
  type FormFieldDTO,
  type FormFieldRef,
  type FormWidget,
  type WidgetAnnotation,
} from '@embedpdf/engine-core/runtime';

import {
  fieldByKey,
  fieldByRef,
  fieldForWidget,
  fieldKeyOf,
  fieldKeyOfRef,
  indexFields,
  removeField,
  removeWidgets,
  reorderWidgetRows,
  upsertFields,
  upsertWidgets,
  widgetRowOf,
  withCalculationOrder,
  type FieldIndex,
  type FieldKey,
} from '../model';

const widgetNumber = (widget: WidgetAnnotation): number =>
  widget.ref.kind === 'objectNumber' ? widget.ref.objectNumber : 0;

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
 * `widgetsAfterDisplay`, `formFieldOfDraft`, `formFieldAfter`,
 * `widgetAfterPatch`): what the fields and their widgets hold after it. An op
 * the engine would refuse shows nothing; its refusal takes the change away.
 * A create shows once it names its numbers; taking a widget out of its field
 * shows once the engine answers.
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
      case 'forms.create':
        return createdField(index, op);
      case 'forms.update': {
        const field = fieldByRef(index, op.field);
        return field
          ? withFields(index, [formFieldAfter(withRows(index, field), op.patch)])
          : index;
      }
      case 'forms.delete': {
        const field = fieldByRef(index, op.field);
        if (!field || !index.snapshot) return index;
        const gone = removeWidgets(removeField(index, field.ref), field.widgets);
        return withCalculationOrder(
          gone,
          index.snapshot.calculationOrder.filter((ref) => !sameField(ref, field.ref)),
        );
      }
      case 'forms.updateWidget': {
        const row = rowOfRef(index, op.widget);
        return row ? upsertWidgets(index, [widgetAfterPatch(row, op.patch)]) : index;
      }
      case 'forms.deleteWidget': {
        const row = rowOfRef(index, op.widget);
        if (!row) return index;
        const number = widgetNumber(row);
        const field = fieldForWidget(index, number);
        const gone = removeWidgets(index, [{ objectNumber: number, page: row.page } as FormWidget]);
        if (!field) return gone;
        const widgets = field.widgets.filter((widget) => widget.objectNumber !== number);
        return upsertFields(gone, [{ ...field, widgets } as FormFieldDTO]);
      }
      case 'forms.reorderWidgets': {
        if (!index.snapshot) return index;
        const onPage = index.snapshot.widgets
          .filter((row) => row.page.objectNumber === op.page.objectNumber)
          .map((row) => row.ref);
        const order = reorderedList(onPage, op.widgets, op.position, annotationKey);
        return reorderWidgetRows(index, op.page, order);
      }
      case 'forms.reorderCalculations': {
        if (!index.snapshot) return index;
        const order = index.snapshot.calculationOrder.filter(
          (ref): ref is FormFieldRef => ref !== null,
        );
        return withCalculationOrder(
          index,
          reorderedList(order, op.fields, op.position, fieldKeyOfRef),
        );
      }
      default:
        return index;
    }
  } catch {
    return index;
  }
}

/** A widget's row, by its annotation ref. */
const rowOfRef = (index: FieldIndex, ref: AnnotationRef): WidgetAnnotation | null =>
  ref.kind === 'objectNumber' ? widgetRowOf(index, ref.objectNumber) : null;

const sameField = (left: FormFieldRef | null, right: FormFieldRef): boolean =>
  left !== null && fieldKeyOfRef(left) === fieldKeyOfRef(right);

/**
 * `forms.create`, once it names the numbers it takes: the field and its
 * widgets as a read of them returns them, last in the form, and last in the
 * calculation order when it calculates.
 */
function createdField(
  index: FieldIndex,
  op: Extract<PredictedOp, { type: 'forms.create' }>,
): FieldIndex {
  const placements = op.draft.widgets ?? [];
  const numbers = op.widgetObjectNumbers ?? [];
  if (op.objectNumber === undefined || numbers.length !== placements.length) return index;
  const snapshot = index.snapshot;
  if (!snapshot || fieldByRef(index, { kind: 'objectNumber', objectNumber: op.objectNumber })) {
    return index;
  }
  const created = formFieldOfDraft(op.draft, {
    objectNumber: op.objectNumber,
    widgets: placements.map((placement, at) => ({
      kind: 'objectNumber' as const,
      page: placement.page,
      objectNumber: numbers[at]!,
    })),
  });
  // The first field of a document without a form creates its /AcroForm.
  const formed =
    snapshot.formKind === 'none'
      ? indexFields({ ...snapshot, formKind: 'acroform' }, index.pictureVersions)
      : index;
  const next = withFields(formed, [created]);
  return op.draft.actions?.calculate
    ? withCalculationOrder(next, [...snapshot.calculationOrder, created.field.ref])
    : next;
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

/** A field and its widgets back as `index` holds them. */
const restoreOf = (index: FieldIndex, field: FormFieldDTO): PredictedOp => ({
  type: 'forms.restore',
  field,
  widgets: rowsOfField(index, field),
});

/** A widget's row back as `index` holds it, with its field as it is there. */
const restoreWidgetOf = (index: FieldIndex, row: WidgetAnnotation): PredictedOp => ({
  type: 'forms.restoreWidget',
  widget: row,
  field: fieldForWidget(index, widgetNumber(row)),
});

/** What undoing one op looks like, over the form it applies to. */
function undoOfOp(index: FieldIndex, op: PredictedOp): PredictedOp[] {
  switch (op.type) {
    case 'forms.create':
      return op.objectNumber === undefined
        ? []
        : [
            {
              type: 'forms.delete',
              field: { kind: 'objectNumber', objectNumber: op.objectNumber },
            },
          ];
    case 'forms.update':
    case 'forms.delete': {
      const field = fieldByRef(index, op.field);
      return field ? [restoreOf(index, field)] : [];
    }
    case 'forms.updateWidget':
    case 'forms.deleteWidget': {
      const row = rowOfRef(index, op.widget);
      return row ? [restoreWidgetOf(index, row)] : [];
    }
    case 'forms.removeWidget': {
      const field = fieldByRef(index, op.field);
      const row = rowOfRef(index, op.widget);
      return [
        ...(row ? [restoreWidgetOf(index, row)] : []),
        ...(field ? [restoreOf(index, field)] : []),
      ];
    }
    case 'forms.reorderWidgets': {
      // The page's whole order as it was.
      const widgets = (index.snapshot?.widgets ?? [])
        .filter((row) => row.page.objectNumber === op.page.objectNumber)
        .map((row) => row.ref);
      return [{ type: 'forms.reorderWidgets', page: op.page, widgets, position: 'start' }];
    }
    case 'forms.reorderCalculations': {
      const fields = (index.snapshot?.calculationOrder ?? []).filter(
        (ref): ref is FormFieldRef => ref !== null,
      );
      return [{ type: 'forms.reorderCalculations', fields, position: 'start' }];
    }
    default:
      return fieldsNamedBy(index, [op]).map((field) => restoreOf(index, field));
  }
}

/**
 * What undoing `ops` looks like, read off the form they apply to, each over
 * what the ones before it left: the ops that bring the form back, the last
 * op's first. Drawing only: the engine undoes a change by its own record of
 * it.
 */
export function undoLookOf(before: FieldIndex, ops: readonly PredictedOp[]): PredictedOp[] {
  const undo: PredictedOp[][] = [];
  let current = before;
  for (const op of ops) {
    undo.push(undoOfOp(current, op));
    current = predictFormOp(current, op);
  }
  return undo.reverse().flat();
}
