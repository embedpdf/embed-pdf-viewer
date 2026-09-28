import {
  mapDocumentActions,
  pageDestinationOf,
  pageFormFieldOf,
  pageFormSnapshotOf,
  pageListOf,
  type PdfCoordinates,
  type PdfDestination,
  type VisibleBoxOf,
  type WorkerResultPayload,
} from '@embedpdf/engine-core/runtime';

/**
 * The worker's one boundary between PDF space and page space. The handlers
 * read and write the file in PDF space; every result converts here before it
 * leaves the worker, so the local engine and the server hand out the same
 * page-space values. A result whose shape depends on the space fails to
 * compile until it is converted here.
 *
 * `boxOf` gives the visible box of any page of the request's document: a
 * destination is measured on the page it goes to. A page list carries every
 * page's box itself.
 */
export function resultInPageSpace(
  payload: WorkerResultPayload<PdfCoordinates>,
  boxOf: VisibleBoxOf,
): WorkerResultPayload {
  const toPage = (destination: PdfDestination) => pageDestinationOf(destination, boxOf);
  switch (payload.tag) {
    case 'pages.list':
      return { ...payload, snapshot: pageListOf(payload.snapshot) };
    case 'pages.move':
    case 'pages.rotate':
    case 'pages.delete':
    case 'pages.setName':
    case 'pages.removeName':
    case 'pages.insert':
    case 'pages.insertBlank':
      return {
        ...payload,
        result: { ...payload.result, layout: pageListOf(payload.result.layout) },
      } as WorkerResultPayload;
    case 'actions.read':
      return { ...payload, snapshot: mapDocumentActions(payload.snapshot, toPage) };
    case 'forms.list':
      return { ...payload, snapshot: pageFormSnapshotOf(payload.snapshot, boxOf) };
    case 'forms.import':
      return {
        ...payload,
        result: { ...payload.result, form: pageFormSnapshotOf(payload.result.form, boxOf) },
      };
    case 'forms.applyEffects':
      return {
        ...payload,
        result: {
          ...payload.result,
          results: payload.result.results.map((effect) => ({
            ...effect,
            fields: effect.fields.map((field) => pageFormFieldOf(field, boxOf)),
          })),
        },
      };
    case 'forms.setValue':
    case 'forms.reset':
    case 'forms.createField':
    case 'forms.updateField':
    case 'forms.setSignatureAppearance':
    case 'forms.attachWidget':
    case 'forms.detachWidget':
      return {
        ...payload,
        result: { ...payload.result, field: pageFormFieldOf(payload.result.field, boxOf) },
      } as WorkerResultPayload;
    default:
      return payload;
  }
}
