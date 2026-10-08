import { pageAnnotationOf } from './annotations';
import type { PageCoordinates, PdfCoordinates } from './coordinates';
import { mapFieldActions, pageDestinationOf, type VisibleBoxOf } from './destinations';
import type { WidgetAnnotation } from '../annotation/kinds/widget';
import type { PdfFieldActions } from '../dto/PdfAction';
import type { PageDestination, PdfDestination } from '../dto/PdfDestination';
import type { FormFieldDraft, WidgetPlacement } from '../forms/draft';
import type { FormFieldDTO } from '../forms/field';
import type { FormSnapshot } from '../forms/snapshot';
import { pdfRectOf } from '../geometry/pageSpace';

/** A page-space widget placement in the file's coordinates, measured on its page. */
export function pdfWidgetPlacementOf(
  placement: WidgetPlacement<PageCoordinates>,
  boxOf: VisibleBoxOf,
): WidgetPlacement<PdfCoordinates> {
  return { ...placement, rect: pdfRectOf(placement.rect, boxOf(placement.page)) };
}

/** A field draft in the file's coordinates: each widget measured on its own page. */
export function pdfFormFieldDraftOf(
  draft: FormFieldDraft<PageCoordinates>,
  boxOf: VisibleBoxOf,
): FormFieldDraft<PdfCoordinates> {
  if (!draft.widgets) return draft as FormFieldDraft<PdfCoordinates>;
  return {
    ...draft,
    widgets: draft.widgets.map((widget) => pdfWidgetPlacementOf(widget, boxOf)),
  } as FormFieldDraft<PdfCoordinates>;
}

/** A field's actions in page space, each destination measured on its page. */
export function pageFieldActionsOf(
  actions: PdfFieldActions<PdfDestination>,
  boxOf: VisibleBoxOf,
): PdfFieldActions<PageDestination> {
  return mapFieldActions(actions, (destination) => pageDestinationOf(destination, boxOf));
}

/** A form field in page space: each destination of its actions on the page it goes to. */
export function pageFormFieldOf(
  field: FormFieldDTO<PdfCoordinates>,
  boxOf: VisibleBoxOf,
): FormFieldDTO {
  if (!field.actions) return field as FormFieldDTO;
  return { ...field, actions: pageFieldActionsOf(field.actions, boxOf) } as FormFieldDTO;
}

/** A widget row in page space, measured on its page. */
export function pageWidgetOf(
  widget: WidgetAnnotation<PdfCoordinates>,
  boxOf: VisibleBoxOf,
): WidgetAnnotation {
  return pageAnnotationOf(widget, boxOf(widget.page), boxOf) as WidgetAnnotation;
}

/** A form in page space: its fields, and each widget row on its page. */
export function pageFormSnapshotOf(
  snapshot: FormSnapshot<PdfCoordinates>,
  boxOf: VisibleBoxOf,
): FormSnapshot {
  return {
    ...snapshot,
    fields: snapshot.fields.map((field) => pageFormFieldOf(field, boxOf)),
    widgets: snapshot.widgets.map((widget) => pageWidgetOf(widget, boxOf)),
  };
}
