/**
 * What a form import writes and leaves out, decided before its first write: a design import's
 * fields checked against the create schema, a values import's values matched to the form's
 * fields. Built with zod, so it runs where the engine does, from
 * `@embedpdf/engine-core/validation`; the facts an import commits are in `formImport.ts`.
 */
import { bundlePageMapping, type BundleImportPages, type BundleImportTarget } from './bundle';
import type { FormBundle } from './FormBundle';
import { fieldMatches } from './formExport';
import {
  fieldActionsOf,
  fieldDraftOf,
  holdsValue,
  widgetFlagsOf,
  widgetPlacementOf,
} from './formFieldCreates';
import type {
  FormImportDrop,
  FormValuesImportDrop,
  FormValuesImportDropReason,
  WidgetFlags,
} from './formImport';
import { pageRefsIn } from './pageRefs';
import type { FieldActionsPatch } from '../dto/PdfAction';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { FormFieldDraft, WidgetPlacement } from '../forms/draft';
import type { FormField, FormFieldKind } from '../forms/field';
import { FormFieldDraftSchema } from '../forms/schema';
import { fieldValueOf, type FormFieldValue } from '../forms/value';
import { annotationKey } from '../identity/annotationKey';
import { encodeFieldRefKey, type FormFieldRef } from '../identity/FormFieldRef';

/** One field a design import creates. */
export interface PlannedFormField {
  /** Its row in the bundle. */
  readonly field: number;
  /** What `create` writes: the field's settings, scripts and widgets, their pages mapped. */
  readonly draft: FormFieldDraft;
  /** Each widget's row in the bundle, in `draft.widgets` order. */
  readonly widgets: readonly number[];
  /** Each widget's flags, in `draft.widgets` order. */
  readonly flags: readonly WidgetFlags[];
  /** The value it gets; absent when the import writes none. */
  readonly value?: FormFieldValue;
}

export interface FormImportPlan {
  /** In bundle order. */
  readonly creates: readonly PlannedFormField[];
  /** The calculation order among the creates, by their place in `creates`, as the bundle has it. */
  readonly calculationOrder: readonly number[];
  readonly dropped: readonly FormImportDrop[];
}

/**
 * What a design import of `bundle` into the `target` pages creates, and what
 * it leaves out. Nothing here touches a document, so an import refuses
 * before its first write:
 *
 * - `InvalidArg` when a field's data isn't valid for its kind, or when a
 *   page a widget is on or points at maps to no target page;
 * - `NotFound` when a page list maps to a page the target doesn't have.
 *
 * Left out, in bundle order: a field of an unknown kind, a field whose
 * name is taken (`nameTaken`, for the document as it is before the
 * import), a widget whose field isn't in the bundle, and each action that
 * is a script, a submit or a link when `mayScript` is false
 * (`doc.forms.script`), or that a write can't make. Each field keeps every
 * widget it has. With `values`, each field gets the value the bundle holds.
 */
export function planFormImport(input: {
  readonly bundle: Pick<FormBundle, 'pages' | 'fields' | 'widgets' | 'calculationOrder'>;
  readonly pages?: BundleImportPages;
  readonly target: readonly BundleImportTarget[];
  readonly nameTaken: (name: string) => boolean;
  readonly mayScript: boolean;
  readonly values: boolean;
}): FormImportPlan {
  const { bundle, mayScript } = input;
  const mapPage = bundlePageMapping({
    bundlePages: bundle.pages,
    pages: input.pages ?? 'same',
    target: input.target,
    named: bundle.widgets.flatMap((row) => pageRefsIn(row.data)),
  });

  const rowByKey = new Map(
    bundle.widgets.map((row, index) => [annotationKey(row.data.ref), index]),
  );
  const owned = new Set<number>();
  const dropped: FormImportDrop[] = [];
  const claimed = new Set<string>();
  const creates: PlannedFormField[] = [];

  bundle.fields.forEach(({ data: field }, index) => {
    const rows = field.widgets.flatMap((widget) => {
      const row = widget.ref ? rowByKey.get(annotationKey(widget.ref)) : undefined;
      return row === undefined ? [] : [row];
    });
    for (const row of rows) owned.add(row);
    if (field.kind === 'unknown') {
      dropped.push({ ref: field.ref, reason: 'unsupported-kind' });
      return;
    }
    if (claimed.has(field.name) || input.nameTaken(field.name)) {
      dropped.push({ ref: field.ref, reason: 'name-conflict' });
      return;
    }
    claimed.add(field.name);
    const actions = fieldActionsOf(field, mayScript, dropped);
    const placements = rows.map((row) =>
      widgetPlacementOf(field, bundle.widgets[row]!.data, mapPage, mayScript, dropped),
    );
    const draft = draftOf(field, actions, placements, index);
    const value = input.values && holdsValue(field) ? fieldValueOf(field) : null;
    creates.push({
      field: index,
      draft,
      widgets: rows,
      flags: rows.map((row) => widgetFlagsOf(bundle.widgets[row]!.data)),
      ...(value ? { value } : {}),
    });
  });

  bundle.widgets.forEach((row, index) => {
    if (!owned.has(index)) {
      dropped.push({ ref: row.data.field, widget: row.data.ref, reason: 'no-field' });
    }
  });

  // The order the bundle gives the fields that kept their calculate script.
  const calculationOrder = bundle.calculationOrder.flatMap((ref) => {
    const at = creates.findIndex(
      (create) =>
        encodeFieldRefKey(bundle.fields[create.field]!.data.ref) === encodeFieldRefKey(ref) &&
        create.draft.actions?.calculate,
    );
    return at < 0 ? [] : [at];
  });
  return { creates, calculationOrder, dropped };
}

