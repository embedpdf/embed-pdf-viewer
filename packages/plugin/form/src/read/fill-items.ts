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
 *
 * A widget's `label` is its accessible name. A radio button's names its option too, the way
 * screen readers read a PDF radio button: the group's tooltip, then the button's own choice
 * (`Plan: monthly`). Its buttons are placed apart on the page, so no group element can hold them:
 * each says where it comes in the group itself (`inGroup`).
 */
import type {
  AnnotationRef,
  FormField,
  FormFieldOption,
  FormFieldRef,
} from '@embedpdf/engine-core/runtime';

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

/** Where a radio button comes among its group's buttons: `position` from 1, of `size`. */
export interface GroupPosition {
  readonly position: number;
  readonly size: number;
}

interface FormWidgetItemBase extends WidgetPlace {
  key: FieldKey;
  /** The field this widget belongs to: what the write verbs take. */
  fieldRef: FormFieldRef;
  /** The widget's annotation object number. */
  annotObjectNumber: number;
  /** The widget's annotation address (null until the engine has placed it). */
  annotationRef: AnnotationRef | null;
  /** How the widget looks in the PDF. */
  look: FormWidgetLook;
  /** A read-only field, no permission to fill, filling it turned off (`fillable`), or a write on its way: draw it, don't take input. */
  disabled: boolean;
  /**
   * Accessible name: the field's tooltip (`/TU`) when it has one, else its full name. A radio
   * button adds the option it stands for, its export value: `Plan: monthly`.
   */
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
        kind: 'checkbox';
        checked: boolean;
        /** The export value that checks this widget. */
        exportValue: string;
      }
    | {
        control: 'toggle';
        kind: 'radio';
        checked: boolean;
        /** The export value that checks this widget: the option it stands for. */
        exportValue: string;
        /**
         * Where the button comes among its group's buttons, in the order the arrow keys go round
         * (Tab's): for `aria-posinset` and `aria-setsize`. Null while that order isn't known.
         */
        inGroup: GroupPosition | null;
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

/** A radio button's accessible name: its group's, then the option it stands for. */
const radioLabel = (group: string, option: string): string =>
  option === '' ? group : `${group}: ${option}`;

/**
 * Project one widget of a field into a fill control; `fillable`: the user may
 * fill the field in (a signature field: sign it); `inGroup`: where a radio
 * button comes among its group's. Null for kinds with no fill control.
 */
export function projectWidget(
  field: FormField,
  annotObjectNumber: number,
  widget: PageWidget,
  fillable: boolean,
  inGroup: GroupPosition | null = null,
): FormWidgetItem | null {
  const key = fieldKeyOf(field);
  const base: FormWidgetItemBase = {
    key,
    fieldRef: field.ref,
    annotObjectNumber,
    annotationRef:
      field.widgets.find((candidate) => candidate.objectNumber === annotObjectNumber)?.ref ?? null,
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
      const exportValue = toggle && 'exportValue' in toggle ? toggle.exportValue : '';
      return {
        ...base,
        label: radioLabel(base.label, exportValue),
        control: 'toggle',
        kind: 'radio',
        checked: toggle && 'checked' in toggle ? toggle.checked : false,
        exportValue,
        inGroup,
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
 * Project one page's widgets into fill controls, each disabled when the user
 * may not fill its field in, or sign it (`mayFill`), each radio button with
 * where it comes in its group (`groupPositionOf`). Widgets whose page has not loaded (or
 * that are direct objects with no join key) are skipped; the projection runs
 * again when the page's widgets land.
 */
export function fillItems(
  index: FieldIndex,
  pageObjectNumber: number,
  widgets: PageWidgets | undefined,
  mayFill: (field: FormField) => boolean,
  groupPositionOf: (widget: number) => GroupPosition | null = () => null,
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
        mayFill(field),
        groupPositionOf(widget.objectNumber),
      );
      if (item) items.push(item);
    }
  }
  return items;
}
