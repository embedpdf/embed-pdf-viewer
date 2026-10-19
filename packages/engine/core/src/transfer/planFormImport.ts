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
  WIDGET_FLAG_NAMES,
  type FormImportDrop,
  type FormImportDropReason,
  type FormValuesImportDrop,
  type FormValuesImportDropReason,
  type WidgetFlags,
} from './formImport';
import { mapPageRefs, pageRefsIn } from './pageRefs';
import type { WidgetAnnotation } from '../annotation/kinds/widget';
import {
  actionWriteOf,
  fieldScriptOf,
  needsScriptRight,
  WIDGET_ACTION_EVENTS,
  type FieldActionsPatch,
  type FieldScriptEvent,
  type WidgetActionsPatch,
} from '../dto/PdfAction';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { FormFieldDraft, WidgetPlacement } from '../forms/draft';
import type { FormFieldDTO, FormFieldFamily } from '../forms/field';
import { FormFieldDraftSchema } from '../forms/schema';
import { fieldValueOf, type FormFieldValue } from '../forms/value';
import { annotationKey } from '../identity/annotationKey';
import { encodeFieldRefKey, type FormFieldRef } from '../identity/FormFieldRef';
import type { PageRef } from '../identity/PageRef';

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
 * - `InvalidArg` when a field's data isn't valid for its family, or when a
 *   page a widget is on or points at maps to no target page;
 * - `NotFound` when a page list maps to a page the target doesn't have.
 *
 * Left out, in bundle order: a field of an unknown family, a field whose
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
    if (field.family === 'unknown') {
      dropped.push({ ref: field.ref, reason: 'unsupported-family' });
      return;
    }
    if (claimed.has(field.name) || input.nameTaken(field.name)) {
      dropped.push({ ref: field.ref, reason: 'name-conflict' });
      return;
    }
    claimed.add(field.name);
    const actions = fieldActionsOf(field, mayScript, dropped);
    const placements = rows.map((row) =>
      placementOf(field, bundle.widgets[row]!.data, mapPage, mayScript, dropped),
    );
    const draft = draftOf(field, actions, placements, index);
    const value = input.values && holdsValue(field) ? fieldValueOf(field) : null;
    creates.push({
      field: index,
      draft,
      widgets: rows,
      flags: rows.map((row) => flagsOf(bundle.widgets[row]!.data)),
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
  readonly family: FormFieldFamily;
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
 * (`no-field`), one of another family (`wrong-family`), and one `refusal`
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
    } else if (target.family !== field.family) {
      dropped.push({ ref: field.ref, reason: 'wrong-family' });
    } else {
      const refused = input.refusal?.(target, value);
      if (refused) dropped.push({ ref: field.ref, reason: refused });
      else writes.push({ field: index, target, value });
    }
  });
  return { writes, dropped };
}

/** Whether a field read holds a value a write can set. */
function holdsValue(field: FormFieldDTO): boolean {
  return field.valueEntry.kind === 'scalar' || field.valueEntry.kind === 'array';
}

/** A field's scripts as a create writes them; each left out is reported. */
function fieldActionsOf(
  field: FormFieldDTO,
  mayScript: boolean,
  dropped: FormImportDrop[],
): FieldActionsPatch {
  const actions: FieldActionsPatch = {};
  for (const [event, tree] of Object.entries(field.actions ?? {}) as [
    FieldScriptEvent,
    NonNullable<FormFieldDTO['actions']>[FieldScriptEvent],
  ][]) {
    if (!tree) continue;
    const script = fieldScriptOf(tree);
    const member = `actions.${event}`;
    if (!script) dropped.push({ ref: field.ref, field: member, reason: 'unsupported-action' });
    else if (!mayScript)
      dropped.push({ ref: field.ref, field: member, reason: 'script-not-allowed' });
    else actions[event] = script;
  }
  return actions;
}

