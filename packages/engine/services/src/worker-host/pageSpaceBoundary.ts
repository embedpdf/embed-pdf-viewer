import {
  pageListOf,
  type PdfCoordinates,
  type WorkerResultPayload,
} from '@embedpdf/engine-core/runtime';

/**
 * The worker's one boundary between PDF space and page space. The handlers
 * read and write the file in PDF space; every result converts here before it
 * leaves the worker, so the local engine and the server hand out the same
 * page-space values. A result whose shape depends on the space fails to
 * compile until it is converted here.
 */
export function resultInPageSpace(
  payload: WorkerResultPayload<PdfCoordinates>,
): WorkerResultPayload {
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
    default:
      return payload;
  }
}
