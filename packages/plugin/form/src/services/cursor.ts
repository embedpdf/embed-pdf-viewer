/**
 * The cursor among the fields: the box it's in, the controls it can go into, and putting it in
 * one. The plugin decides where the cursor goes (`write/focus.ts`); the box's control takes it.
 * The form layer lends a focus target for each box on screen (`attach`), a browser's from
 * `@embedpdf/web`, a native shell's its own. A box on a page that isn't on screen is brought into
 * view through the Stage first, and takes the cursor when its control arrives; asked for and not
 * there within two seconds, it never does, so a late page can't take the cursor from wherever the
 * user went meanwhile.
 *
 * Not every box has a control: a signature field with nothing to sign it is only its picture.
 * Its target says it takes no cursor (`takesCursor`), and the cursor passes over a box on screen
 * that says so, and over one that said yes and then took none (`focus` answers `false`). A box
 * that isn't on screen can't say: it is asked for like any other, and when it comes in holding
 * nothing, the cursor goes on from it (`onward`).
 *
 * The box the cursor is in follows the controls' focus and blur (`notifyWidgetEvent`). A blur
 * counts only when no focus follows in the same turn, so moving between fields is one change.
 */
import type { Mirror } from '@embedpdf/core';
import type { AnnotationRef, FormFieldRef, WidgetAnnotation } from '@embedpdf/engine-core/runtime';
import { StageToken } from '@embedpdf/plugin-stage/contract';

import type { FormFocusTarget } from '../host-contract';
import {
  fieldByKey,
  fieldByRef,
  fieldKeyOf,
  widgetRowOf,
  type FieldIndex,
  type FocusedWidget,
} from '../model';
import { widgetObjectOf } from '../read/fields';
import type { FormContext } from './context';
import type { FormEvents } from './events';

/** How long a box asked for keeps its claim on the cursor while its page comes in. */
const PENDING_MS = 2000;

/** A box asked for that isn't on screen yet. */
interface Pending {
  readonly widget: number;
  readonly select: boolean;
  /** Where the cursor goes if the box comes in holding nothing to focus. */
  readonly onward: (() => void) | null;
  /** Ends the wait for its page. */
  readonly expire: () => void;
  /** Ends the turn a box that came in with nothing to focus is given, while it has one. */
  settle: (() => void) | null;
}

/** Whether a control takes the cursor: every one that doesn't say it takes none. */
const takes = (target: FormFocusTarget): boolean => target.takesCursor?.() ?? true;

/** Put the cursor in a control. `false` when it takes none: it says so, or nothing in it took it. */
const enter = (target: FormFocusTarget, select: boolean): boolean =>
  takes(target) && target.focus({ select }) !== false;

/** What became of a move to a box. */
export type CursorMove =
  /** The cursor is in the box, or goes in when its control arrives. */
  | 'taken'
  /** Its control takes no cursor: the move passes over the box. */
  | 'declined'
  /** It isn't on screen, and no Stage can bring it in. */
  | 'unreachable';

export interface FormCursor {
  /** The box the cursor is in: its field and its annotation object number. */
  focused(): FocusedWidget | null;
  /** The box the cursor was in last, also once it left the fields: where `focusNext()` goes on from. */
  last(): number | null;
  /** A control's focus or blur, as the form layer reports it. */
  note(event: 'focus' | 'blur', field: FormFieldRef, widget: AnnotationRef): void;
  /**
   * Bring a box into view and put the cursor in it: now if its control is there, else when it
   * comes. A box on screen whose control says it takes no cursor is declined before the view
   * moves. `onward` runs if the box comes in holding nothing to focus: where the cursor goes
   * instead.
   */
  goTo(row: WidgetAnnotation, select: boolean, onward?: () => void): CursorMove;
  /** A box's control, lent while it's on screen. Returns the call that takes it back. */
  attach(widget: AnnotationRef, target: FormFocusTarget): () => void;
}

export function createCursor(
  ctx: FormContext,
  fields: Mirror<FieldIndex>,
  events: FormEvents,
): FormCursor {
  const targets = new Map<number, FormFocusTarget>();
  let pending: Pending | null = null;
  let leaving: (() => void) | null = null;
  let last: number | null = null;

  const setFocused = (next: FocusedWidget | null) => {
    const previous = ctx.state.get().focused;
    if (previous?.widget === next?.widget && previous?.field === next?.field) return;
    ctx.state.update((state) => ({ ...state, focused: next }));
    const field = next ? fieldByKey(fields.view(), next.field) : null;
    const row = next ? widgetRowOf(fields.view(), next.widget) : null;
    events.focusChanged.emit({ field, widget: row?.ref ?? null });
  };

  const clearPending = () => {
    pending?.expire();
    pending?.settle?.();
    pending = null;
  };

  /**
   * A box asked for came in holding nothing to focus. It is given the turn to draw what does (a
   * control of an app's own may render after its box), and if nothing in it takes the cursor
   * then, the cursor goes on.
   */
  const settleLater = (waiting: Pending) => {
    waiting.settle ??= ctx.clock.after(0, () => {
      waiting.settle = null;
      if (pending !== waiting) return;
      const now = targets.get(waiting.widget);
      // Gone again within the turn: it's still awaited.
      if (!now) return;
      clearPending();
      if (!enter(now, waiting.select)) waiting.onward?.();
    });
  };

  /** The box asked for has come in: its control takes the cursor, or gets its turn to. */
  const arrive = (waiting: Pending, target: FormFocusTarget) => {
    if (!enter(target, waiting.select)) settleLater(waiting);
    else if (pending === waiting) clearPending();
  };

  return {
    focused: () => ctx.state.get().focused,
    last: () => last,
    note(event, fieldRef, widgetRef) {
      const widget = widgetObjectOf(widgetRef);
      if (event === 'focus') {
        leaving?.();
        leaving = null;
        // The user went to another box meanwhile: the one asked for doesn't take the cursor.
        if (pending && pending.widget !== widget) clearPending();
        const field = fieldByRef(fields.view(), fieldRef);
        last = widget;
        setFocused(field ? { field: fieldKeyOf(field), widget } : null);
      } else if (ctx.state.get().focused?.widget === widget) {
        leaving?.();
        leaving = ctx.clock.after(0, () => {
          leaving = null;
          setFocused(null);
        });
      }
    },
    goTo(row, select, onward) {
      const widget = widgetObjectOf(row.ref);
      const shown = targets.get(widget);
      // On screen, and it says it holds nothing to focus: the view stays where it is.
      if (shown && !takes(shown)) return 'declined';
      const stage = ctx.tryGet(StageToken);
      stage?.reveal(row.page, { rect: row.rect });
      clearPending();
      // Read again: a host may draw the box, and lend its control, as the view moves.
      const target = targets.get(widget);
      if (target && enter(target, select)) return 'taken';
      // It was on screen, said it takes the cursor, and nothing in it did.
      if (target && target === shown) return 'declined';
      if (!stage) return 'unreachable';
      const waiting: Pending = {
        widget,
        select,
        onward: onward ?? null,
        expire: ctx.clock.after(PENDING_MS, () => {
          if (pending === waiting) clearPending();
        }),
        settle: null,
      };
      pending = waiting;
      // Lent as the view moved, with nothing to focus yet: it gets its turn, as one that comes later.
      if (target) settleLater(waiting);
      return 'taken';
    },
    attach(widgetRef, target) {
      const widget = widgetObjectOf(widgetRef);
      targets.set(widget, target);
      if (pending?.widget === widget) arrive(pending, target);
      return () => {
        if (targets.get(widget) === target) targets.delete(widget);
      };
    },
  };
}