/** A widget row as a create places it: on its mapped page, with its look and actions. */
function placementOf(
  field: FormFieldDTO,
  row: WidgetAnnotation,
  mapPage: (page: PageRef) => PageRef,
  mayScript: boolean,
  dropped: FormImportDrop[],
): WidgetPlacement {
  const actions: WidgetActionsPatch = {};
  for (const event of WIDGET_ACTION_EVENTS) {
    const tree = row.actions?.[event];
    if (!tree) continue;
    const write = actionWriteOf(tree);
    const drop = (reason: FormImportDropReason) =>
      dropped.push({ ref: field.ref, widget: row.ref, field: `actions.${event}`, reason });
    if (!write) drop('unsupported-action');
    else if (!mayScript && needsScriptRight(write)) drop('script-not-allowed');
    else actions[event] = mapPageRefs(write, mapPage);
  }
  const toggle =
    field.family === 'checkbox' || field.family === 'radio'
      ? field.widgets.find(
          (widget) => widget.ref && annotationKey(widget.ref) === annotationKey(row.ref),
        )
      : undefined;
  const look = {
    color: row.color,
    interiorColor: row.interiorColor,
    fontFamily: row.fontFamily,
    fontSize: row.fontSize,
    fontColor: row.fontColor,
    caption: field.family === 'pushbutton' ? row.caption : null,
  };
  return {
    page: mapPage(row.page),
    rect: row.rect,
    ...(row.rotation ? { rotation: row.rotation } : {}),
    strokeWidth: row.strokeWidth,
    borderStyle: row.borderStyle,
    textAlign: row.textAlign,
    // A new widget has none of these: only what the row has is written.
    ...Object.fromEntries(Object.entries(look).filter(([, value]) => value != null)),
    ...(toggle && 'exportValue' in toggle ? { exportValue: toggle.exportValue } : {}),
    ...(Object.keys(actions).length > 0 ? { actions } : {}),
  };
}

function flagsOf(row: WidgetAnnotation): WidgetFlags {
  return Object.fromEntries(WIDGET_FLAG_NAMES.map((name) => [name, row[name]])) as WidgetFlags;
}

/** The create a field row becomes, checked against the create schema. */
function draftOf(
  field: FormFieldDTO,
  actions: FieldActionsPatch,
  widgets: WidgetPlacement[],
  index: number,
): FormFieldDraft {
  const base = {
    name: field.name,
    readOnly: field.readOnly,
    required: field.required,
    noExport: field.noExport,
    ...(field.alternateName !== null ? { alternateName: field.alternateName } : {}),
    ...(field.mappingName !== null ? { mappingName: field.mappingName } : {}),
    // The group the field was in; the import decides whether it keeps it.
    ...(field.groupId !== null ? { groupId: field.groupId } : {}),
    ...(Object.keys(actions).length > 0 ? { actions } : {}),
    widgets,
  };
  const hasDefault = field.defaultValueEntry.kind !== 'none';
  const options = (list: readonly { label: string; value: string }[]) =>
    list.map(({ label, value }) => ({ label, value }));
  let draft: FormFieldDraft;
  switch (field.family) {
    case 'text':
      draft = {
        ...base,
        family: 'text',
        ...(hasDefault ? { defaultValue: field.defaultValue } : {}),
        ...(field.maxLength !== null ? { maxLength: field.maxLength } : {}),
        multiline: field.multiline,
        password: field.password,
        comb: field.comb,
      };
      break;
    case 'radio':
      draft = {
        ...base,
        family: 'radio',
        radiosInUnison: field.radiosInUnison,
        noToggleToOff: field.noToggleToOff,
      };
      break;
    case 'combobox':
      draft = {
        ...base,
        family: 'combobox',
        edit: field.edit,
        options: options(field.options),
        ...(hasDefault ? { defaultValue: field.defaultValue } : {}),
      };
      break;
    case 'listbox':
      draft = {
        ...base,
        family: 'listbox',
        multiSelect: field.multiSelect,
        options: options(field.options),
        ...(hasDefault ? { defaultValue: field.defaultValue } : {}),
      };
      break;
    case 'checkbox':
    case 'pushbutton':
    case 'signature':
      draft = { ...base, family: field.family };
      break;
    default:
      throw new EngineError(EngineErrorCode.InvalidArg, `import: field ${index} has no family`);
  }
  const checked = FormFieldDraftSchema.safeParse(draft);
  if (!checked.success) {
    const issue = checked.error.issues[0]!;
    const path = issue.path.join('.');
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `import: field ${index}${path ? ` member '${path}'` : ''}: ${issue.message}`,
      { details: { item: index, ...(path ? { field: path } : {}) } },
    );
  }
  return draft;
}