/** A field of the document a values import fills. */
export interface FormValuesImportTarget {
  readonly ref: FormFieldRef;
  readonly name: string;
  readonly kind: FormFieldKind;
}

/** One value a values import writes. */
export interface PlannedValueWrite<T extends FormValuesImportTarget = FormValuesImportTarget> {
  /** Its field's row in the bundle. */
  readonly field: number;
  /** The document's field of that name. */
  readonly target: T;
  readonly value: FormFieldValue;
}

/**
 * What a values import of `bundle` writes into a form whose fields are
 * `target`: each field the bundle holds a value for gets it, matched by full
 * name. Left out, in bundle order: a field the document doesn't have
 * (`no-field`), one of another kind (`wrong-kind`), and one `refusal`
 * names a reason for: a value the field can't take, a field a signature
 * locked, a field the session may not fill in. So everything is decided
 * before the first write.
 */
export function planFormValuesImport<T extends FormValuesImportTarget>(input: {
  readonly bundle: Pick<FormBundle, 'fields'>;
  readonly target: readonly T[];
  readonly refusal?: (
    target: T,
    value: FormFieldValue,
  ) => Extract<
    FormValuesImportDropReason,
    'value-not-allowed' | 'locked' | 'fill-not-allowed'
  > | null;
}): {
  readonly writes: readonly PlannedValueWrite<T>[];
  readonly dropped: readonly FormValuesImportDrop[];
} {
  const writes: PlannedValueWrite<T>[] = [];
  const dropped: FormValuesImportDrop[] = [];
  input.bundle.fields.forEach(({ data: field }, index) => {
    const value = holdsValue(field) ? fieldValueOf(field) : null;
    if (!value) return;
    const target = input.target.find((candidate) =>
      fieldMatches(candidate, { kind: 'fqn', name: field.name }),
    );
    if (!target) {
      dropped.push({ ref: field.ref, reason: 'no-field' });
    } else if (target.kind !== field.kind) {
      dropped.push({ ref: field.ref, reason: 'wrong-kind' });
    } else {
      const refused = input.refusal?.(target, value);
      if (refused) dropped.push({ ref: field.ref, reason: refused });
      else writes.push({ field: index, target, value });
    }
  });
  return { writes, dropped };
}

/**
 * `draft`, checked against the create schema. `label` names it in the
 * refusal (`import: field 2`), and `details` is what the error says of it.
 */
export function checkedFieldDraft(
  draft: FormFieldDraft,
  label: string,
  details: Readonly<Record<string, unknown>>,
): FormFieldDraft {
  const checked = FormFieldDraftSchema.safeParse(draft);
  if (!checked.success) {
    const issue = checked.error.issues[0]!;
    const path = issue.path.join('.');
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `${label}${path ? ` member '${path}'` : ''}: ${issue.message}`,
      { details: { ...details, ...(path ? { field: path } : {}) } },
    );
  }
  return draft;
}

/** The create a field row becomes, checked against the create schema. */
function draftOf(
  field: FormField,
  actions: FieldActionsPatch,
  widgets: WidgetPlacement[],
  index: number,
): FormFieldDraft {
  const label = `import: field ${index}`;
  return checkedFieldDraft(fieldDraftOf(field, field.name, actions, widgets, label), label, {
    item: index,
  });
}
