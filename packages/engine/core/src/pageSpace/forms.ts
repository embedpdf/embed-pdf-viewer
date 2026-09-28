import type { PageCoordinates, PdfCoordinates } from './coordinates';
import { mapFieldActions, pageDestinationOf, type VisibleBoxOf } from './destinations';
import type { PdfFieldActions } from '../dto/PdfAction';
import type { PageDestination, PdfDestination } from '../dto/PdfDestination';
import type { WidgetPlacement } from '../forms/draft';
import type { FormFieldDTO } from '../forms/field';
import type { FormSnapshot } from '../forms/snapshot';
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

/**
 * A form field in page space. Its actions are the only places it holds: each
 * destination is measured on the page it goes to.
 */
export function pageFormFieldOf(
  field: FormFieldDTO<PdfCoordinates>,
  boxOf: VisibleBoxOf,
): FormFieldDTO {
  if (!field.actions) return field as FormFieldDTO;
  return { ...field, actions: pageFieldActionsOf(field.actions, boxOf) };
}

/** A form's fields in page space. */
export function pageFormSnapshotOf(
  snapshot: FormSnapshot<PdfCoordinates>,
  boxOf: VisibleBoxOf,
): FormSnapshot {
  return { ...snapshot, fields: snapshot.fields.map((field) => pageFormFieldOf(field, boxOf)) };
}
