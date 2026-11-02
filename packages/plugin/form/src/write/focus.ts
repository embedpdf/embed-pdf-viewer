/**
 * Moving the cursor between fields: `focus()`, `focusNext()` (what Tab does), the arrow keys in a
 * radio group, and the field the cursor is in. This area decides where the cursor goes: which
 * field, which of its boxes, in Tab's order (the engine's `tabOrderOf()`); the cursor service
 * (`services/cursor.ts`) brings the box into view and hands it to its control.
 */
import { memo } from '@embedpdf/core';
import {
  tabOrderOf,
  type AnnotationRef,
  type FormFieldDTO,
  type FormFieldRef,
  type WidgetAnnotation,
} from '@embedpdf/engine-core/runtime';

import type { FormCapability, FormFocusNextOptions, FormFocusOptions } from '../contract';
import type { FormHostCapability } from '../host-contract';
import {
  fieldByKey,
  fieldByRef,
  fieldForWidget,
  fieldKeyOf,
  shownOnScreen,
  widgetRowOf,
} from '../model';
import { isEmpty, widgetObjectOf } from '../read/fields';
import type { FormContext, FormServices } from '../services';

/** A place Tab stops at: a box, the field it belongs to, and where it comes in Tab's order. */
interface Stop {
  readonly row: WidgetAnnotation;
  readonly field: FormFieldDTO;
  readonly at: number;
}

/** A radio button as its field lists it: whether it's the checked one, and the value it picks. */
const radioButtonOf = (field: FormFieldDTO, widget: number) =>
  field.family === 'radio'
    ? (field.widgets.find((candidate) => candidate.objectNumber === widget) ?? null)
    : null;

export function createFocus(
  ctx: FormContext,
  { fields, rights, events, cursor }: Pick<FormServices, 'fields' | 'rights' | 'events' | 'cursor'>,
  fill: Pick<FormCapability, 'setValue' | 'activateWidget'>,
) {
  /** Every box that shows, in Tab's order, and the ones Tab stops at. */
  const order = memo(
    () => [fields.view(), ctx.document()?.pages, rights.key(), ctx.settings().get().fillable],
    (index, pages) => {
      const rows = tabOrderOf((index.snapshot?.widgets ?? []).filter(shownOnScreen), pages ?? []);
      const position = new Map<number, number>();
      const stops: Stop[] = [];
      const groups = new Set<string>();
      rows.forEach((row, at) => {
        const widget = widgetObjectOf(row.ref);
        position.set(widget, at);
        const field = fieldForWidget(index, widget);
        if (!field || !rights.takesInput(field)) return;
        // A radio group is one stop on each page it shows on, where its first button is.
        if (field.family === 'radio') {
          const group = `${fieldKeyOf(field)}@${row.page.objectNumber}`;
          if (groups.has(group)) return;
          groups.add(group);
        }
        stops.push({ row, field, at });
      });
      return { rows, position, stops };
    },
  );

  /** The buttons of a radio group, in Tab's order; on one page, with `page`. */
  const buttonsOf = (field: FormFieldDTO, page?: number): WidgetAnnotation[] =>
    order().rows.filter(
      (row) =>
        (page === undefined || row.page.objectNumber === page) &&
        fieldForWidget(fields.view(), widgetObjectOf(row.ref)) === field,
    );

  /**
   * The box that takes the cursor at a stop: a radio group's checked button on that page, else
   * its first, or its last when Shift+Tab comes to it from after it.
   */
  const boxAt = (stop: Stop, backward: boolean): WidgetAnnotation => {
    if (stop.field.family !== 'radio') return stop.row;
    const buttons = buttonsOf(stop.field, stop.row.page.objectNumber);
    const checked = buttons.find(
      (button) => radioButtonOf(stop.field, widgetObjectOf(button.ref))?.checked,
    );
    return checked ?? (backward ? (buttons.at(-1) ?? stop.row) : stop.row);
  };

  const focus = (ref: FormFieldRef, options: FormFocusOptions = {}): boolean => {
    const index = fields.view();
    const field = fieldByRef(index, ref);
    if (!field || !rights.takesInput(field)) return false;
    let row: WidgetAnnotation | undefined;
    if (options.widget) {
      const widget = widgetObjectOf(options.widget);
      if (fieldForWidget(index, widget) !== field) return false;
      row = order().rows.find((candidate) => widgetObjectOf(candidate.ref) === widget);
    } else {
      const stop = order().stops.find((candidate) => candidate.field === field);
      row = stop && boxAt(stop, false);
    }
    return row ? cursor.goTo(row, options.select ?? false) : false;
  };

  const focusNext = (options: FormFocusNextOptions = {}): boolean => {
    const index = fields.view();
    const { position, stops } = order();
    const backward = options.backward ?? false;
    // Where it goes on from: the field's first box, the box the cursor is in, or the one it was in last.
    const fromField = options.from ? fieldByRef(index, options.from) : null;
    const from = options.from
      ? (fromField?.widgets.map(({ objectNumber }) => objectNumber).find((w) => position.has(w)) ??
        null)
      : (cursor.focused()?.widget ?? cursor.last());
    const at = from === null ? null : (position.get(from) ?? null);
    const field = from === null ? null : fieldForWidget(index, from);
    const page = from === null ? null : widgetRowOf(index, from)?.page.objectNumber;
    const candidates = stops.filter(
      (stop) =>
        (!options.empty || isEmpty(stop.field)) &&
        // A radio group is one stop: from one of its buttons, the group is where the cursor is.
        !(stop.field === field && field.family === 'radio' && stop.row.page.objectNumber === page),
    );
    const ahead = candidates.filter((stop) =>
      at === null ? true : backward ? stop.at < at : stop.at > at,
    );
    const next =
      (backward ? ahead.at(-1) : ahead[0]) ??
      (options.wrap ? (backward ? candidates.at(-1) : candidates[0]) : undefined);
    // Tab selects a text box's text, so typing replaces it.
    return next ? cursor.goTo(boxAt(next, backward), true) : false;
  };

  const moveInGroup = (ref: AnnotationRef, backward: boolean): boolean => {
    const widget = widgetObjectOf(ref);
    const field = fieldForWidget(fields.view(), widget);
    if (!field || field.family !== 'radio' || !rights.takesInput(field)) return false;
    const buttons = buttonsOf(field);
    const here = buttons.findIndex((row) => widgetObjectOf(row.ref) === widget);
    if (here < 0 || buttons.length < 2) return false;
    const next = buttons[(here + (backward ? buttons.length - 1 : 1)) % buttons.length]!;
    if (!cursor.goTo(next, false)) return false;
    // As a click on it: the value first, then its action (Acrobat's order).
    const button = radioButtonOf(field, widgetObjectOf(next.ref));
    if (button) {
      const activate = () => void fill.activateWidget(next.ref).catch(() => {});
      void fill.setValue(field.ref, { value: button.exportValue }).then(activate, activate);
    }
    return true;
  };

  const getFocusedField = memo(
    () => [fields.view(), cursor.focused()],
    (index, focused): FormFieldDTO | null => (focused ? fieldByKey(index, focused.field) : null),
  );

  return {
    api: {
      focus,
      focusNext,
      getFocusedField,
      onFocusChanged: events.focusChanged.on,
      moveInGroup,
      attachFocusTarget: cursor.attach,
    } satisfies Partial<FormHostCapability>,
  };
}
