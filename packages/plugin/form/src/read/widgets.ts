/**
 * The widget plane's reads: per-page widget geometry (the `widgetBoxes`
 * mirror), the fill projection with session authority fused in, and the
 * widget hit test.
 */
import { memoByKey } from '@embedpdf/core';
import type { PageRef } from '@embedpdf/engine-core/runtime';

import type { FormHostCapability } from '../host-contract';
import { boxContains, fieldForWidget, widgetAt, type Box, type WidgetHit } from '../model';
import type { FormContext, FormServices } from '../services';
import { fillItemForWidget, fillItems, type FillItem } from './fill-items';

export function createWidgetReads(
  ctx: FormContext,
  {
    fields,
    widgetBoxes,
    authority,
    siblings,
  }: Pick<FormServices, 'fields' | 'widgetBoxes' | 'authority' | 'siblings'>,
) {
  const annotationHost = siblings.annotation;
  const loadBoxes = (page: PageRef): Promise<void> =>
    widgetBoxes.ensureLoaded(page).catch(() => {
      /* the failure is reported through the page's status */
    });

  /**
   * The widget under a page point. Uses the page's loaded geometry, starting
   * its load when missing; until it lands, falls back to the annotation
   * plane's live boxes, which are loaded for the whole document, so a first
   * click on a page already resolves.
   */
  const getWidgetAt = (page: PageRef, point: { x: number; y: number }): WidgetHit | null => {
    const boxes = widgetBoxes.get(page);
    if (boxes) return widgetAt(fields.get(), boxes, point);
    void loadBoxes(page);
    if (!annotationHost) return null;
    let best: WidgetHit | null = null;
    for (const item of annotationHost.listPageItems(page)) {
      if (!item.subtype.startsWith('widget') || item.ref?.kind !== 'objectNumber') continue;
      if (!boxContains(item.box, point)) continue;
      const field = fieldForWidget(fields.get(), item.ref.annotObjectNumber);
      if (!field) continue;
      if (!best || item.box.width * item.box.height < best.box.width * best.box.height) {
        best = { annotObjectNumber: item.ref.annotObjectNumber, field, box: item.box };
      }
    }
    return best;
  };

  // Session fill authority fuses into the same `disabled` flag a field's
  // ReadOnly flag feeds: without `doc.forms.fill` every widget renders inert,
  // so the controls never offer a write the engine would refuse.
  const fuseFill = (item: FillItem | null, fillable: boolean): FillItem | null =>
    item === null || fillable || item.disabled ? item : { ...item, disabled: true };

  const listFillItems = memoByKey(
    (pageObjectNumber: number) => [
      fields.get(),
      widgetBoxes.get({ kind: 'objectNumber', pageObjectNumber }),
      ctx.state.get().writing,
      authority.can('doc.forms.fill'),
    ],
    (pageObjectNumber, index, boxes, writing, fillable) =>
      fillItems(index, pageObjectNumber, boxes, writing).map(
        (item) => fuseFill(item, fillable) as FillItem,
      ),
  );

  const getFillItem = memoByKey(
    (annotObjectNumber: number) => {
      const index = fields.get();
      const page = fieldForWidget(index, annotObjectNumber)?.widgets.find(
        (widget) => widget.annotObjectNumber === annotObjectNumber,
      )?.page;
      return [
        index,
        page ? widgetBoxes.get(page)?.[annotObjectNumber] : undefined,
        ctx.state.get().writing,
        authority.can('doc.forms.fill'),
      ];
    },
    (annotObjectNumber, index, box, writing, fillable) =>
      fuseFill(fillItemForWidget(index, annotObjectNumber, box, writing), fillable),
  );

  /** The page's content box (`{0, 0, width, height}`), for page-bound placement. */
  const getPageBox = (page: PageRef): Box | null => {
    const space = ctx.geometry.tryForPage(page);
    return space ? { x: 0, y: 0, width: space.width, height: space.height } : null;
  };

  return {
    getPageBox,
    api: {
      listFillItems: (page: PageRef) => listFillItems(page.pageObjectNumber),
      listWidgets: (page: PageRef) => listFillItems(page.pageObjectNumber),
      getFillItem,
      ensureLoaded: loadBoxes,
      getWidgetAt,
      getPageBox,
    } satisfies Partial<FormHostCapability>,
  };
}
