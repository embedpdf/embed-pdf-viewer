/**
 * The widgets' reads: each page's widgets (from the form's widget rows), the
 * ones it shows for the form layer to paint, the fill projection with the
 * session's fill permission folded in, and the widget hit test.
 */
import { memoByKey } from '@embedpdf/core';
import type { FormFieldDTO, PageRef } from '@embedpdf/engine-core/runtime';

import type { FormHostCapability } from '../host-contract';
import {
  pageWidgetsOf,
  shownWidgetsOf,
  widgetAt,
  type Box,
  type ShownWidget,
  type WidgetHit,
} from '../model';
import type { FormContext, FormServices } from '../services';
import { fillItems, type FormWidgetItem } from './fill-items';

const NO_WIDGETS: readonly FormWidgetItem[] = Object.freeze([]);
const NOTHING_SHOWN: readonly ShownWidget[] = Object.freeze([]);

export function createWidgetReads(
  ctx: FormContext,
  { fields, rights }: Pick<FormServices, 'fields' | 'rights'>,
) {
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

  const shownOn = memoByKey(
    (pageObjectNumber: number) => [fields.get()],
    (pageObjectNumber, index): readonly ShownWidget[] => shownWidgetsOf(index, pageObjectNumber),
  );

  // A field the user may not fill in (a signature field: sign) has its
  // widgets `disabled`, the same flag a field's read-only flag sets, so the
  // controls never offer a write the engine would refuse.
  const mayWrite = (field: FormFieldDTO): boolean =>
    field.family === 'signature' ? rights.maySign(field) : rights.mayFill(field);
  const widgetsOfPage = memoByKey(
    (pageObjectNumber: number) => [
      fields.get(),
      widgetsOn(pageObjectNumber),
      ctx.state.get().writing,
      rights.key(),
    ],
    (pageObjectNumber, index, widgets, writing): readonly FormWidgetItem[] =>
      fillItems(index, pageObjectNumber, widgets, writing, mayWrite),
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
      listShownWidgets: (pageArgument) => {
        const page = ctx.getPage(pageArgument)?.ref;
        return page ? shownOn(page.objectNumber) : NOTHING_SHOWN;
      },
      ensureLoaded: loadWidgets,
      getWidgetAt,
      getPageBox,
    } satisfies Partial<FormHostCapability>,
  };
}
