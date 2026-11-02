/**
 * The cursor among the fields: the box it's in, the controls it can go into, and putting it in
 * one. The plugin decides where the cursor goes (`write/focus.ts`); the box's control takes it.
 * The form layer lends a focus target for each box on screen (`attach`), a browser's from
 * `@embedpdf/web`, a native shell's its own. A box on a page that isn't on screen is brought into
 * view through the Stage first, and takes the cursor when its control arrives; asked for and not
 * there within two seconds, it never does, so a late page can't take the cursor from wherever the
 * user went meanwhile.
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

export interface FormCursor {
  /** The box the cursor is in: its field and its annotation object number. */
  focused(): FocusedWidget | null;
  /** The box the cursor was in last, also once it left the fields: where `focusNext()` goes on from. */
  last(): number | null;
  /** A control's focus or blur, as the form layer reports it. */
  note(event: 'focus' | 'blur', field: FormFieldRef, widget: AnnotationRef): void;
  /**
   * Bring a box into view and put the cursor in it: now if its control is there, else when it
   * comes. `false` when it isn't there and no Stage can bring it in.
   */
  goTo(row: WidgetAnnotation, select: boolean): boolean;
  /** A box's control, lent while it's on screen. Returns the call that takes it back. */
  attach(widget: AnnotationRef, target: FormFocusTarget): () => void;
}

export function createCursor(
  ctx: FormContext,
  fields: Mirror<FieldIndex>,
  events: FormEvents,
): FormCursor {
  const targets = new Map<number, FormFocusTarget>();
  let pending: { widget: number; select: boolean; expire: () => void } | null = null;
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
    pending = null;
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
    goTo(row, select) {
      const widget = widgetObjectOf(row.ref);
      const stage = ctx.tryGet(StageToken);
      stage?.reveal(row.page, { rect: row.rect });
      clearPending();
      const target = targets.get(widget);
      if (target) {
        target.focus({ select });
        return true;
      }
      if (!stage) return false;
      const expire = ctx.clock.after(PENDING_MS, () => {
        if (pending?.widget === widget) pending = null;
      });
      pending = { widget, select, expire };
      return true;
    },
    attach(widgetRef, target) {
      const widget = widgetObjectOf(widgetRef);
      targets.set(widget, target);
      if (pending?.widget === widget) {
        const { select } = pending;
        clearPending();
        target.focus({ select });
      }
      return () => {
        if (targets.get(widget) === target) targets.delete(widget);
      };
    },
  };
}
