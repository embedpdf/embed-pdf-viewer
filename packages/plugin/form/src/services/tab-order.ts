/**
 * The order Tab visits the widgets in: every widget that shows, page by page in the document's
 * order, each page by its own tab order (the engine's `tabOrderOf()`). The cursor goes this way
 * (`write/focus.ts`), and so do the arrow keys round a radio group's buttons, so a button's
 * place among its group's is its place in this order.
 */
import { memo, type Mirror } from '@embedpdf/core';
import { tabOrderOf, type WidgetAnnotation } from '@embedpdf/engine-core/runtime';

import {
  fieldForWidget,
  fieldKeyOf,
  shownOnScreen,
  type FieldIndex,
  type FieldKey,
} from '../model';
import { widgetObjectOf } from '../read/fields';
import type { GroupPosition } from '../read/fill-items';
import type { FormContext } from './context';

export interface TabOrder {
  /** Every widget that shows, in Tab's order. */
  rows(): readonly WidgetAnnotation[];
  /**
   * Where a radio button comes among its group's buttons that show, in Tab's order: the order the
   * arrow keys go round. Null for any other widget, and for one that doesn't show.
   */
  groupPositionOf(widget: number): GroupPosition | null;
}

export function createTabOrder(ctx: FormContext, fields: Mirror<FieldIndex>): TabOrder {
  const rows = memo(
    () => [fields.view(), ctx.document()?.pages],
    (index, pages) =>
      tabOrderOf((index.snapshot?.widgets ?? []).filter(shownOnScreen), pages ?? []),
  );

  const groupPositions = memo(
    () => [fields.view(), rows()],
    (index, ordered) => {
      const buttons = new Map<FieldKey, number[]>();
      for (const row of ordered) {
        const widget = widgetObjectOf(row.ref);
        const field = fieldForWidget(index, widget);
        if (field?.kind !== 'radio') continue;
        const key = fieldKeyOf(field);
        const group = buttons.get(key);
        if (group) group.push(widget);
        else buttons.set(key, [widget]);
      }
      const positions = new Map<number, GroupPosition>();
      for (const group of buttons.values()) {
        group.forEach((widget, at) => {
          positions.set(widget, { position: at + 1, size: group.length });
        });
      }
      return positions;
    },
  );

  return {
    rows,
    groupPositionOf: (widget) => groupPositions().get(widget) ?? null,
  };
}
