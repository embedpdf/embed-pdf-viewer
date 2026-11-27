/**
 * A field read, as the create that makes it again: its settings, its scripts
 * and its widgets, each on a page, with its look, its flags and its actions.
 * A design import makes a bundle's fields this way and a copy the document's
 * own, so what a made-again field holds is decided here, once. Nothing here
 * needs zod: a viewer shows a copy before the engine answers.
 */
import {
  WIDGET_FLAG_NAMES,
  type FormImportDrop,
  type FormImportDropReason,
  type WidgetFlags,
} from './formImport';
import { mapPageRefs } from './pageRefs';
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
import type { FormField } from '../forms/field';
import {
  formatOfActions,
  isKeystrokeOfFormat,
  isWritableFormat,
  takesFormat,
  type FormFieldFormatWritable,
} from '../forms/format';
import { isFieldPurpose } from '../forms/purpose';
import { annotationKey } from '../identity/annotationKey';
import type { PageRef } from '../identity/PageRef';

/** Whether a field read holds a value a write can set. */
export function holdsValue(field: FormField): boolean {
  return field.valueEntry.kind === 'scalar' || field.valueEntry.kind === 'array';
}

/**
 * The date or time format a field's scripts give it, which a create writes
 * again from its pattern; `null` for a field without one. Read from the
 * scripts themselves, so a row an older version exported has it too.
 */
function writableFormatOf(field: FormField): FormFieldFormatWritable | null {
  if (!takesFormat(field.kind)) return null;
  const format = formatOfActions(field.actions);
  return isWritableFormat(format) ? format : null;
}

/**
 * A field's scripts as a create writes them; each left out is reported.
 * Without the right to write scripts (`mayScript`), a date or a time format
 * still comes along, as the create's `format`: its format script, and a
 * keystroke script that is the format's own, are then no loss to report.
 */
export function fieldActionsOf(
  field: FormField,
  mayScript: boolean,
  dropped: FormImportDrop[],
): FieldActionsPatch {
  const actions: FieldActionsPatch = {};
  const format = mayScript ? null : writableFormatOf(field);
  for (const [event, tree] of Object.entries(field.actions ?? {}) as [
    FieldScriptEvent,
    NonNullable<FormField['actions']>[FieldScriptEvent],
  ][]) {
    if (!tree) continue;
    const script = fieldScriptOf(tree);
    const member = `actions.${event}`;
    if (!script) dropped.push({ ref: field.ref, field: member, reason: 'unsupported-action' });
    else if (mayScript) actions[event] = script;
    else if (format && event === 'format') continue;
    else if (format && event === 'keystroke' && isKeystrokeOfFormat(format, tree)) continue;
    else dropped.push({ ref: field.ref, field: member, reason: 'script-not-allowed' });
  }
  return actions;
}

/** A widget row as a create places it: on its mapped page, with its look and actions. */
export function widgetPlacementOf(
  field: FormField,
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
    field.kind === 'checkbox' || field.kind === 'radio'
      ? field.widgets.find(
          (widget) => widget.ref && annotationKey(widget.ref) === annotationKey(row.ref),
        )
      : undefined;
  const look = {
    color: row.color,
    interiorColor: row.interiorColor,
    dashArray: row.dashArray,
    checkStyle: row.checkStyle,
    fontFamily: row.fontFamily,
    fontSize: row.fontSize,
    fontColor: row.fontColor,
    caption: field.kind === 'pushbutton' ? row.caption : null,
    // The PDF's own default, `caption`, needs no write; an older bundle's row has none.
    layout: field.kind === 'pushbutton' && row.layout !== 'caption' ? row.layout : null,
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

/** A widget row's flags, which a made-again widget keeps: a create writes none. */
export function widgetFlagsOf(row: WidgetAnnotation): WidgetFlags {
  return Object.fromEntries(WIDGET_FLAG_NAMES.map((name) => [name, row[name]])) as WidgetFlags;
}

/**
 * The create a field read becomes, under `name`: its own settings, the
 * `actions` and `widgets` given. A date or a time format goes in as `format`
 * when its format script isn't among `actions` (it was left out for want of
 * the right to write scripts); with the script there, the copy has the
 * format through it, as its original does. Not checked against the create
 * schema: `where` names the field in the refusal of a kind the engine
 * doesn't model, which no create makes.
 */
export function fieldDraftOf(
  field: FormField,
  name: string,
  actions: FieldActionsPatch,
  widgets: WidgetPlacement[],
  where: string,
): FormFieldDraft {
  const base = {
    name,
    readOnly: field.readOnly,
    required: field.required,
    noExport: field.noExport,
    ...(field.alternateName !== null ? { alternateName: field.alternateName } : {}),
    ...(field.mappingName !== null ? { mappingName: field.mappingName } : {}),
    // The group the field was in, or that anyone fills it in; its writer
    // decides whether it keeps either.
    ...(field.groupId !== null ? { groupId: field.groupId } : {}),
    ...(field.forAnyone ? { forAnyone: true } : {}),
    ...(isFieldPurpose(field.purpose) ? { purpose: field.purpose } : {}),
    ...(Object.keys(actions).length > 0 ? { actions } : {}),
    widgets,
  };
  // A format script is carried or left out with the keystroke script, so a
  // create never gets `format` beside a script for one of its two events.
  const written = actions.format === undefined ? writableFormatOf(field) : null;
  const format = written ? { format: written } : {};
  const hasDefault = field.defaultValueEntry.kind !== 'none';
  const options = (list: readonly { label: string; value: string }[]) =>
    list.map(({ label, value }) => ({ label, value }));
  switch (field.kind) {
    case 'text':
      return {
        ...base,
        ...format,
        kind: 'text',
        ...(hasDefault ? { defaultValue: field.defaultValue } : {}),
        ...(field.maxLength !== null ? { maxLength: field.maxLength } : {}),
        multiline: field.multiline,
        password: field.password,
        comb: field.comb,
      };
    case 'radio':
      return {
        ...base,
        kind: 'radio',
        radiosInUnison: field.radiosInUnison,
        noToggleToOff: field.noToggleToOff,
      };
    case 'combobox':
      return {
        ...base,
        ...format,
        kind: 'combobox',
        edit: field.edit,
        options: options(field.options),
        ...(hasDefault ? { defaultValue: field.defaultValue } : {}),
      };
    case 'listbox':
      return {
        ...base,
        kind: 'listbox',
        multiSelect: field.multiSelect,
        options: options(field.options),
        ...(hasDefault ? { defaultValue: field.defaultValue } : {}),
      };
    case 'checkbox':
    case 'pushbutton':
    case 'signature':
      return { ...base, kind: field.kind };
    default:
      throw new EngineError(EngineErrorCode.InvalidArg, `${where} has no family`);
  }
}
