/**
 * The widget projection: what a framework draws for one page's fields. Pure
 * data in page space (top-left origin, y-down PDF points), the same space
 * annotation render items use, so layers position with the page transform
 * and never re-derive scale.
 *
 * Where a widget is and how it looks come from the widget plane (widgets are
 * annotations; their records carry `/Rect` and `/MK`), identity, value and
 * behavior from the field plane.
 */
import type {
  AnnotationRef,
  FormFieldDTO,
  FormFieldOption,
  FormFieldRef,
} from '@embedpdf/engine-core/runtime';

import {
  fieldKeyOf,
  type Box,
  type FieldIndex,
  type FieldKey,
  type FormState,
  type FormWidgetLook,
  type PageWidget,
  type PageWidgets,
} from '../model';

export type { Box, FormWidgetLook } from '../model';

interface FormWidgetItemBase {
  key: FieldKey;
  /** The field this widget belongs to: what the write verbs take. */
  fieldRef: FormFieldRef;
  /** The widget's annotation object number. */
  annotObjectNumber: number;
  /** The widget's annotation address (null until the engine has placed it). */
  annotationRef: AnnotationRef | null;
  /** Where the widget is on its page. */
  box: Box;
  /** How the widget looks in the PDF. */
  look: FormWidgetLook;
  /** A read-only field, no permission to fill, or a write on its way: draw it, don't take input. */
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
 * Project one widget of a field into a fill control. Null for families with
 * no fill control (the annotation plane draws those alone).
 */
export function projectWidget(
  field: FormFieldDTO,
  annotObjectNumber: number,
  writing: FormState['writing'],
  widget: PageWidget,
): FormWidgetItem | null {
  const key = fieldKeyOf(field);
  const base: FormWidgetItemBase = {
    key,
    fieldRef: field.ref,
    annotObjectNumber,
    annotationRef:
      field.widgets.find((candidate) => candidate.objectNumber === annotObjectNumber)?.ref ?? null,
    box: widget.box,
    look: widget.look,
    disabled: field.readOnly || writing[key] === true,
    label: field.alternateName ?? field.name,
  };
  switch (field.family) {
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
 * Project one page's widgets into fill controls. Widgets whose page has not
 * loaded (or that are direct objects with no join key) are skipped; the
 * projection runs again when the page's widgets land.
 */
export function fillItems(
  index: FieldIndex,
  pageObjectNumber: number,
  widgets: PageWidgets | undefined,
  writing: FormState['writing'],
): FormWidgetItem[] {
  if (!index.snapshot || !widgets) return [];
  const items: FormWidgetItem[] = [];
  for (const field of index.snapshot.fields) {
    for (const widget of field.widgets) {
      if (widget.page?.objectNumber !== pageObjectNumber) continue;
      const placed = widgets[widget.objectNumber];
      if (!placed) continue;
      const item = projectWidget(field, widget.objectNumber, writing, placed);
      if (item) items.push(item);
    }
  }
  return items;
}
