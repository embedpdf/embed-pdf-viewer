/**
 * What a copy of form fields is, inside one document: decided here, once.
 * The engine applies it and a viewer shows it before the engine answers, so
 * nothing here needs zod. The engine checks each create against the create
 * schema before its first write (`planFormCopy`, in
 * `@embedpdf/engine-core/validation`).
 */
import { fieldMatches } from './formExport';
import {
  fieldActionsOf,
  fieldDraftOf,
  holdsValue,
  widgetFlagsOf,
  widgetPlacementOf,
} from './formFieldCreates';
import type { FormImportDrop, WidgetFlags } from './formImport';
import type { WidgetAnnotation } from '../annotation/kinds/widget';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { FormFieldDraft, WidgetPlacement } from '../forms/draft';
import type { FormField } from '../forms/field';
import type { FormSnapshot } from '../forms/snapshot';
import { fieldValueOf, type FormFieldValue } from '../forms/value';
import { annotationKey } from '../identity/annotationKey';
import type { AnnotationRef } from '../identity/AnnotationRef';
import { encodeFieldRefKey, type FormFieldRef } from '../identity/FormFieldRef';
import type { PageRef } from '../identity/PageRef';
import type { FormMutationMeta } from '../mutation/FormMutationResults';
import type { WriteOptions } from '../mutation/WriteOptions';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/** Where copies go: `doc.forms.copy(fields, options)`, and the op's own fields. */
export interface FormCopyPlacement {
  /** The page every copied widget goes on. Left out: each on its own page. */
  readonly page?: PageRef;
  /**
   * How far each copied widget is moved, in page points from the top-left:
   * `x` to the right, `y` down. Left out: not at all.
   */
  readonly offset?: { readonly x: number; readonly y: number };
}

/**
 * How to copy. The `opId` names the change: its events share it as
 * `origin.tx.id`, and `doc.apply({ undoOf })` takes the copies away.
 */
export interface FormCopyOptions extends WriteOptions, FormCopyPlacement {
  /**
   * The widgets to copy, when it isn't every widget of the fields: each
   * field's copy has those of its widgets that are named. Each field given
   * must have one of them, and each must be a widget of one of the fields
   * (`InvalidArg` otherwise).
   */
  readonly widgets?: readonly AnnotationRef[];
  /** Whether each copy gets its source's value. Default `true`. */
  readonly values?: boolean;
  /**
   * The object numbers the copies take, from `doc.objectNumbers`: for each
   * field in the order given, its own, then one for each of its widgets
   * copied. A field that is left out takes none. The next free ones when
   * absent.
   */
  readonly objectNumbers?: readonly number[];
}

/** What a copy answers: what a design import of the same fields answers. */
export interface FormCopyResult<C extends Coordinates = PageCoordinates> {
  /** The new fields, in the order of the fields given, each as it is now. */
  fields: FormField<C>[];
  /** Their widgets' rows. */
  widgets: WidgetAnnotation<C>[];
  /** Each copied field's ref, and its copy's. One named twice is here twice. */
  refMap: Array<{ from: FormFieldRef; to: FormFieldRef }>;
  /** What was left out, in the order of the fields given. */
  dropped: FormImportDrop[];
  /** The form's whole calculation order, when the copy changed it. */
  calculationOrder?: FormFieldRef[];
  meta: FormMutationMeta;
}

/** One field a copy makes. */
export interface PlannedFieldCopy {
  /** The field it copies, by its place among the fields given. */
  readonly source: number;
  /**
   * What `create` writes: the source's settings and scripts under its new
   * name, and each copied widget, moved. Not checked against the create
   * schema.
   */
  readonly draft: FormFieldDraft;
  /** The widgets it copies, in `draft.widgets` order. */
  readonly widgets: readonly AnnotationRef[];
  /** Each copied widget's flags, in `draft.widgets` order. */
  readonly flags: readonly WidgetFlags[];
  /** The value it gets; absent when the copy writes none. */
  readonly value?: FormFieldValue;
}

export interface FormCopyPlan {
  /** In the order of the fields given. */
  readonly creates: readonly PlannedFieldCopy[];
  /** The calculation order among the creates, by their place in `creates`, as the form has their sources. */
  readonly calculationOrder: readonly number[];
  /** What was left out, a field whole or one member of it, in the order given. */
  readonly dropped: readonly FormImportDrop[];
}

/**
 * Whether a new field named `name` can't join a form whose fields are
 * `names`: one has that name, one sits under it (`name` would have to be a
 * parent), or one is its parent (it would have to stop being a field).
 */
export function fieldNameTaken(names: ReadonlySet<string>, name: string): boolean {
  if (names.has(name)) return true;
  for (const other of names) {
    if (other.startsWith(`${name}.`) || name.startsWith(`${other}.`)) return true;
  }
  return false;
}

