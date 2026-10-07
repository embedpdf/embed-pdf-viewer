import {
  authorizeCapability,
  deserializeError,
  type ChangeItem,
  type ChangeItemType,
  type ChangeOp,
  type FormEffect,
  isSkippedItem,
  type FormFieldDTO,
  type FormFieldPatch,
  type FormFieldRef,
  type FormFieldValue,
  type FormWidget,
  type PdfCoordinates,
  type WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';

import { exportField, importField } from './captures';
import { assertExpected, leftAlone, type ChangeContext, type Done } from './changeContext';
import {
  captureAfter,
  captureBefore,
  revertObjects,
  unchangedSince,
  type PendingCapture,
} from './objectCaptures';
import { valuesEqual } from '../../../shared/valuesEqual';
import { FormMutator } from '../../forms/FormMutator';
import { FormsEffectsApplier } from '../../forms/FormsEffectsApplier';
import { acquireFormModel } from '../../forms/internal/formModelCache';
import { formMutationMeta } from '../../forms/internal/formMutationMeta';
import { readFieldAt } from '../../forms/internal/readFormSnapshot';
import { resolveFieldRef } from '../../forms/internal/resolveFieldRef';
import type {
  CapturedObject,
  FieldRemoveStep,
  FieldRestoreStep,
  ObjectsRevertStep,
  RevertFallback,
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
    item: { type: 'forms.reset', ...result },
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
  const { field } = new FormMutator(ctx.runtime, ctx.session).createField(op.draft, ctx.signal, {
    ...(op.objectNumber !== undefined ? { objectNumber: op.objectNumber } : {}),
    ...(op.widgetObjectNumbers ? { widgetObjectNumbers: op.widgetObjectNumbers } : {}),
  });
  return {
    item: { type: 'forms.create', ...fieldResult(ctx, field) },
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
      field,
      meta: formMutationMeta(ctx.session.writeStamp(), [field.ref], [widget]),
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
      field: result.field,
      meta: formMutationMeta(ctx.session.writeStamp(), [result.field.ref], [result.widget]),
    },
    reverse: [revertStep('forms.addWidget', objects, [before.objectNumber])],
  };
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

/** Deletes a field a create made, when nobody changed it since. */
export function removeField(ctx: ChangeContext, step: FieldRemoveStep): Done {
  authorizeCapability(ctx.authority, 'doc.forms.modify');
  const current = tryReadFieldByNumber(ctx, step.objectNumber);
  if (!current || !valuesEqual(current.field, step.left)) return leftAlone(ctx, 'forms.delete');
  return writeDelete(ctx, current);
}

/**
 * Brings back a field a delete removed. Left alone when another field took its
 * name, or a page its widgets were on is gone.
 */
export function restoreField(ctx: ChangeContext, step: FieldRestoreStep): Done {
  authorizeCapability(ctx.authority, 'doc.forms.modify');
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
    reverse: [{ kind: 'field.remove', objectNumber: step.objectNumber, left: field }],
  };
}

// ---------------------------------------------------------------------------
// Writes, each recording its reverse
// ---------------------------------------------------------------------------

/** A value write to the field `before` reads, recording what it writes. */
function writeValue(ctx: ChangeContext, before: ReadField, value: FormFieldValue): Done {
  const ref: FormFieldRef = { kind: 'objectNumber', objectNumber: before.objectNumber };
  const pending = captureBefore(ctx.runtime, ctx.session, objectsOf(before));
  const result = new FormMutator(ctx.runtime, ctx.session).setValue(ref, value, ctx.signal);
  const objects = captureAfter(ctx.runtime, ctx.session, pending);
  return {
    item: { type: 'forms.setValue', ...result },
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
    const { result } = new FormsEffectsApplier(ctx.runtime, ctx.session).apply(
      [effect],
      ctx.signal,
    );
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
  return recordRevert(
    ctx,
    before,
    'forms.update',
    () => new FormMutator(ctx.runtime, ctx.session).updateField(ref, patch, ctx.signal),
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

/** A delete of the field `before` reads, capturing it first. */
function writeDelete(ctx: ChangeContext, before: ReadField): Done {
  const capture = exportField(ctx.runtime, ctx.session.requireDocPtr(), before.objectNumber);
  const ref: FormFieldRef = { kind: 'objectNumber', objectNumber: before.objectNumber };
  const { deleted, removedWidgets } = new FormMutator(ctx.runtime, ctx.session).deleteField(
    ref,
    ctx.signal,
  );
  return {
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
      },
    ],
  };
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

function pick(values: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, values[key]]));
}

/** The value a field holds, in the shape a value write takes. */
function valueOf(field: FormFieldDTO<PdfCoordinates>): FormFieldValue {
  switch (field.family) {
    case 'checkbox':
      return { checked: field.checked };
    case 'listbox':
      return { selectedValues: field.selectedValues };
    case 'radio':
      return { value: field.value === 'Off' ? null : field.value };
    case 'text':
    case 'combobox':
      return { value: field.value };
    default:
      return { value: null };
  }
}

function fieldResult(ctx: ChangeContext, field: FormFieldDTO<PdfCoordinates>) {
  return {
    field,
    meta: formMutationMeta(ctx.session.writeStamp(), [field.ref], field.widgets as FormWidget[]),
  };
}

/** A reset's item: the fields it wrote, read back. */
function resetResult(
  ctx: ChangeContext,
  fields: readonly FormFieldDTO<PdfCoordinates>[],
): Extract<ChangeItem<PdfCoordinates>, { type: 'forms.reset' }> {
  return {
    type: 'forms.reset',
    fields: [...fields],
    meta: formMutationMeta(
      ctx.session.writeStamp(),
      fields.map((field) => field.ref),
      fields.flatMap((field) => field.widgets as FormWidget[]),
    ),
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
