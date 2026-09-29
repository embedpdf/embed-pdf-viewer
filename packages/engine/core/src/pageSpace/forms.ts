import type { PageCoordinates, PdfCoordinates } from './coordinates';
import { mapFieldActions, pageDestinationOf, type VisibleBoxOf } from './destinations';
import type { PdfFieldActions } from '../dto/PdfAction';
import type { PageDestination, PdfDestination } from '../dto/PdfDestination';
import type { FormFieldDraft, WidgetPlacement } from '../forms/draft';
import type { FormFieldDTO, FormFieldWidget } from '../forms/field';
import type { FormSnapshot } from '../forms/snapshot';
import { pageBoxOf, pdfRectOf } from '../geometry/pageSpace';
import type { SignatureCompleteResult, SignatureDTO, SignatureSnapshot } from '../signature/types';

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

/** A widget in page space, measured on its page; one on no page has no rect. */
export function pageFormWidgetOf<W extends FormFieldWidget<PdfCoordinates>>(
  widget: W,
  boxOf: VisibleBoxOf,
): Omit<W, 'rect'> & FormFieldWidget {
  return {
    ...widget,
    rect: widget.rect && widget.page ? pageBoxOf(widget.rect, boxOf(widget.page)) : null,
  };
}

/** A field's actions in page space, each destination measured on its page. */
export function pageFieldActionsOf(
  actions: PdfFieldActions<PdfDestination>,
  boxOf: VisibleBoxOf,
): PdfFieldActions<PageDestination> {
  return mapFieldActions(actions, (destination) => pageDestinationOf(destination, boxOf));
}

/**
 * A form field in page space: each widget measured on its page, and each
 * destination of its actions on the page it goes to.
 */
export function pageFormFieldOf(
  field: FormFieldDTO<PdfCoordinates>,
  boxOf: VisibleBoxOf,
): FormFieldDTO {
  return {
    ...field,
    widgets: field.widgets.map((widget) => pageFormWidgetOf(widget, boxOf)),
    ...(field.actions ? { actions: pageFieldActionsOf(field.actions, boxOf) } : {}),
  } as FormFieldDTO;
}

/** A form's fields in page space. */
export function pageFormSnapshotOf(
  snapshot: FormSnapshot<PdfCoordinates>,
  boxOf: VisibleBoxOf,
): FormSnapshot {
  return { ...snapshot, fields: snapshot.fields.map((field) => pageFormFieldOf(field, boxOf)) };
}

/** A signature in page space: its widget measured on its page. */
export function pageSignatureOf(
  signature: SignatureDTO<PdfCoordinates>,
  boxOf: VisibleBoxOf,
): SignatureDTO {
  return {
    ...signature,
    widget: signature.widget ? pageFormWidgetOf(signature.widget, boxOf) : null,
  };
}

/** A document's signatures in page space. */
export function pageSignatureSnapshotOf(
  snapshot: SignatureSnapshot<PdfCoordinates>,
  boxOf: VisibleBoxOf,
): SignatureSnapshot {
  return {
    ...snapshot,
    signatures: snapshot.signatures.map((signature) => pageSignatureOf(signature, boxOf)),
  };
}

/** A signing's completion in page space. */
export function pageSignatureCompleteOf(
  result: SignatureCompleteResult<PdfCoordinates>,
  boxOf: VisibleBoxOf,
): SignatureCompleteResult {
  return { ...result, signature: pageSignatureOf(result.signature, boxOf) };
}
