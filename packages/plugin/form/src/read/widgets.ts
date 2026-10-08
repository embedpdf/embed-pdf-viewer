/**
 * The widgets' reads: each page's widgets (from the form's widget rows), the
 * fill projection with the session's fill permission folded in, and the
 * widget hit test.
 */
import { memoByKey } from '@embedpdf/core';
import type { PageRef } from '@embedpdf/engine-core/runtime';

import type { FormHostCapability } from '../host-contract';
import { pageWidgetsOf, widgetAt, type Box, type WidgetHit } from '../model';
import type { FormContext, FormServices } from '../services';
import { fillItems, type FormWidgetItem } from './fill-items';

const NO_WIDGETS: readonly FormWidgetItem[] = Object.freeze([]);

export function createWidgetReads(ctx: FormContext, { fields }: Pick<FormServices, 'fields'>) {
  /** Every page's widgets come with the form: one read for the document. */
  const loadWidgets = (_page: PageRef): Promise<void> => fields.settled();

  const widgetsOn = memoByKey(
    (pageObjectNumber: number) => [fields.get()],
    (pageObjectNumber, index) => pageWidgetsOf(index, pageObjectNumber),
  );

  /** The widget under a page point. */
  const getWidgetAt = (
    pageArgument: PageRef | number,
    point: { x: number; y: number },
  ): WidgetHit | null => {
    const page = ctx.getPage(pageArgument)?.ref;
    if (!page) return null;
    return widgetAt(fields.get(), widgetsOn(page.objectNumber), point);
  };

  // Without `doc.forms.fill` every widget is `disabled`, the same flag a
  // field's read-only flag sets, so the controls never offer a write the
  // engine would refuse.
  const withFillPermission = (item: FormWidgetItem, fillable: boolean): FormWidgetItem =>
    fillable || item.disabled ? item : { ...item, disabled: true };

  const widgetsOfPage = memoByKey(
    (pageObjectNumber: number) => [
      fields.get(),
      widgetsOn(pageObjectNumber),
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
