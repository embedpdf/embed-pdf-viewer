import {
  allowsCapability,
  annotationKey,
  authorizeCapability,
  fieldValueOf,
  deserializeError,
  EngineError,
  EngineErrorCode,
  draftWritesScripts,
  fieldScriptOf,
  writesScripts,
  type ChangeItem,
  type FieldActionsPatch,
  type FieldScriptEvent,
  type ChangeItemType,
  type ChangeOp,
  type FormEffect,
  type FormImportOp,
  isSkippedItem,
  type FormFieldDTO,
  type FormFieldPatch,
  type FormFieldRef,
  type FormFieldValue,
  type FormMutationMeta,
  type AnnotationRef,
  type FormWidget,
  type PdfCoordinates,
  type WidgetAnnotation,
  type WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';

import {
  objectNumberOf,
  readAnnotation,
  reordered,
  writeUpdate as writeAnnotationUpdate,
} from './annotationChanges';
import { exportAnnots, exportField, importAnnots, importField } from './captures';
import { assertExpected, leftAlone, type ChangeContext, type Done } from './changeContext';
import {
  captureAfter,
  captureBefore,
  revertObjects,
  unchangedSince,
  type PendingCapture,
} from './objectCaptures';
import { valuesEqual } from '../../../shared/valuesEqual';
import { AnnotationMutator } from '../../annotations/AnnotationMutator';
import { resolveAnnotIndexRaw } from '../../annotations/internal/identity/resolveAnnotIndexRaw';
import { applyReorder, planReorder, readPageStack } from '../../annotations/internal/stackingOrder';
import { promoteInlineAnnotations } from '../../annotations/internal/write/promoteInlineAnnotations';
import { FormImporter } from '../../forms/FormImporter';
import { FormMutator } from '../../forms/FormMutator';
import { FormsEffectsApplier } from '../../forms/FormsEffectsApplier';
import {
  orderBack,
  readCalculationOrder,
  sameOrder,
  writeCalculationOrder,
  type OrderChange,
} from '../../forms/internal/calculationOrder';
import { acquireFormModel } from '../../forms/internal/formModelCache';
import { formMutationMeta } from '../../forms/internal/formMutationMeta';
import { readFieldAt } from '../../forms/internal/readFormSnapshot';
import { resolveFieldRef } from '../../forms/internal/resolveFieldRef';
import { withWidgetRows } from '../../forms/internal/widgetRows';
import type {
  CalculationOrderStep,
  CapturedObject,
  FieldRemoveStep,
  FieldRestoreStep,
  ObjectsRevertStep,
  ReverseStep,
  RevertFallback,
  StepRights,
  WidgetDeleteStep,
  WidgetRestoreStep,
} from '../ChangeRecord';

type Op<T extends ChangeOp['type']> = Extract<
  ChangeOp<PdfCoordinates, WireAnnotationResources>,
  { type: T }
>;

/** What a value write may write in a widget: its appearance and its look. */
const WIDGET_KEYS = ['AP', 'MK'];

/** The families that hold a value: the ones a reset puts back. */
const VALUE_FAMILIES = new Set(['text', 'checkbox', 'radio', 'combobox', 'listbox']);

/** The ops that fill a form; the rest change its design. */
const FILLS: ReadonlySet<ChangeItemType> = new Set([
  'forms.setValue',
  'forms.setDisplay',
  'forms.setAppearanceText',
  'forms.reset',
  'forms.setSignatureAppearance',
]);

// ---------------------------------------------------------------------------
// Ops
// ---------------------------------------------------------------------------

/** `forms.setValue`; its reverse puts back the value, and the widgets as they were. */
export function setValue(ctx: ChangeContext, op: Op<'forms.setValue'>, opIndex: number): Done {
  authorizeCapability(ctx.authority, 'doc.forms.fill');
  const before = readField(ctx, op.field);
  assertExpected(opIndex, valueOf(before.field), op.expect);
  return writeValue(ctx, before, op.value);
}

/** `forms.setDisplay`: a script's visibility effect. */
export function setDisplay(ctx: ChangeContext, op: Op<'forms.setDisplay'>): Done {
  authorizeCapability(ctx.authority, 'doc.forms.fill');
  return writeEffect(ctx, 'forms.setDisplay', op.field, {
    kind: 'setDisplay',
    ref: op.field,
    display: op.display,
  });
}

/** `forms.setAppearanceText`: a script's formatted text, drawn without changing the value. */
export function setAppearanceText(ctx: ChangeContext, op: Op<'forms.setAppearanceText'>): Done {
  authorizeCapability(ctx.authority, 'doc.forms.fill');
  return writeEffect(ctx, 'forms.setAppearanceText', op.field, {
    kind: 'setAppearanceText',
    ref: op.field,
    text: op.text,
  });
}

/** `forms.reset`; its reverse puts back each field it changed. */
export function reset(ctx: ChangeContext, op: Op<'forms.reset'>): Done {
  authorizeCapability(ctx.authority, 'doc.forms.fill');
  const targets = op.fields
    ? op.fields.map((ref) => readField(ctx, ref))
    : allFields(ctx).filter(({ field }) => VALUE_FAMILIES.has(field.family));
  const pending = captureBefore(ctx.runtime, ctx.session, targets.flatMap(objectsOf));
  const result = new FormMutator(ctx.runtime, ctx.session).reset(
    op.fields ? [...op.fields] : undefined,
    ctx.signal,
  );
  const objects = captureAfter(ctx.runtime, ctx.session, pending);
  const changed = new Set(result.fields.map((field) => numberOf(field.ref)));
  return {
    item: { type: 'forms.reset', ...rows(ctx, result) },
    reverse: [
      {
        kind: 'objects.revert',
        reports: 'forms.reset',
        objects,
        subject: { fields: [...changed] },
        fallback: {
          kind: 'value',
          fields: targets
            .filter(({ objectNumber }) => changed.has(objectNumber))
            .map(({ objectNumber, field }) => ({
              objectNumber,
              before: valueOf(field),
              left: valueOf(result.fields.find((f) => numberOf(f.ref) === objectNumber)!),
            })),
        },
      },
    ],
  };
}

/** `forms.create`; its reverse deletes the field, when nobody changed it since. */
export function createField(ctx: ChangeContext, op: Op<'forms.create'>): Done {
  authorizeCapability(ctx.authority, 'doc.forms.modify');
  if (draftWritesScripts(op.draft)) authorizeCapability(ctx.authority, 'doc.forms.script');
  const { field, calculationOrder } = new FormMutator(ctx.runtime, ctx.session).createField(
    op.draft,
    ctx.signal,
    ctx.authority.identity,
    {
      ...(op.objectNumber !== undefined ? { objectNumber: op.objectNumber } : {}),
      ...(op.widgetObjectNumbers ? { widgetObjectNumbers: op.widgetObjectNumbers } : {}),
    },
  );
  // Its undo deletes the field, which takes it out of the calculation order too.
  return {
    item: { type: 'forms.create', ...fieldResult(ctx, field), ...orderResult(calculationOrder) },
    reverse: [{ kind: 'field.remove', objectNumber: numberOf(field.ref), left: field }],
  };
}

/**
 * `forms.update`. Its reverse puts the field and its widgets back as they
 * were; when someone changed them since (filled the field in, say), it puts
 * back each property still holding what the update set.
 */
export function updateField(ctx: ChangeContext, op: Op<'forms.update'>, opIndex: number): Done {
  authorizeCapability(ctx.authority, 'doc.forms.modify');
  if (writesScripts(op.patch.actions)) authorizeCapability(ctx.authority, 'doc.forms.script');
  const before = readField(ctx, op.field);
  assertExpected(opIndex, propertiesOf(before.field), op.expect);
  return writeUpdate(ctx, before, op.patch);
}

/** `forms.delete`; its reverse brings back the field, its widgets and the parents it pruned. */
export function deleteField(ctx: ChangeContext, op: Op<'forms.delete'>, opIndex: number): Done {
  authorizeCapability(ctx.authority, 'doc.forms.modify');
  const before = readField(ctx, op.field);
  assertExpected(opIndex, before.field, op.expect);
  return writeDelete(ctx, before);
}

/**
 * `forms.addWidget`. Its reverse puts back the field and the pages the widget
 * went onto, which leaves the new widget (and a merged field's split one)
 * reaching nothing.
 */
export function addWidget(ctx: ChangeContext, op: Op<'forms.addWidget'>): Done {
  authorizeCapability(ctx.authority, 'doc.forms.modify');
  if (writesScripts(op.placement.actions)) authorizeCapability(ctx.authority, 'doc.forms.script');
  const before = readField(ctx, op.field);
  const pages = new Set([op.placement.page.objectNumber]);
  for (const widget of before.field.widgets) {
    if (widget.objectNumber === before.objectNumber && widget.page) {
      pages.add(widget.page.objectNumber);
    }
  }
  const pending = captureBefore(ctx.runtime, ctx.session, [
    ...objectsOf(before),
    ...[...pages].map((page) => ({ objectNumber: page, deep: [] })),
  ]);
  const { field, widget } = new FormMutator(ctx.runtime, ctx.session).addWidget(
    op.field,
    op.placement,
    ctx.signal,
    {
      ...(op.objectNumber !== undefined ? { objectNumber: op.objectNumber } : {}),
      ...(op.splitObjectNumber !== undefined ? { splitObjectNumber: op.splitObjectNumber } : {}),
    },
  );
  const known = new Set(before.field.widgets.map((w) => w.objectNumber));
  const made: PendingCapture[] = field.widgets
    .filter((w) => !known.has(w.objectNumber))
    .map((w) => ({ objectNumber: w.objectNumber, deep: WIDGET_KEYS, before: null }));
  const objects = captureAfter(ctx.runtime, ctx.session, [...pending, ...made]);
  return {
    item: {
      type: 'forms.addWidget',
      ...rows(ctx, {
        field,
        meta: formMutationMeta(ctx.session.writeStamp(), [field.ref], [widget]),
      }),
    },
    reverse: [revertStep('forms.removeWidget', objects, [before.objectNumber])],
  };
}

/** `forms.removeWidget`; its reverse attaches the widget again, as it was. */
export function removeWidget(ctx: ChangeContext, op: Op<'forms.removeWidget'>): Done {
  authorizeCapability(ctx.authority, 'doc.forms.modify');
  const before = readField(ctx, op.field);
  const widget = op.widget.kind === 'objectNumber' ? op.widget.objectNumber : 0;
  const pending = captureBefore(ctx.runtime, ctx.session, [
    { objectNumber: before.objectNumber, deep: [] },
    { objectNumber: widget, deep: [] },
  ]);
  const result = new FormMutator(ctx.runtime, ctx.session).detachWidget(
    op.field,
    op.widget,
    ctx.signal,
  );
  const objects = captureAfter(ctx.runtime, ctx.session, pending);
  return {
    item: {
      type: 'forms.removeWidget',
      ...rows(ctx, {
        field: result.field,
        meta: formMutationMeta(ctx.session.writeStamp(), [result.field.ref], [result.widget]),
      }),
    },
    reverse: [revertStep('forms.addWidget', objects, [before.objectNumber])],
  };
}

/**
 * `forms.deleteWidget`: the widget leaves its page, and its field when it has
 * one. Its reverse brings it back at its place and into its field.
 */
export function deleteWidget(
  ctx: ChangeContext,
  op: Op<'forms.deleteWidget'>,
  opIndex: number,
): Done {
  authorizeCapability(ctx.authority, 'doc.forms.modify');
  const current = readAnnotation(ctx, op.widget);
  if (current.subtype !== 'widget') {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `${current.subtype} is not a widget: delete it with page.annotations.delete`,
      { details: { field: 'widget' } },
    );
  }
  assertExpected(opIndex, current, op.expect);
  return writeWidgetDelete(ctx, current);
}

