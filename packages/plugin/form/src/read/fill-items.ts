/**
 * The fill projection: what a framework paints for one page. Pure data in
 * content space (top-left origin, y-down PDF points), the same space
 * annotation render items use, so layers position with the page transform
 * and never re-derive scale.
 *
 * Geometry comes from the widget plane (widgets are annotations; their
 * records carry `/Rect`), identity, value and behavior from the field plane.
 */
import type { AnnotationRef, FormFieldDTO, FormFieldOption, FormFieldRef } from '@embedpdf/engine-core/runtime';

import {
  fieldForWidget,
  fieldKeyOf,
  type Box,
  type FieldIndex,
  type FieldKey,
  type FormState,
  type WidgetBoxes,
} from '../model';

export type { Box } from '../model';

interface FillItemBase {
  key: FieldKey;
  /** The field this widget belongs to — what the public write verbs take. */
  fieldRef: FormFieldRef;
  /** Widget identity — joins to the annotation plane. */
  annotObjectNumber: number;
  /** The widget's annotation address (null until the engine has placed it). */
  annotationRef: AnnotationRef | null;
  box: Box;
  /** Read-only field or write in flight: render, don't accept input. */
  disabled: boolean;
  /** Accessible name: /TU when present, else the fully qualified name. */
  label: string;
}

export type FillItem = FillItemBase &
  (
    | {
        control: 'text';
        value: string;
        multiline: boolean;
        password: boolean;
        maxLength: number | null;
        comb: boolean;
      }
    | { control: 'toggle'; kind: 'checkbox' | 'radio'; checked: boolean; onState: string }
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
     * A signature field's widget. `signed` = it carries a `/V` (a signature
     * dictionary): the field is final and its appearance sealed — the
     * control inspects rather than signs. Unsigned: "sign here" — the
     * signing act itself belongs to the signature plugin.
     */
    | { control: 'signature'; signed: boolean }
  );

const ZERO_BOX: Box = { x: 0, y: 0, width: 0, height: 0 };

/**
 * Project one widget of a field into a fill control. `box` is supplied by the
 * caller: the page projection reads the page's widget geometry; a consumer
 * that already owns a live box (the annotation plane's render item) passes
 * it, or nothing when only the semantics matter. Null for families with no
 * fill control (those are rendered by the annotation plane only).
 */
export function projectWidget(
  field: FormFieldDTO,
  annotObjectNumber: number,
  writing: FormState['writing'],
  box: Box = ZERO_BOX,
): FillItem | null {
  const key = fieldKeyOf(field);
  const base: FillItemBase = {
    key,
    fieldRef: field.ref,
    annotObjectNumber,
    annotationRef:
      field.widgets.find((widget) => widget.annotObjectNumber === annotObjectNumber)?.ref ?? null,
    box,
    disabled: field.flags.readOnly || writing[key] === true,
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
      const toggle = field.widgets.find((widget) => widget.annotObjectNumber === annotObjectNumber);
      return {
        ...base,
        control: 'toggle',
        kind: 'checkbox',
        checked: field.checked,
        onState: toggle && 'onState' in toggle ? toggle.onState : 'Yes',
      };
    }
    case 'radio': {
      const toggle = field.widgets.find((widget) => widget.annotObjectNumber === annotObjectNumber);
      return {
        ...base,
        control: 'toggle',
        kind: 'radio',
        checked: toggle && 'checked' in toggle ? toggle.checked : false,
        onState: toggle && 'onState' in toggle ? toggle.onState : '',
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
 * Project one page's widgets into fill controls. Widgets whose geometry has
 * not loaded (or that are direct objects with no join key) are skipped; the
 * projection re-runs when the page's geometry lands.
 */
export function fillItems(
  index: FieldIndex,
  pageObjectNumber: number,
  boxes: WidgetBoxes | undefined,
  writing: FormState['writing'],
): FillItem[] {
  if (!index.snapshot || !boxes) return [];
  const items: FillItem[] = [];
  for (const field of index.snapshot.fields) {
    for (const widget of field.widgets) {
      if (widget.page?.pageObjectNumber !== pageObjectNumber) continue;
      const box = boxes[widget.annotObjectNumber];
      if (!box) continue;
      const item = projectWidget(field, widget.annotObjectNumber, writing, box);
      if (item) items.push(item);
    }
  }
  return items;
}

/**
 * Project a single widget by its annotation object number, the join the
 * annotation plane's render layer uses. It owns a live box already, so the
 * page's loaded geometry is used only when available; the item's semantics
 * never depend on it. Null while the fields have not loaded, or for families
 * with no fill control.
 */
export function fillItemForWidget(
  index: FieldIndex,
  annotObjectNumber: number,
  box: Box | undefined,
  writing: FormState['writing'],
): FillItem | null {
  const field = fieldForWidget(index, annotObjectNumber);
  if (!field) return null;
  if (!field.widgets.some((widget) => widget.annotObjectNumber === annotObjectNumber)) return null;
  return projectWidget(field, annotObjectNumber, writing, box);
}

