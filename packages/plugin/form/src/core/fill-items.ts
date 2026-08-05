/**
 * The fill-mode projection: what a framework paints for one page. Pure data
 * in CONTENT space (top-left origin, y-down PDF points) — the same space
 * annotation RenderItems use, so layers position with the page transform
 * and never re-derive scale.
 *
 * Geometry comes from the WIDGET plane: the shell reads each page's
 * annotations once (widgets are annotations; their DTOs carry /Rect) and
 * feeds content-space boxes into the model via `pageGeom`. The field plane
 * (this snapshot) contributes identity, value, and behavior.
 */
import type { FormFieldDTO, FormFieldOption, FormSnapshot } from '@embedpdf/engine-core/runtime';

import { fieldForWidget, fieldKeyOf, type Box, type FieldKey, type Model } from './model';

export type { Box } from './model';

interface FillItemBase {
  key: FieldKey;
  /** Widget identity — joins to the annotation plane. */
  annotObjectNumber: number;
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
  );

const ZERO_BOX: Box = { x: 0, y: 0, width: 0, height: 0 };

/**
 * Project ONE widget of a field into a fill control. `box` is supplied by the
 * caller: the page projection reads the model's widget geometry; a consumer
 * that already owns a live box (the annotation plane's RenderItem) passes it —
 * or nothing, when only the semantics matter. Null for families with no fill
 * control (signature/unknown: rendered by the annotation plane only).
 */
export function projectWidget(
  model: Model,
  field: FormFieldDTO,
  annotObjectNumber: number,
  box: Box = ZERO_BOX,
): FillItem | null {
  const key = fieldKeyOf(field);
  const base: FillItemBase = {
    key,
    annotObjectNumber,
    box,
    disabled: field.flags.readOnly || model.writing[key] === true,
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
      const toggle = field.widgets.find((w) => w.annotObjectNumber === annotObjectNumber);
      return {
        ...base,
        control: 'toggle',
        kind: 'checkbox',
        checked: field.checked,
        onState: toggle && 'onState' in toggle ? toggle.onState : 'Yes',
      };
    }
    case 'radio': {
      const toggle = field.widgets.find((w) => w.annotObjectNumber === annotObjectNumber);
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
    default:
      return null;
  }
}

/**
 * Project one page's widgets into fill controls. Widgets whose geometry has
 * not arrived yet (or that are direct objects with no join key) are skipped —
 * the shell re-runs the projection when `pageGeom` lands.
 */
export function fillItems(model: Model, pageObjectNumber: number): FillItem[] {
  const snapshot: FormSnapshot | null = model.snapshot;
  const geom = model.geom[pageObjectNumber];
  if (!snapshot || !geom) return [];
  const items: FillItem[] = [];

  for (const field of snapshot.fields) {
    for (const widget of field.widgets) {
      if (widget.pageObjectNumber !== pageObjectNumber) continue;
      const box = geom[widget.annotObjectNumber];
      if (!box) continue;
      const item = projectWidget(model, field, widget.annotObjectNumber, box);
      if (item) items.push(item);
    }
  }
  return items;
}

/**
 * Project a SINGLE widget by its annotation object number — the join the
 * annotation-plane render layer uses (it owns a live box already, so the
 * model's cached geometry is used only when it happens to be loaded; the
 * item's semantics never depend on it). Null while the snapshot hasn't
 * landed, or for families with no fill control.
 */
export function fillItemForWidget(model: Model, annotObjectNumber: number): FillItem | null {
  const field = fieldForWidget(model, annotObjectNumber);
  if (!field) return null;
  const widget = field.widgets.find((w) => w.annotObjectNumber === annotObjectNumber);
  if (!widget) return null;
  const box = model.geom[widget.pageObjectNumber]?.[annotObjectNumber];
  return projectWidget(model, field, annotObjectNumber, box);
}