/**
 * Brings back a widget a delete removed (see `WidgetRestoreStep`): onto its
 * page at its place, then into its field, whose dictionary goes back as it
 * was before the widget left it.
 */
export function restoreWidget(ctx: ChangeContext, step: WidgetRestoreStep): Done {
  authorizeCapability(ctx.authority, 'doc.forms.modify');
  let pageIndex: number;
  try {
    pageIndex = ctx.session.resolvePageRef(step.page).pageIndex;
  } catch {
    return leftAlone(ctx, 'forms.restoreWidget');
  }
  if (tryWidgetRow(ctx, step.widget)) return leftAlone(ctx, 'forms.restoreWidget');
  // The widget is gone, so only its field shows whether the delete still holds.
  const fieldObjects = step.detached.filter(
    (object) => object.objectNumber === step.fieldObjectNumber,
  );
  if (!unchangedSince(ctx.runtime, ctx.session, fieldObjects)) {
    return leftAlone(ctx, 'forms.restoreWidget');
  }
  importAnnots(ctx.runtime, ctx.session.requireDocPtr(), pageIndex, step.capture);
  ctx.session.invalidateDerived();
  if (step.detached.length > 0) revertObjects(ctx.runtime, ctx.session, step.detached);
  const row = widgetRow(ctx, step.widget);
  const field =
    step.fieldObjectNumber === null ? null : readFieldByNumber(ctx, step.fieldObjectNumber).field;
  return {
    item: {
      type: 'forms.restoreWidget',
      field,
      widgets: [row],
      meta: formMutationMeta(ctx.session.writeStamp(), field ? [field.ref] : [], [
        widgetOf(ctx, step.widget),
      ]),
    },
    reverse: [{ kind: 'widget.delete', widget: step.widget, left: row }],
  };
}