/**
 * The name a copy of the field `name` gets: its last part with the next
 * free number. `email` becomes `email_2`, `text_1` becomes `text_2`, and
 * `billing.name` becomes `billing.name_2`: a copy stays in its group.
 */
export function copyNameOf(name: string, taken: (name: string) => boolean): string {
  const dot = name.lastIndexOf('.');
  const group = name.slice(0, dot + 1);
  const last = name.slice(dot + 1);
  const numbered = /^(.*)_(\d+)$/.exec(last);
  const stem = numbered ? numbered[1]! : last;
  let count = numbered ? Number(numbered[2]) + 1 : 2;
  while (taken(`${group}${stem}_${count}`)) count += 1;
  return `${group}${stem}_${count}`;
}

/**
 * The copies of `fields`, which are fields of `form`, in page space, in the
 * order given:
 *
 * - A copy is a new field: its source's settings and scripts, under the
 *   name `copyNameOf` gives it, with the source's widgets that are on a
 *   page, or those of them `widgets` names.
 * - Each copied widget has its source's look, flags and actions, moved by
 *   `offset`, on `page` when one is named: the same spot from the top-left
 *   of that page.
 * - With `values`, a copy has its source's value. A signature never comes
 *   along.
 * - A field of a kind the engine doesn't model is left out, and so is each
 *   script, submit or link when `mayScript` is false, and each action a
 *   write can't make.
 *
 * A field named twice is copied twice. `NotFound` for a field the form
 * doesn't have; `InvalidArg` when `widgets` names a widget of none of the
 * fields, or none of a field's.
 */
export function planFormCopies(input: {
  readonly form: Pick<FormSnapshot, 'fields' | 'widgets' | 'calculationOrder'>;
  readonly fields: readonly FormFieldRef[];
  readonly widgets?: readonly AnnotationRef[];
  readonly placement: FormCopyPlacement;
  readonly values: boolean;
  readonly mayScript: boolean;
}): FormCopyPlan {
  const { form, mayScript, placement } = input;
  const rowByKey = new Map(form.widgets.map((row) => [annotationKey(row.ref), row]));
  const only = input.widgets ? new Set(input.widgets.map(annotationKey)) : null;
  const names = new Set(form.fields.map((field) => field.name));
  const offset = placement.offset ?? { x: 0, y: 0 };
  const moved = (widget: WidgetPlacement): WidgetPlacement => ({
    ...widget,
    ...(placement.page ? { page: placement.page } : {}),
    ...(widget.rect
      ? { rect: { ...widget.rect, x: widget.rect.x + offset.x, y: widget.rect.y + offset.y } }
      : {}),
  });

  const dropped: FormImportDrop[] = [];
  const creates: PlannedFieldCopy[] = [];
  const sources: FormField[] = [];
  const copied = new Set<string>();
  input.fields.forEach((ref, index) => {
    const field = form.fields.find((candidate) => fieldMatches(candidate, ref));
    if (!field) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `copy: no form field ${encodeFieldRefKey(ref)}`,
        { details: { item: index } },
      );
    }
    const rows = field.widgets.flatMap((widget) => {
      const row = widget.ref ? rowByKey.get(annotationKey(widget.ref)) : undefined;
      return row && (!only || only.has(annotationKey(row.ref))) ? [row] : [];
    });
    for (const row of rows) copied.add(annotationKey(row.ref));
    if (only && rows.length === 0) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `copy: 'widgets' names no widget of field ${index}`,
        { details: { item: index, field: 'widgets' } },
      );
    }
    if (field.kind === 'unknown') {
      dropped.push({ ref: field.ref, reason: 'unsupported-kind' });
      return;
    }
    const name = copyNameOf(field.name, (candidate) => fieldNameTaken(names, candidate));
    names.add(name);
    const actions = fieldActionsOf(field, mayScript, dropped);
    const widgets = rows.map((row) =>
      moved(widgetPlacementOf(field, row, (same) => same, mayScript, dropped)),
    );
    const value =
      input.values && field.kind !== 'signature' && holdsValue(field) ? fieldValueOf(field) : null;
    sources.push(field);
    creates.push({
      source: index,
      draft: fieldDraftOf(field, name, actions, widgets, `copy: field ${index}`),
      widgets: rows.map((row) => row.ref),
      flags: rows.map(widgetFlagsOf),
      ...(value ? { value } : {}),
    });
  });
  for (const key of only ?? []) {
    if (!copied.has(key)) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `copy: widget ${key} is a widget of none of the fields`,
        { details: { field: 'widgets' } },
      );
    }
  }

  // The order the form gives the sources that kept their calculate script.
  const calculationOrder = form.calculationOrder.flatMap((ref) =>
    ref
      ? creates.flatMap((create, at) =>
          fieldMatches(sources[at]!, ref) && create.draft.actions?.calculate ? [at] : [],
        )
      : [],
  );
  return { creates, calculationOrder, dropped };
}
