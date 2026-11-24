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
 * each says where it comes in the group itself (`inGroup`). A field of a group the app gave a
 * label (`setGroups()`) says whose it is last: `Signature, Dana Smith`.
 *
 * A widget's `accent` is its group's color, and how strongly it shows, while the session fills
 * the field in: the form layer shows it as a light fill and an edge, and never writes it into
 * the PDF.
 */
import type { RecordAccent } from '@embedpdf/core-annotation';
import type {
  AnnotationRef,
  FormField,
  FormFieldOption,
  FormFieldRef,
} from '@embedpdf/engine-core/runtime';

import { isEmpty } from './fields';
import type { GroupLook } from '../services/groups';
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
  /**
   * What the box shows its group in: the group's color, a CSS color, and how strongly it shows
   * (the `fields.tint` setting), while the session may fill the field in and the field still
   * takes a value (it isn't a push button, read-only, nor a signed signature). `null`
   * otherwise, for a field in no group, and while the tint is `0`: the box shows as the PDF has
   * it. The same shape a lent field has on the annotation layer.
   */
  accent: RecordAccent | null;
  /** How the widget looks in the PDF. */
  look: FormWidgetLook;
  /** A read-only field, no permission to fill, filling it turned off (`fillable`), or a write on its way: draw it, don't take input. */
  disabled: boolean;
  /**
   * Accessible name: the field's tooltip (`/TU`) when it has one, else its full name. A radio
   * button adds the option it stands for, its export value: `Plan: monthly`. A field of a group
   * the app gives a label says whose it is last: `Plan: monthly, Dana Smith`.
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

/** A box's accessible name, then whose field it is, when the app says who the group is. */
const ownedLabel = (name: string, owner: string | null): string =>
  owner === null ? name : `${name}, ${owner}`;

/**
 * Whether the field still takes a value: it holds one (a push button doesn't), it isn't
 * read-only, nor a signed signature.
 */
const takesValue = (field: FormField): boolean =>
  field.kind !== 'pushbutton' &&
  !field.readOnly &&
  !(field.kind === 'signature' && field.valueEntry.kind !== 'none');

/**
 * Project one widget of a field into a fill control. `fillable`: people fill
 * the field in by hand (a signature field: sign it), which the box is
 * `disabled` without; `canFill`: the session's permission alone, which the
 * `fillable` setting doesn't change; `inGroup`: where a radio button comes
 * among its group's; `group`: how the field's group shows, `null` for a field
 * in none. Null for kinds with no fill control.
 */
export function projectWidget(
  field: FormField,
  annotObjectNumber: number,
  widget: PageWidget,
  fillable: boolean,
  canFill: boolean,
  inGroup: GroupPosition | null = null,
  group: GroupLook | null = null,
): FormWidgetItem | null {
  const key = fieldKeyOf(field);
  const owner = group?.label ?? null;
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
    accent: canFill && takesValue(field) ? (group?.accent ?? null) : null,
    box: widget.box,
    rotation: widget.rotation,
    rect: widget.rect,
    look: widget.look,
    disabled: field.readOnly || !fillable,
    label: ownedLabel(field.alternateName ?? field.name, owner),
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
        label: ownedLabel(radioLabel(field.alternateName ?? field.name, exportValue), owner),
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
 * Project one page's widgets into fill controls, each disabled when people
 * don't fill its field in by hand (`mayFillByHand`), each saying whether the
 * session may fill it in, or sign it (`mayFill`, its permissions alone), and
 * each radio button with where it comes in its group (`groupPositionOf`),
 * and each with how its field's group shows (`groupLookOf`).
 * Widgets whose page has not loaded (or that are direct objects with no join
 * key) are skipped; the projection runs again when the page's widgets land.
 */
export function fillItems(
  index: FieldIndex,
  pageObjectNumber: number,
  widgets: PageWidgets | undefined,
  mayFillByHand: (field: FormField) => boolean,
  mayFill: (field: FormField) => boolean,
  groupPositionOf: (widget: number) => GroupPosition | null = () => null,
  groupLookOf: (groupId: string) => GroupLook | null = () => null,
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
        groupPositionOf(widget.objectNumber),
        field.groupId === null ? null : groupLookOf(field.groupId),
      );
      if (item) items.push(item);
    }
  }
  return items;
}
