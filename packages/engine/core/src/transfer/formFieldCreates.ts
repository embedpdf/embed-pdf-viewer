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
import { annotationKey } from '../identity/annotationKey';
import type { PageRef } from '../identity/PageRef';

/** Whether a field read holds a value a write can set. */
export function holdsValue(field: FormField): boolean {
  return field.valueEntry.kind === 'scalar' || field.valueEntry.kind === 'array';
}

/** A field's scripts as a create writes them; each left out is reported. */
export function fieldActionsOf(
  field: FormField,
  mayScript: boolean,
  dropped: FormImportDrop[],
): FieldActionsPatch {
  const actions: FieldActionsPatch = {};
  for (const [event, tree] of Object.entries(field.actions ?? {}) as [
    FieldScriptEvent,
    NonNullable<FormField['actions']>[FieldScriptEvent],
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
 * `actions` and `widgets` given. Not checked against the create schema:
 * `where` names the field in the refusal of a kind the engine doesn't model,
 * which no create makes.
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
    // The group the field was in; its writer decides whether it keeps it.
    ...(field.groupId !== null ? { groupId: field.groupId } : {}),
    ...(Object.keys(actions).length > 0 ? { actions } : {}),
    widgets,
  };
  const hasDefault = field.defaultValueEntry.kind !== 'none';
  const options = (list: readonly { label: string; value: string }[]) =>
    list.map(({ label, value }) => ({ label, value }));
  switch (field.kind) {
    case 'text':
      return {
        ...base,
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