/** Deletes a widget a restore brought back, when it is as the restore left it. */
export function deleteRestoredWidget(ctx: ChangeContext, step: WidgetDeleteStep): Done {
  authorizeCapability(ctx.authority, 'doc.forms.modify');
  const current = tryWidgetRow(ctx, step.widget);
  if (!current || !valuesEqual(current, step.left)) return leftAlone(ctx, 'forms.deleteWidget');
  return writeWidgetDelete(ctx, current);
}

/**
 * `forms.updateWidget`: a widget's place and look, written as an annotation
 * update writes them. Its reverse puts the widget back as it was, or by value
 * what still shows the update.
 */
export function updateWidget(
  ctx: ChangeContext,
  op: Op<'forms.updateWidget'>,
  opIndex: number,
): Done {
  authorizeCapability(ctx.authority, 'doc.forms.modify');
  if (writesScripts(op.patch.actions)) authorizeCapability(ctx.authority, 'doc.forms.script');
  const current = readAnnotation(ctx, op.widget);
  if (current.subtype !== 'widget') {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `${current.subtype} is not a widget: change it with doc.annotations.update`,
      { details: { field: 'widget' } },
    );
  }
  assertExpected(opIndex, current, op.expect);
  return writeAnnotationUpdate(
    ctx,
    op.widget,
    { ...op.patch, subtype: 'widget' },
    'forms.updateWidget',
  );
}

/**
 * `forms.reorderWidgets`: the widgets' stacking order on their page, which is
 * also their tab order where the page's `/Tabs` follows it. Its reverse puts
 * them back beside their old neighbours.
 */
/** `forms.reorderCalculations`; its reverse puts each field back beside its old neighbours. */
export function reorderCalculations(ctx: ChangeContext, op: Op<'forms.reorderCalculations'>): Done {
  authorizeCapability(ctx.authority, 'doc.forms.modify');
  const { before, after, moved } = new FormMutator(ctx.runtime, ctx.session).reorderCalculations(
    op.fields,
    op.position,
    ctx.signal,
  );
  return {
    item: calculationsItem(ctx, after, moved),
    reverse: [orderStep({ before, after })],
  };
}

/**
 * Takes back what a change did to the calculation order (see `orderBack`).
 * Left alone when nothing of it is still as the change left it.
 */
