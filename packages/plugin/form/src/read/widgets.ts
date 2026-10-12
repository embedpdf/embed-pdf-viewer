/**
 * The widgets' reads: each page's widgets (from the form's widget rows), the
 * ones it shows for the form layer to paint (and the painter's scene of each,
 * `services/looks.ts`), the fill projection with the session's fill permission
 * folded in, and the widget hit test.
 */
import { memoByKey } from '@embedpdf/core';
import type { FormFieldDTO, PageRef } from '@embedpdf/engine-core/runtime';

import type { FormHostCapability } from '../host-contract';
import { pageWidgetsOf, widgetAt, type Box, type ShownWidget, type WidgetHit } from '../model';
import type { FormContext, FormServices } from '../services';
import { fillItems, type FormWidgetItem } from './fill-items';

const NO_WIDGETS: readonly FormWidgetItem[] = Object.freeze([]);
const NOTHING_SHOWN: readonly ShownWidget[] = Object.freeze([]);

export function createWidgetReads(
  ctx: FormContext,
  {
    fields,
    rights,
    looks,
    pictures,
  }: Pick<FormServices, 'fields' | 'rights' | 'looks' | 'pictures'>,
) {
  /** Every page's widgets come with the form: one read for the document. */
  const loadWidgets = (_page: PageRef): Promise<void> => fields.settled();

  const widgetsOn = memoByKey(
    (pageObjectNumber: number) => [fields.view()],
    (pageObjectNumber, index) => pageWidgetsOf(index, pageObjectNumber),
  );

  /** The widget under a page point. */
  const getWidgetAt = (
    pageArgument: PageRef | number,
    point: { x: number; y: number },
  ): WidgetHit | null => {
    const page = ctx.getPage(pageArgument)?.ref;
    if (!page) return null;
    return widgetAt(fields.view(), widgetsOn(page.objectNumber), point);
  };

  // A field the user may not fill in (a signature field: sign) has its
  // widgets `disabled`, the same flag a field's read-only flag sets, so the
  // controls never offer a write the engine would refuse.
  const mayWrite = (field: FormFieldDTO): boolean =>
    field.family === 'signature' ? rights.maySign(field) : rights.mayFill(field);
  const widgetsOfPage = memoByKey(
    (pageObjectNumber: number) => [fields.view(), widgetsOn(pageObjectNumber), rights.key()],
    (pageObjectNumber, index, widgets): readonly FormWidgetItem[] =>
      fillItems(index, pageObjectNumber, widgets, mayWrite),
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
        return page ? looks.listShownWidgets(page.objectNumber) : NOTHING_SHOWN;
      },
      getAppearanceEpoch: pictures.epoch,
      renderAppearances: pictures.render,
      getWidgetPainting: looks.getWidgetPainting,
      getTextEditorLayout: looks.getTextEditorLayout,
      ensureLoaded: loadWidgets,
      getWidgetAt,
      getPageBox,
    } satisfies Partial<FormHostCapability>,
  };
}
