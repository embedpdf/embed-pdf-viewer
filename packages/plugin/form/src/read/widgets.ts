/**
 * The widget plane's reads: each page's widgets (the `widgetBoxes` mirror),
 * the fill projection with the session's fill permission folded in, and the
 * widget hit test.
 */
import { memoByKey } from '@embedpdf/core';
import type { PageRef } from '@embedpdf/engine-core/runtime';

import type { FormHostCapability } from '../host-contract';
import { boxContains, fieldForWidget, widgetAt, type Box, type WidgetHit } from '../model';
import type { FormContext, FormServices } from '../services';
import { fillItems, type FormWidgetItem } from './fill-items';

const NO_WIDGETS: readonly FormWidgetItem[] = Object.freeze([]);

export function createWidgetReads(
  ctx: FormContext,
  {
    fields,
    widgetBoxes,
    siblings,
  }: Pick<FormServices, 'fields' | 'widgetBoxes' | 'siblings'>,
) {
  const annotationHost = siblings.annotation;
  const loadWidgets = (page: PageRef): Promise<void> =>
    widgetBoxes.ensureLoaded(page).catch(() => {
      /* the failure is reported through the page's status */
    });

  /**
   * The widget under a page point. Uses the page's loaded widgets, starting
   * their load when missing; until it lands, falls back to the annotation
   * plane's live boxes, which are loaded for the whole document, so a first
   * click on a page already resolves.
   */
  const getWidgetAt = (
    pageArgument: PageRef | number,
    point: { x: number; y: number },
  ): WidgetHit | null => {
    const page = ctx.getPage(pageArgument)?.ref;
    if (!page) return null;
    const widgets = widgetBoxes.get(page);
    if (widgets) return widgetAt(fields.get(), widgets, point);
    void loadWidgets(page);
    if (!annotationHost) return null;
    let best: WidgetHit | null = null;
    for (const item of annotationHost.listPageItems(page)) {
      if (!item.subtype.startsWith('widget') || item.ref?.kind !== 'objectNumber') continue;
      if (!boxContains(item.box, point)) continue;
      const field = fieldForWidget(fields.get(), item.ref.objectNumber);
      if (!field) continue;
      if (!best || item.box.width * item.box.height < best.box.width * best.box.height) {
        best = { annotObjectNumber: item.ref.objectNumber, field, box: item.box };
      }
    }
    return best;
  };

  // Without `doc.forms.fill` every widget is `disabled`, the same flag a
  // field's read-only flag sets, so the controls never offer a write the
  // engine would refuse.
  const withFillPermission = (item: FormWidgetItem, fillable: boolean): FormWidgetItem =>
    fillable || item.disabled ? item : { ...item, disabled: true };

  const widgetsOfPage = memoByKey(
    (pageObjectNumber: number) => [
      fields.get(),
      widgetBoxes.get({ kind: 'objectNumber', objectNumber: pageObjectNumber }),
      ctx.state.get().writing,
      ctx.allows('doc.forms.fill'),
    ],
    (pageObjectNumber, index, widgets, writing, fillable): readonly FormWidgetItem[] =>
      fillItems(index, pageObjectNumber, widgets, writing).map((item) =>
        withFillPermission(item, fillable),
      ),
  );

  /** The page's content box (`{0, 0, width, height}`), for page-bound placement. */
  const getPageBox = (page: PageRef): Box | null => {
    const size = ctx.getPage(page)?.size;
    return size ? { x: 0, y: 0, width: size.width, height: size.height } : null;
  };

  return {
    getPageBox,
    api: {
      listWidgets: (pageArgument) => {
        const page = ctx.getPage(pageArgument)?.ref;
        return page ? widgetsOfPage(page.objectNumber) : NO_WIDGETS;
      },
      ensureLoaded: loadWidgets,
      getWidgetAt,
      getPageBox,
    } satisfies Partial<FormHostCapability>,
  };
}