export function restoreCalculationOrder(ctx: ChangeContext, step: CalculationOrderStep): Done {
  authorizeCapability(ctx.authority, 'doc.forms.modify');
  const now = readCalculationOrder(ctx.runtime, acquireFormModel(ctx.runtime, ctx.session));
  const order = orderBack(
    now,
    step,
    (objectNumber) => tryReadFieldByNumber(ctx, objectNumber) !== null,
  );
  if (sameOrder(now, order)) return leftAlone(ctx, 'forms.reorderCalculations');
  writeCalculationOrder(ctx.runtime, ctx.session.requireDocPtr(), order);
  ctx.session.invalidateDerived();
  const moved = [...new Set([...now, ...order])].filter(
    (objectNumber) => now.indexOf(objectNumber) !== order.indexOf(objectNumber),
  );
  return {
    item: calculationsItem(ctx, order, moved),
    reverse: [orderStep({ before: now, after: order })],
  };
}

/** A calculation-order change's item: the whole new order, and the fields that moved. */
function calculationsItem(
  ctx: ChangeContext,
  order: readonly number[],
  moved: readonly number[],
): ChangeItem<PdfCoordinates> {
  return {
    type: 'forms.reorderCalculations',
    calculationOrder: order.map(fieldRefOf),
    meta: formMutationMeta(ctx.session.writeStamp(), moved.map(fieldRefOf), []),
  };
}

export function reorderWidgets(ctx: ChangeContext, op: Op<'forms.reorderWidgets'>): Done {
  authorizeCapability(ctx.authority, 'doc.forms.modify');
  const stack = readPageStack(ctx.runtime, ctx.session, op.page);
  const plan = planReorder(stack, 'widgets', op.widgets, op.position);
  applyReorder(ctx.runtime, ctx.session, plan);
  return reordered(ctx, plan, op.widgets);
}

/** `forms.setSignatureAppearance`; its reverse puts the widgets' appearances back. */
export function setSignatureAppearance(
  ctx: ChangeContext,
  op: Op<'forms.setSignatureAppearance'>,
): Done {
  authorizeCapability(ctx.authority, 'doc.forms.fill');
  const before = readField(ctx, op.field);
  return recordRevert(ctx, before, 'forms.setSignatureAppearance', () =>
    new FormMutator(ctx.runtime, ctx.session).setSignatureAppearance(
      op.field,
      op.appearance.pdf,
      ctx.signal,
    ),
  );
}

/**
 * `forms.import`: a bundle's fields, copied in (see `FormImporter.import`).
 * Its reverse deletes each field it made, the last made first, when nobody
 * changed it since; each takes its widgets and its place in the
 * calculation order with it.
 */
export function importForm(ctx: ChangeContext, op: FormImportOp): Done {
  authorizeCapability(ctx.authority, 'doc.forms.modify');
  const rights = importRights(ctx, op);
  const result = new FormImporter(ctx.runtime, ctx.session, ctx.fonts).import(
    {
      bundle: op.bundle,
      ...(op.pages !== undefined ? { pages: op.pages } : {}),
      attribution: op.attribution,
      values: op.values ?? true,
      actor: op.actor ?? {},
      limits: op.limits,
      mayScript: (op.mayScript ?? false) && allowsCapability(ctx.authority, 'doc.forms.script'),
    },
    ctx.signal,
  );
  const reverse = result.fields.map(
    (field): FieldRemoveStep => ({
      kind: 'field.remove',
      objectNumber: numberOf(field.ref),
      left: field,
      ...(rights ? { rights } : {}),
    }),
  );
  return { item: { type: 'forms.import', ...result }, reverse: reverse.reverse() };
}

/**
 * `forms.importValues`: a bundle's values, filled into the fields of the
 * same name (see `FormImporter.planValues`). Each field's reverse puts back
 * its value and who filled it, as a `setValue`'s does.
 */
export function importFormValues(ctx: ChangeContext, op: FormImportOp): Done {
  authorizeCapability(ctx.authority, 'doc.forms.fill');
  const rights = importRights(ctx, op);
  const importer = new FormImporter(ctx.runtime, ctx.session, ctx.fonts);
  const plan = importer.planValues(op.bundle, op.limits, ctx.signal);
  const fields: FormFieldDTO<PdfCoordinates>[] = [];
  const reverse: ReverseStep[] = [];
  for (const write of plan.writes) {
    const before = { objectNumber: numberOf(write.target.ref), field: write.target };
    const pending = captureBefore(ctx.runtime, ctx.session, objectsOf(before));
    const field = importer.writeValue(write, op.bundle, op.attribution, op.actor ?? {}, ctx.signal);
    const objects = captureAfter(ctx.runtime, ctx.session, pending);
    fields.push(field);
    reverse.push({
      ...revertStep('forms.setValue', objects, [before.objectNumber]),
      fallback: {
        kind: 'value',
        fields: [
          {
            objectNumber: before.objectNumber,
            before: valueOf(write.target),
            left: valueOf(field),
          },
        ],
      },
      ...(rights ? { rights } : {}),
    });
  }
  return {
    item: {
      type: 'forms.importValues',
      ...rows(ctx, {
        fields,
        dropped: [...plan.dropped],
        meta: formMutationMeta(
          ctx.session.writeStamp(),
          fields.map((field) => field.ref),
          fields.flatMap((field) => field.widgets as FormWidget[]),
        ),
      }),
    },
    reverse: reverse.reverse(),
  };
}

/**
 * A restoring import's rights, checked: `doc.forms.import`, which its undo
 * and redo take too (see `StepRights`). A stamping import takes none.
 */
