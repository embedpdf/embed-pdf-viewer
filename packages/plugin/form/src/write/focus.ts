/**
 * Moving the cursor between fields: `focus()`, `focusNext()` (what Tab does), the arrow keys in a
 * radio group, and the field the cursor is in. This area decides where the cursor goes: which
 * field, which of its boxes, in Tab's order (`services/tab-order.ts`); the cursor service
 * (`services/cursor.ts`) brings the box into view and hands it to its control.
 *
 * A stop is a box of a field the user may fill in. The cursor passes over one whose control
 * takes no cursor (`cursor.goTo` declines it): a signature field with nothing to sign it. Stops
 * are tried in the order Tab comes to them, so a move asks only the ones it reaches.
 *
 * A radio group is one stop on each page it shows on, where its first button comes in Tab's
 * order. The button that takes the cursor may come later in that order, with other fields
 * before it. From any of its buttons the cursor goes on from the group's stop, so Tab takes
 * what comes after the group and Shift+Tab what comes before it, each field once.
 */
import { memo } from '@embedpdf/core';
import type {
  AnnotationRef,
  FormField,
  FormFieldRef,
  WidgetAnnotation,
} from '@embedpdf/engine-core/runtime';

import type { FormCapability, FormFocusNextOptions, FormFocusOptions } from '../contract';
import type { FormHostCapability } from '../host-contract';
import { fieldByKey, fieldByRef, fieldForWidget, fieldKeyOf, widgetRowOf } from '../model';
import { isEmpty, widgetObjectOf } from '../read/fields';
import type { FormContext, FormServices } from '../services';

/** A place Tab stops at: a box, the field it belongs to, and where it comes in Tab's order. */
interface Stop {
  readonly row: WidgetAnnotation;
  readonly field: FormField;
  readonly at: number;
}

/** How `focusNext()` moves, each of its options given. */
interface Step {
  readonly backward: boolean;
  readonly empty: boolean;
  readonly wrap: boolean;
}

const NO_STOPS: ReadonlySet<number> = new Set();

/** A radio button as its field lists it: whether it's the checked one, and the value it picks. */
const radioButtonOf = (field: FormField, widget: number) =>
  field.kind === 'radio'
    ? (field.widgets.find((candidate) => candidate.objectNumber === widget) ?? null)
    : null;

export function createFocus(
  ctx: FormContext,
  {
    fields,
    rights,
    events,
    cursor,
    tabOrder,
  }: Pick<FormServices, 'fields' | 'rights' | 'events' | 'cursor' | 'tabOrder'>,
  fill: Pick<FormCapability, 'setValue' | 'activateWidget'>,
) {
  /** Every box that shows, in Tab's order, and the ones Tab stops at. */
  const order = memo(
    () => [fields.view(), tabOrder.rows(), rights.key(), ctx.settings().get().fillable],
    (index, rows) => {
      const position = new Map<number, number>();
      const stops: Stop[] = [];
      const groups = new Set<string>();
      rows.forEach((row, at) => {
        const widget = widgetObjectOf(row.ref);
        position.set(widget, at);
        const field = fieldForWidget(index, widget);
        if (!field || !rights.takesInput(field)) return;
        // A radio group is one stop on each page it shows on, where its first button is.
        if (field.kind === 'radio') {
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
  const buttonsOf = (field: FormField, page?: number): WidgetAnnotation[] =>
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
    if (stop.field.kind !== 'radio') return stop.row;
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
    const select = options.select ?? false;
    if (options.widget) {
      const widget = widgetObjectOf(options.widget);
      if (fieldForWidget(index, widget) !== field) return false;
      const row = order().rows.find((candidate) => widgetObjectOf(candidate.ref) === widget);
      return row ? cursor.goTo(row, select) === 'taken' : false;
    }
    // The field's first stop that takes the cursor.
    for (const stop of order().stops) {
      if (stop.field !== field) continue;
      const move = cursor.goTo(boxAt(stop, false), select);
      if (move !== 'declined') return move === 'taken';
    }
    return false;
  };

  /**
   * Move the cursor to the next stop after a box (`from`; `null`: from the start), as Tab does:
   * the first one on the way that takes the cursor. A radio button's place is its group's stop.
   * `passed` are the stops this move already asked for and that came in holding nothing to focus.
   */
  const step = (
    from: number | null,
    how: Step,
    passed: ReadonlySet<number> = NO_STOPS,
  ): boolean => {
    const { backward, empty, wrap } = how;
    const index = fields.view();
    const { position, stops } = order();
    const field = from === null ? null : fieldForWidget(index, from);
    const page = from === null ? null : widgetRowOf(index, from)?.page.objectNumber;
    // A radio group is one stop: from one of its buttons, the group is where the cursor is.
    const group =
      field?.kind === 'radio'
        ? stops.find((stop) => stop.field === field && stop.row.page.objectNumber === page)
        : undefined;
    // The cursor goes on from the box's place in Tab's order, and from a radio button from its
    // group's stop: the button may come later, with other fields between.
    const own = from === null ? undefined : position.get(from);
    const at = own === undefined ? null : (group?.at ?? own);
    const candidates = stops.filter(
      (stop) =>
        (!empty || isEmpty(stop.field)) &&
        stop !== group &&
        !passed.has(widgetObjectOf(stop.row.ref)),
    );
    const isAhead = (stop: Stop) => (at === null ? true : backward ? stop.at < at : stop.at > at);
    const ahead = candidates.filter(isAhead);
    const round = wrap ? candidates.filter((stop) => !isAhead(stop)) : [];
    // The way Tab comes to them: what lies ahead, then, with `wrap`, round from the other end.
    const way = backward ? [...ahead.reverse(), ...round.reverse()] : [...ahead, ...round];
    for (const stop of way) {
      const here = widgetObjectOf(stop.row.ref);
      // A box that isn't on screen may come in holding nothing to focus. The cursor then goes on
      // from this stop the same way. A stop is asked for once in a move, so a move can't go
      // round a form of such boxes.
      const onward = () => void step(here, how, new Set([...passed, here]));
      // Tab selects a text box's text, so typing replaces it.
      const move = cursor.goTo(boxAt(stop, backward), true, onward);
      if (move !== 'declined') return move === 'taken';
    }
    return false;
  };

  const focusNext = (options: FormFocusNextOptions = {}): boolean => {
    const { position } = order();
    // Where it goes on from: the field's first box, the box the cursor is in, or the one it was in last.
    const fromField = options.from ? fieldByRef(fields.view(), options.from) : null;
    const from = options.from
      ? (fromField?.widgets.map(({ objectNumber }) => objectNumber).find((w) => position.has(w)) ??
        null)
      : (cursor.focused()?.widget ?? cursor.last());
    return step(from, {
      backward: options.backward ?? false,
      empty: options.empty ?? false,
      wrap: options.wrap ?? false,
    });
  };

  const moveInGroup = (ref: AnnotationRef, backward: boolean): boolean => {
    const widget = widgetObjectOf(ref);
    const field = fieldForWidget(fields.view(), widget);
    if (!field || field.kind !== 'radio' || !rights.takesInput(field)) return false;
    const buttons = buttonsOf(field);
    const here = buttons.findIndex((row) => widgetObjectOf(row.ref) === widget);
    if (here < 0 || buttons.length < 2) return false;
    const next = buttons[(here + (backward ? buttons.length - 1 : 1)) % buttons.length]!;
    if (cursor.goTo(next, false) !== 'taken') return false;
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
    (index, focused): FormField | null => (focused ? fieldByKey(index, focused.field) : null),
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
