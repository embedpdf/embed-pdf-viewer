/**
 * The widget projection: what a framework draws for one page's fields. Pure
 * data in page space (top-left origin, y-down PDF points), the same space
 * annotation render items use, so layers position with the page transform
 * and never re-derive scale.
 *
 * Where a widget is and how it looks come from the form's widget rows (`/Rect`
 * and `/MK`), identity, value and behavior from its field. A widget's place is
 * its frame, its quarter turn and the rect it stands in (`WidgetPlace`): a
 * layer puts its control in the frame and turns it about its middle, so the
 * control reads the way the field does.
 */
import type {
  AnnotationRef,
  FormField,
  FormFieldOption,
  FormFieldRef,
} from '@embedpdf/engine-core/runtime';

import { isEmpty } from './fields';
import {
  fieldKeyOf,
  type FieldIndex,
  type FieldKey,
  type FormWidgetLook,
  type PageWidget,
  type PageWidgets,
  type WidgetPlace,
} from '../model';

export type { Box, FormWidgetLook, WidgetPlace } from '../model';

interface FormWidgetItemBase extends WidgetPlace {
  key: FieldKey;
  /** The field this widget belongs to: what the write verbs take. */
  fieldRef: FormFieldRef;
  /** The widget's annotation object number. */
  annotObjectNumber: number;
  /** The widget's annotation address (null until the engine has placed it). */
  annotationRef: AnnotationRef | null;
  /** The box's own address: what `getWidget()` takes, and what UI anchored to the box is given. */
  ref: AnnotationRef;
  /** The group the field is in, or `null`. */
  groupId: string | null;
  /** The session may fill the field in, or sign it for a signature field: its permissions alone. */
  canFill: boolean;
  /** The form asks for a value: the field's Required flag. */
  required: boolean;
  /** The field holds nothing yet, by the rule `validate()` checks a required field with. */
  empty: boolean;
  /** How the widget looks in the PDF. */
  look: FormWidgetLook;
  /** A read-only field, no permission to fill, filling it turned off (`fillable`), or a write on its way: draw it, don't take input. */
  disabled: boolean;
  /** Accessible name: the field's tooltip (`/TU`) when it has one, else its full name. */
  label: string;
}

/** One widget as a fill control draws it: where, how it looks, its control and its value. */
export type FormWidgetItem = FormWidgetItemBase &
  (
    | {
        control: 'text';
        value: string;
        multiline: boolean;
        password: boolean;
        maxLength: number | null;
        comb: boolean;
      }
    | {
        control: 'toggle';
        kind: 'checkbox' | 'radio';
        checked: boolean;
        /** The export value that checks this widget. */
        exportValue: string;
      }
    | {
        control: 'choice';
        kind: 'combo' | 'list';
        edit: boolean;
        multi: boolean;
        options: FormFieldOption[];
        selected: string[];
      }
    | { control: 'button' }
    /**
     * A signature field's widget. `signed`: it carries a `/V` (a signature
     * dictionary), so the field is final and its appearance sealed, and the
     * control shows what the signature says rather than signing. Unsigned, it
     * is "sign here": signing belongs to the signature plugin.
     */
    | { control: 'signature'; signed: boolean }
  );

/**
 * Project one widget of a field into a fill control. `fillable`: people fill
 * the field in by hand (a signature field: sign it), which the box is
 * `disabled` without; `canFill`: the session's permission alone, which the
 * `fillable` setting doesn't change. Null for kinds with no fill control.
 */
export function projectWidget(
  field: FormField,
  annotObjectNumber: number,
  widget: PageWidget,
  fillable: boolean,
  canFill: boolean,
): FormWidgetItem | null {
  const key = fieldKeyOf(field);
  const base: FormWidgetItemBase = {
    key,
    fieldRef: field.ref,
    annotObjectNumber,
    annotationRef:
      field.widgets.find((candidate) => candidate.objectNumber === annotObjectNumber)?.ref ?? null,
    ref: widget.ref,
    groupId: field.groupId,
    canFill,
    required: field.required,
    empty: isEmpty(field),
    box: widget.box,
    rotation: widget.rotation,
    rect: widget.rect,
    look: widget.look,
    disabled: field.readOnly || !fillable,
    label: field.alternateName ?? field.name,
  };
  switch (field.kind) {
    case 'text':
      return {
        ...base,
        control: 'text',
        value: field.value,
        multiline: field.multiline,
        password: field.password,
        maxLength: field.maxLength,
        comb: field.comb,
      };
    case 'checkbox': {
      const toggle = field.widgets.find(
        (candidate) => candidate.objectNumber === annotObjectNumber,
      );
      return {
        ...base,
        control: 'toggle',
        kind: 'checkbox',
        checked: field.checked,
        exportValue: toggle && 'exportValue' in toggle ? toggle.exportValue : field.exportValue,
      };
    }
    case 'radio': {
      const toggle = field.widgets.find(
        (candidate) => candidate.objectNumber === annotObjectNumber,
      );
      return {
        ...base,
        control: 'toggle',
        kind: 'radio',
        checked: toggle && 'checked' in toggle ? toggle.checked : false,
        exportValue: toggle && 'exportValue' in toggle ? toggle.exportValue : '',
      };
    }
    case 'combobox':
      return {
        ...base,
        control: 'choice',
        kind: 'combo',
        edit: field.edit,
        multi: false,
        options: field.options,
        selected: field.value === '' ? [] : [field.value],
      };
    case 'listbox':
      return {
        ...base,
        control: 'choice',
        kind: 'list',
        edit: false,
        multi: field.multiSelect,
        options: field.options,
        selected: field.selectedValues,
      };
    case 'pushbutton':
      return { ...base, control: 'button' };
    case 'signature':
      return { ...base, control: 'signature', signed: field.valueEntry.kind !== 'none' };
    default:
      return null;
  }
}

/**
 * Project one page's widgets into fill controls, each disabled when people
 * don't fill its field in by hand (`mayFillByHand`), and each saying whether
 * the session may fill it in, or sign it (`mayFill`, its permissions alone).
 * Widgets whose page has not loaded (or that are direct objects with no join
 * key) are skipped; the projection runs again when the page's widgets land.
 */
export function fillItems(
  index: FieldIndex,
  pageObjectNumber: number,
  widgets: PageWidgets | undefined,
  mayFillByHand: (field: FormField) => boolean,
  mayFill: (field: FormField) => boolean,
): FormWidgetItem[] {
  if (!index.snapshot || !widgets) return [];
  const items: FormWidgetItem[] = [];
  for (const field of index.snapshot.fields) {
    for (const widget of field.widgets) {
      if (widget.page?.objectNumber !== pageObjectNumber) continue;
      const placed = widgets[widget.objectNumber];
      if (!placed) continue;
      const item = projectWidget(
        field,
        widget.objectNumber,
        placed,
        mayFillByHand(field),
        mayFill(field),
      );
      if (item) items.push(item);
    }
  }
  return items;
}