function importRights(ctx: ChangeContext, op: FormImportOp): StepRights | undefined {
  if (op.attribution !== 'restore') return undefined;
  authorizeCapability(ctx.authority, 'doc.forms.import');
  return 'import';
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/**
 * Undoes a form write: the dictionaries back as they were, when each still
 * reads as the write left it. When one doesn't, a value write puts back each
 * field still showing the value it set; any other write is left alone.
 */
export function revertForm(
  ctx: ChangeContext,
  step: ObjectsRevertStep & { subject: { fields: readonly number[] } },
): Done {
  authorizeCapability(
    ctx.authority,
    FILLS.has(step.reports) ? 'doc.forms.fill' : 'doc.forms.modify',
  );
  if (step.rights) authorizeCapability(ctx.authority, 'doc.forms.import');
  if (unchangedSince(ctx.runtime, ctx.session, step.objects)) {
    const redo = revertObjects(ctx.runtime, ctx.session, step.objects);
    const fields = step.subject.fields.map(
      (objectNumber) => readFieldByNumber(ctx, objectNumber).field,
    );
    return {
      item: formItem(ctx, step.reports, fields),
      reverse: [{ ...step, objects: redo, ...swapFallback(step.fallback) }],
    };
  }
  if (step.fallback?.kind === 'properties') return revertProperties(ctx, step.fallback);
  if (step.fallback?.kind !== 'value') return leftAlone(ctx, step.reports);
  const written: Done[] = [];
  const skipped: string[] = [];
  for (const { objectNumber, before, left } of step.fallback.fields) {
    const current = tryReadFieldByNumber(ctx, objectNumber);
    if (current && valuesEqual(valueOf(current.field), left)) {
      written.push(writeValue(ctx, current, before));
    } else if (current) {
      skipped.push(current.field.name);
    }
  }
  if (written.length === 0) return leftAlone(ctx, step.reports);
  if (step.reports === 'forms.setValue' && written.length === 1) return written[0]!;
  const fields = written.map(({ item }) => (item as { field: FormFieldDTO<PdfCoordinates> }).field);
  return {
    item: { ...resetResult(ctx, fields), ...(skipped.length > 0 ? { skipped } : {}) },
    reverse: written.flatMap((done) => done.reverse),
  };
}

/**
 * The second chance of a field update's undo: each property that still holds
 * what the update set goes back, through an ordinary update. A rename goes
 * back only while no sibling has taken the old name.
 */
function revertProperties(
  ctx: ChangeContext,
  fallback: Extract<RevertFallback, { kind: 'properties' }>,
): Done {
  const current = tryReadFieldByNumber(ctx, fallback.objectNumber);
  if (!current) return leftAlone(ctx, 'forms.update');
  const now = propertiesOf(current.field) as Record<string, unknown>;
  const left = fallback.left as Record<string, unknown>;
  const restore = fallback.restore as Record<string, unknown>;
  const keys = Object.keys(left);
  const kept = keys.filter(
    (key) =>
      valuesEqual(now[key], left[key]) &&
      (key !== 'name' || nameIsFree(ctx, current.field.name, String(restore.name))),
  );
  if (kept.length === 0) return leftAlone(ctx, 'forms.update');
  const done = writeUpdate(ctx, current, pick(restore, kept) as FormFieldPatch);
  const skipped = keys.filter((key) => !kept.includes(key));
  const item = done.item;
  if (skipped.length === 0 || isSkippedItem(item) || item.type !== 'forms.update') return done;
  return { ...done, item: { ...item, skipped } };
}

/** Whether the field `fullName` could be renamed to `segment`: no sibling holds that name. */
function nameIsFree(ctx: ChangeContext, fullName: string, segment: string): boolean {
  const parent = fullName.slice(0, fullName.lastIndexOf('.') + 1);
  return tryReadField(ctx, { kind: 'fqn', name: parent + segment }) === null;
}

/** Deletes a field a create or an import made, when nobody changed it since. */
export function removeField(ctx: ChangeContext, step: FieldRemoveStep): Done {
  authorizeCapability(ctx.authority, 'doc.forms.modify');
  if (step.rights) authorizeCapability(ctx.authority, 'doc.forms.import');
  const current = tryReadFieldByNumber(ctx, step.objectNumber);
  if (!current || !valuesEqual(current.field, step.left)) return leftAlone(ctx, 'forms.delete');
  return writeDelete(ctx, current, step.rights);
}

/**
 * Brings back a field a delete removed. Left alone when another field took its
 * name, or a page its widgets were on is gone.
 */
export function restoreField(ctx: ChangeContext, step: FieldRestoreStep): Done {
  authorizeCapability(ctx.authority, 'doc.forms.modify');
  if (step.rights) authorizeCapability(ctx.authority, 'doc.forms.import');
  if (tryReadField(ctx, { kind: 'fqn', name: step.name })) return leftAlone(ctx, 'forms.restore');
  for (const page of step.pages) {
    try {
      ctx.session.resolvePageRef(page);
    } catch {
      return leftAlone(ctx, 'forms.restore');
    }
  }
  importField(ctx.runtime, ctx.session.requireDocPtr(), step.capture);
  ctx.session.invalidateDerived();
  const { field } = readFieldByNumber(ctx, step.objectNumber);
  return {
    item: { type: 'forms.restore', ...fieldResult(ctx, field) },
    reverse: [
      {
        kind: 'field.remove',
        objectNumber: step.objectNumber,
        left: field,
        ...(step.rights ? { rights: step.rights } : {}),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Writes, each recording its reverse
// ---------------------------------------------------------------------------

/**
 * A widget's delete: out of its field (the field's dictionary and the
 * widget's captured around it), then off its page (the widget captured as it
 * is there), recording the restore.
 */
function writeWidgetDelete(ctx: ChangeContext, widget: WidgetAnnotation<PdfCoordinates>): Done {
  const ref = widget.ref;
  // Captures go by object number: a widget born inline gets one first.
  promoteInlineAnnotations(ctx.runtime, ctx.session, ref.page.objectNumber);
  const widgetNumber = objectNumberOf(ctx, ref);
  const owner = widget.field ? readField(ctx, widget.field) : null;
  if (owner && owner.objectNumber === widgetNumber) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `widget ${widgetNumber} is its field's own dictionary (a merged field/widget) - delete the field with doc.forms.delete`,
      { details: { field: 'widget' } },
    );
  }

  let detached: CapturedObject[] = [];
  if (owner) {
    const pending = captureBefore(ctx.runtime, ctx.session, [
      { objectNumber: owner.objectNumber, deep: [] },
      { objectNumber: widgetNumber, deep: [] },
    ]);
    new FormMutator(ctx.runtime, ctx.session).detachWidget(
      { kind: 'objectNumber', objectNumber: owner.objectNumber },
      ref,
      ctx.signal,
    );
    detached = captureAfter(ctx.runtime, ctx.session, pending);
  }

  const { pageIndex, index } = resolveAnnotIndexRaw(ctx.runtime, ctx.session, ref);
  const capture = exportAnnots(ctx.runtime, ctx.session.requireDocPtr(), pageIndex, [index]);
  new AnnotationMutator(ctx.runtime, ctx.session, ctx.fonts).deleteReleasedWidget(ref, 0);
  ctx.session.invalidateDerived();

  const field = owner ? readFieldByNumber(ctx, owner.objectNumber).field : null;
  return {
    item: {
      type: 'forms.deleteWidget',
      widget: ref,
      page: ref.page,
      field,
      meta: formMutationMeta(ctx.session.writeStamp(), field ? [field.ref] : [], [
        { ref, objectNumber: widgetNumber, page: ref.page },
      ]),
    },
    reverse: [
      {
        kind: 'widget.restore',
        page: ref.page,
        widget: ref,
        capture,
        fieldObjectNumber: owner?.objectNumber ?? null,
        detached,
      },
    ],
  };
}

/** A value write to the field `before` reads, recording what it writes. */
function writeValue(ctx: ChangeContext, before: ReadField, value: FormFieldValue): Done {
  const ref: FormFieldRef = { kind: 'objectNumber', objectNumber: before.objectNumber };
  const pending = captureBefore(ctx.runtime, ctx.session, objectsOf(before));
  const result = new FormMutator(ctx.runtime, ctx.session).setValue(
    ref,
    value,
    ctx.signal,
    ctx.authority.identity,
  );
  const objects = captureAfter(ctx.runtime, ctx.session, pending);
  return {
    item: { type: 'forms.setValue', ...rows(ctx, result) },
    reverse: [
      {
        ...revertStep('forms.setValue', objects, [before.objectNumber]),
        fallback: {
          kind: 'value',
          fields: [
            {
              objectNumber: before.objectNumber,
              before: valueOf(before.field),
              left: valueOf(result.field),
            },
          ],
        },
      },
    ],
  };
}

/** A script effect on one field, as one write: refused whole when the effect is. */
function writeEffect(
  ctx: ChangeContext,
  type: 'forms.setDisplay' | 'forms.setAppearanceText',
  ref: FormFieldRef,
  effect: FormEffect,
): Done {
  const before = readField(ctx, ref);
  return recordRevert(ctx, before, type, () => {
    const { result } = new FormsEffectsApplier(
      ctx.runtime,
      ctx.session,
      ctx.authority.identity,
    ).apply([effect], ctx.signal);
    const outcome = result.results[0]!;
    if (outcome.status !== 'applied' && outcome.status !== 'unchanged') {
      if (outcome.error) throw deserializeError(outcome.error);
      throw new Error(`a form effect was ${outcome.status}`);
    }
    return { field: readFieldByNumber(ctx, before.objectNumber).field };
  });
}

/**
 * An update of the field `before` reads, recording the dictionaries it writes
 * and the properties it changes: their old values, and the values it left.
 */
function writeUpdate(ctx: ChangeContext, before: ReadField, patch: FormFieldPatch): Done {
  const ref: FormFieldRef = { kind: 'objectNumber', objectNumber: before.objectNumber };
  let order = null as OrderChange | null;
  const done = recordRevert(
    ctx,
    before,
    'forms.update',
    () => {
      const updated = new FormMutator(ctx.runtime, ctx.session).updateField(ref, patch, ctx.signal);
      order = updated.calculationOrder;
      return updated;
    },
    (after) => {
      const was = propertiesOf(before.field) as Record<string, unknown>;
      const is = propertiesOf(after) as Record<string, unknown>;
      const keys = Object.keys(patch).filter(
        (key) => key !== 'family' && !valuesEqual(was[key], is[key]),
      );
      return {
        kind: 'properties',
        objectNumber: before.objectNumber,
        restore: pick(was, keys) as FormFieldPatch,
        left: pick(is, keys) as FormFieldPatch,
      };
    },
  );
  return withOrderChange(ctx, done, order);
}

/**
 * `done` with what its write did to the calculation order, when it changed
 * it: the new order on its item, and the step that takes the change back
 * after the others.
 */
function withOrderChange(ctx: ChangeContext, done: Done, order: OrderChange | null): Done {
  if (!order || isSkippedItem(done.item)) return done;
  return {
    item: { ...done.item, ...orderResult(order) } as ChangeItem<PdfCoordinates>,
    reverse: [...done.reverse, orderStep(order)],
  };
}

/** The new calculation order a write's result carries, when the write changed it. */
function orderResult(order: OrderChange | null): { calculationOrder?: FormFieldRef[] } {
  return order ? { calculationOrder: order.after.map(fieldRefOf) } : {};
}

function orderStep({ before, after }: OrderChange): CalculationOrderStep {
  return { kind: 'calculations.restore', before, after };
}

function fieldRefOf(objectNumber: number): FormFieldRef {
  return { kind: 'objectNumber', objectNumber };
}

/**
 * Runs `write` on the field `before` reads, recording the dictionaries it
 * writes, and, from the field as `write` left it, the fallback its undo puts
 * back by value.
 */
function recordRevert(
  ctx: ChangeContext,
  before: ReadField,
  type: ChangeItemType,
  write: () => { field: FormFieldDTO<PdfCoordinates> },
  fallbackOf?: (after: FormFieldDTO<PdfCoordinates>) => RevertFallback,
): Done {
  const pending = captureBefore(ctx.runtime, ctx.session, objectsOf(before));
  const { field } = write();
  const objects = captureAfter(ctx.runtime, ctx.session, pending);
  const step = revertStep(type, objects, [before.objectNumber]);
  return {
    item: formItem(ctx, type, [field]),
    reverse: [fallbackOf ? { ...step, fallback: fallbackOf(field) } : step],
  };
}

/**
 * A delete of the field `before` reads, capturing it first. Its restore
 * takes `rights` too.
 */
function writeDelete(ctx: ChangeContext, before: ReadField, rights?: StepRights): Done {
  const capture = exportField(ctx.runtime, ctx.session.requireDocPtr(), before.objectNumber);
  const ref: FormFieldRef = { kind: 'objectNumber', objectNumber: before.objectNumber };
  const { deleted, removedWidgets, calculationOrder } = new FormMutator(
    ctx.runtime,
    ctx.session,
  ).deleteField(ref, ctx.signal);
  // Its undo brings the field back first, then into the calculation order.
  return withOrderChange(
    ctx,
    {
      item: {
        type: 'forms.delete',
        meta: formMutationMeta(ctx.session.writeStamp(), [deleted], removedWidgets),
      },
      reverse: [
        {
          kind: 'field.restore',
          objectNumber: before.objectNumber,
          name: before.field.name,
          pages: before.field.widgets.flatMap((widget) => (widget.page ? [widget.page] : [])),
          capture,
          ...(rights ? { rights } : {}),
        },
      ],
    },
    calculationOrder,
  );
}

function revertStep(
  reports: ChangeItemType,
  objects: readonly CapturedObject[],
  fields: readonly number[],
): ObjectsRevertStep {
  return { kind: 'objects.revert', reports, objects, subject: { fields } };
}

/** A revert's fallback the other way round: what its redo puts back. */
function swapFallback(fallback: RevertFallback | undefined): Pick<ObjectsRevertStep, 'fallback'> {
  switch (fallback?.kind) {
    case 'value':
      return {
        fallback: {
          kind: 'value',
          fields: fallback.fields.map(({ objectNumber, before, left }) => ({
            objectNumber,
            before: left,
            left: before,
          })),
        },
      };
    case 'properties':
      return { fallback: { ...fallback, restore: fallback.left, left: fallback.restore } };
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Reads and items
// ---------------------------------------------------------------------------

interface ReadField {
  readonly objectNumber: number;
  readonly field: FormFieldDTO<PdfCoordinates>;
}

function readField(ctx: ChangeContext, ref: FormFieldRef): ReadField {
  const model = acquireFormModel(ctx.runtime, ctx.session);
  const resolved = resolveFieldRef(ctx.runtime, model, ref);
  const field = readFieldAt(ctx.runtime, model, resolved.fieldIndex, ctx.session.requireDocPtr());
  return { objectNumber: resolved.fieldObjectNumber, field };
}

/** A widget's row as the form reads it now. */
function widgetRow(ctx: ChangeContext, ref: AnnotationRef): WidgetAnnotation<PdfCoordinates> {
  const row = readAnnotation(ctx, ref);
  if (row.subtype !== 'widget') throw new Error(`${annotationKey(ref)} reads as no widget`);
  return row;
}

/** The same, or null when the widget isn't on its page. */
function tryWidgetRow(
  ctx: ChangeContext,
  ref: AnnotationRef,
): WidgetAnnotation<PdfCoordinates> | null {
  try {
    const row = readAnnotation(ctx, ref);
    return row.subtype === 'widget' ? row : null;
  } catch (error) {
    if (EngineError.is(error)) return null;
    throw error;
  }
}

/** A widget as a form result names it. */
function widgetOf(ctx: ChangeContext, ref: AnnotationRef): FormWidget {
  return { ref, objectNumber: objectNumberOf(ctx, ref), page: ref.page };
}

function readFieldByNumber(ctx: ChangeContext, objectNumber: number): ReadField {
  return readField(ctx, { kind: 'objectNumber', objectNumber });
}

function tryReadField(ctx: ChangeContext, ref: FormFieldRef): ReadField | null {
  try {
    return readField(ctx, ref);
  } catch {
    return null;
  }
}

function tryReadFieldByNumber(ctx: ChangeContext, objectNumber: number): ReadField | null {
  return tryReadField(ctx, { kind: 'objectNumber', objectNumber });
}

/** Every field of the form. */
function allFields(ctx: ChangeContext): ReadField[] {
  const model = acquireFormModel(ctx.runtime, ctx.session);
  const count = ctx.runtime.fn.EPDFForm_CountFields(model);
  const fields: ReadField[] = [];
  for (let index = 0; index < count; index++) {
    const field = readFieldAt(ctx.runtime, model, index, ctx.session.requireDocPtr());
    if (field.ref.kind === 'objectNumber')
      fields.push({ objectNumber: field.ref.objectNumber, field });
  }
  return fields;
}

/** The dictionaries a field write may change: the field and each widget, with their appearances. */
function objectsOf({ objectNumber, field }: ReadField) {
  return [
    { objectNumber, deep: WIDGET_KEYS },
    ...field.widgets.map((widget) => ({ objectNumber: widget.objectNumber, deep: WIDGET_KEYS })),
  ];
}

function numberOf(ref: FormFieldRef): number {
  return ref.kind === 'objectNumber' ? ref.objectNumber : 0;
}

/**
 * The properties a field has, in the shape `forms.update` takes them: its own
 * name segment (not the full name), a default that isn't there as null,
 * options as label and value. A field update's `expect` and its undo compare
 * these.
 */
function propertiesOf(field: FormFieldDTO<PdfCoordinates>): FormFieldPatch {
  const base = {
    name: field.name.slice(field.name.lastIndexOf('.') + 1),
    readOnly: field.readOnly,
    required: field.required,
    noExport: field.noExport,
    alternateName: field.alternateName,
    mappingName: field.mappingName,
    actions: scriptsOf(field),
  };
  const hasDefault = field.defaultValueEntry.kind !== 'none';
  const options = (list: readonly { label: string; value: string }[]) =>
    list.map(({ label, value }) => ({ label, value }));
  switch (field.family) {
    case 'text':
      return {
        ...base,
        defaultValue: hasDefault ? field.defaultValue : null,
        maxLength: field.maxLength,
        multiline: field.multiline,
        password: field.password,
        comb: field.comb,
      };
    case 'radio':
      return {
        ...base,
        radiosInUnison: field.radiosInUnison,
        noToggleToOff: field.noToggleToOff,
      };
    case 'combobox':
      return {
        ...base,
        edit: field.edit,
        defaultValue: hasDefault ? field.defaultValue : null,
        options: options(field.options),
      };
    case 'listbox':
      return {
        ...base,
        multiSelect: field.multiSelect,
        defaultValue: hasDefault ? field.defaultValue : null,
        options: options(field.options),
      };
    default:
      return base;
  }
}

/**
 * A field's scripts as a patch writes them: `null` for an event without
 * one. An event whose actions a write can't make (not JavaScript all
 * through) is left out, so putting the patch back never removes it.
 */
function scriptsOf(field: FormFieldDTO<PdfCoordinates>): FieldActionsPatch {
  const scripts: FieldActionsPatch = {};
  for (const event of ['keystroke', 'format', 'validate', 'calculate'] as FieldScriptEvent[]) {
    const tree = field.actions?.[event];
    if (!tree) {
      scripts[event] = null;
      continue;
    }
    const script = fieldScriptOf(tree);
    if (script) scripts[event] = script;
  }
  return scripts;
}

function pick(values: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, values[key]]));
}

/** The value a field holds, in the shape a value write takes. */
function valueOf(field: FormFieldDTO<PdfCoordinates>): FormFieldValue {
  return fieldValueOf(field) ?? { value: null };
}

function fieldResult(ctx: ChangeContext, field: FormFieldDTO<PdfCoordinates>) {
  return rows(ctx, {
    field,
    meta: formMutationMeta(ctx.session.writeStamp(), [field.ref], field.widgets as FormWidget[]),
  });
}

/** `result` with the rows of the widgets it changed, read now. */
function rows<T extends { meta: FormMutationMeta }>(ctx: ChangeContext, result: T) {
  return withWidgetRows(ctx.runtime, ctx.session, result, ctx.fonts);
}

/** A reset's item: the fields it wrote, read back. */
function resetResult(
  ctx: ChangeContext,
  fields: readonly FormFieldDTO<PdfCoordinates>[],
): Extract<ChangeItem<PdfCoordinates>, { type: 'forms.reset' }> {
  return {
    type: 'forms.reset',
    ...rows(ctx, {
      fields: [...fields],
      meta: formMutationMeta(
        ctx.session.writeStamp(),
        fields.map((field) => field.ref),
        fields.flatMap((field) => field.widgets as FormWidget[]),
      ),
    }),
  };
}

/** The item a form write reports, with the fields read back. */
function formItem(
  ctx: ChangeContext,
  type: ChangeItemType,
  fields: readonly FormFieldDTO<PdfCoordinates>[],
): ChangeItem<PdfCoordinates> {
  if (type === 'forms.reset') return resetResult(ctx, fields);
  const field = fields[0]!;
  return { type, ...fieldResult(ctx, field) } as ChangeItem<PdfCoordinates>;
}
