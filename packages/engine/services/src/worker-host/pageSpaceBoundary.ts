import {
  mapDocumentActions,
  pageAnnotationOf,
  pageAppearancesOf,
  pageBoxOf,
  pageDestinationOf,
  pageFormFieldOf,
  pageFormSnapshotOf,
  pageGeometryOf,
  pageListOf,
  pageSearchSliceOf,
  pageViewportsOf,
  pdfAnnotationDraftOf,
  pdfAnnotationPatchOf,
  pdfFormFieldDraftOf,
  pdfMeasureOf,
  pdfRenderTargetOf,
  type AnnotationDTO,
  type PageRef,
  type PageRenderOptions,
  type PdfCoordinates,
  type PdfDestination,
  type PdfRect,
  type VisibleBoxOf,
  type WorkerRequest,
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
  const annotation = (read: AnnotationDTO<PdfCoordinates>) =>
    pageAnnotationOf(read, boxOf(read.page), boxOf);
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
    case 'pages.geometry':
      return { ...payload, snapshot: pageGeometryOf(payload.snapshot, boxOf(payload.page)) };
    case 'pages.render':
      return { ...payload, area: pageBoxOf(payload.area, boxOf(payload.page)) };
    case 'search.query':
      return { ...payload, slice: pageSearchSliceOf(payload.slice, boxOf) };
    case 'annotations.renderAppearances': {
      const appearances = pageAppearancesOf(payload.result.appearances, boxOf(payload.page));
      return { ...payload, result: { ...payload.result, appearances } };
    }
    case 'annotations.renderAppearancesEncoded': {
      const appearances = pageAppearancesOf(payload.result.appearances, boxOf(payload.page));
      return { ...payload, result: { ...payload.result, appearances } };
    }
    case 'actions.read':
      return { ...payload, snapshot: mapDocumentActions(payload.snapshot, toPage) };
    case 'annotations.list':
      return {
        ...payload,
        list: { ...payload.list, annotations: payload.list.annotations.map(annotation) },
      };
    case 'annotations.create':
      return {
        ...payload,
        result: { ...payload.result, annotation: annotation(payload.result.annotation) },
      };
    case 'annotations.update':
      return {
        ...payload,
        result: { ...payload.result, annotation: annotation(payload.result.annotation) },
      };
    case 'annotations.move':
      return {
        ...payload,
        result: { ...payload.result, annotations: payload.result.annotations.map(annotation) },
      };
    case 'annotations.import':
      return {
        ...payload,
        result: { ...payload.result, annotations: payload.result.annotations.map(annotation) },
      };
    case 'measure.viewports':
      return { ...payload, viewports: pageViewportsOf(payload.viewports, boxOf(payload.page)) };
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

/** A job as callers send it, in page space. */
export type PageSpaceJob = Exclude<WorkerRequest, { kind: 'abort' }>;
/** A job as the handlers take it, in the file's coordinates. */
export type FileSpaceJob = Exclude<WorkerRequest<PdfCoordinates>, { kind: 'abort' }>;

/**
 * The other way across the boundary: a request as the handlers take it, each
 * place a caller sent in page space measured in the file's coordinates on
 * its page. It runs when the job does, after every job before it, so a page
 * a queued edit changed is measured as it now is. A file render opens its
 * own document, so it converts its own target (`renderOptionsInFileSpace`).
 */
export function requestInFileSpace(job: PageSpaceJob, boxOf: VisibleBoxOf): FileSpaceJob {
  switch (job.kind) {
    case 'annotations.create':
      return { ...job, draft: pdfAnnotationDraftOf(job.draft, boxOf(job.page), boxOf) };
    case 'annotations.update':
      return { ...job, patch: pdfAnnotationPatchOf(job.patch, boxOf(job.ref.page), boxOf) };
    case 'forms.createField':
      return { ...job, draft: pdfFormFieldDraftOf(job.draft, boxOf) };
    case 'measure.setScale':
      return job.measure ? { ...job, measure: pdfMeasureOf(job.measure, boxOf(job.page)) } : job;
    case 'pages.render':
      return withRenderOptionsInFileSpace(job, boxOf);
    case 'pages.renderEncoded':
      return withRenderOptionsInFileSpace(job, boxOf);
    default:
      return job;
  }
}

function withRenderOptionsInFileSpace<Job extends { page: PageRef; options?: PageRenderOptions }>(
  job: Job,
  boxOf: VisibleBoxOf,
): Omit<Job, 'options'> & { options?: PageRenderOptions<PdfCoordinates> } {
  const { options, ...rest } = job;
  return options
    ? { ...rest, options: renderOptionsInFileSpace(options, () => boxOf(job.page)) }
    : rest;
}

/**
 * Render options in the file's coordinates. `visible` gives the page's
 * visible box, read only when a target rect needs it.
 */
export function renderOptionsInFileSpace(
  options: PageRenderOptions,
  visible: () => PdfRect,
): PageRenderOptions<PdfCoordinates> {
  const { target, ...rest } = options;
  if (!target) return rest;
  return {
    ...rest,
    target: target.kind === 'rect' ? pdfRenderTargetOf(target, visible()) : target,
  };
}
