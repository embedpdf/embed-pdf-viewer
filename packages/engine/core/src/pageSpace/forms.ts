import type { PageCoordinates } from './coordinates';
import {
  mapFieldActions,
  pageDestinationOf,
  type PageDestination,
  type VisibleBoxOf,
} from './destinations';
import type { PdfFieldActions } from '../dto/PdfAction';
import type { PdfDestination } from '../dto/PdfDestination';
import type { WidgetPlacement } from '../forms/draft';
import { pdfRectOf } from '../geometry/pageSpace';

/** A page-space widget placement in the file's coordinates, measured on its page. */
export function pdfWidgetPlacementOf(
  placement: WidgetPlacement<PageCoordinates>,
  boxOf: VisibleBoxOf,
): WidgetPlacement {
  return { ...placement, rect: pdfRectOf(placement.rect, boxOf(placement.page)) };
}

/** A field's actions in page space, each destination measured on its page. */
export function pageFieldActionsOf(
  actions: PdfFieldActions<PdfDestination>,
  boxOf: VisibleBoxOf,
): PdfFieldActions<PageDestination> {
  return mapFieldActions(actions, (destination) => pageDestinationOf(destination, boxOf));
}
