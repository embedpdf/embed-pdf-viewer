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
  pdfWidgetPlacementOf,
  pageWidgetOf,
  pdfRenderTargetOf,
  type Annotation,
  type AnnotationPatch,
  type Change,
  type ChangeItem,
  type ChangeOp,
  type RecordedChange,
  type RecordedOp,
  type ChangeResult,
  type PageRef,
  type WireAnnotationResources,
  type PageRenderOptions,
  type PageCoordinates,
  type PdfCoordinates,
  type PdfDestination,
  type PdfRect,
  type VisibleBoxOf,
  type WidgetAnnotation,
  type WidgetPatch,
  type ShutdownWorkerRequest,
  type WorkerJobRequest,
  type WorkerResultPayload,
  isSkippedItem,
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
  const annotation = (read: Annotation<PdfCoordinates>) =>
    pageAnnotationOf(read, boxOf(read.page), boxOf);
  const widgets = (rows: readonly WidgetAnnotation<PdfCoordinates>[]) =>
    rows.map((row) => pageWidgetOf(row, boxOf));
  switch (payload.tag) {
    case 'pages.list':
      return { ...payload, snapshot: pageListOf(payload.snapshot) };
    case 'pages.reorder':
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
    case 'document.apply':
      return { ...payload, result: changeResultInPageSpace(payload.result, boxOf) };
    case 'document.applyChanges':
      return {
        ...payload,
        outcomes: payload.outcomes.map((outcome) =>
          outcome.status === 'applied'
            ? { ...outcome, result: changeResultInPageSpace(outcome.result, boxOf) }
            : outcome,
        ),
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
        result: {
          ...payload.result,
          fields: payload.result.fields.map((field) => pageFormFieldOf(field, boxOf)),
          widgets: widgets(payload.result.widgets),
        },
      };
    case 'forms.importValues':
      return {
        ...payload,
        result: {
          ...payload.result,
          fields: payload.result.fields.map((field) => pageFormFieldOf(field, boxOf)),
          widgets: widgets(payload.result.widgets),
        },
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
          widgets: widgets(payload.result.widgets),
        },
      };
    case 'forms.setValue':
    case 'forms.createField':
    case 'forms.updateField':
    case 'forms.setSignatureAppearance':
    case 'forms.addWidget':
    case 'forms.detachWidget':
      return {
        ...payload,
        result: {
          ...payload.result,
          field: pageFormFieldOf(payload.result.field, boxOf),
          widgets: widgets(payload.result.widgets),
        },
      } as WorkerResultPayload;
    case 'forms.reset':
      return {
        ...payload,
        result: {
          ...payload.result,
          fields: payload.result.fields.map((field) => pageFormFieldOf(field, boxOf)),
          widgets: widgets(payload.result.widgets),
        },
      };
    case 'forms.updateWidget':
      return {
        ...payload,
        result: { ...payload.result, widget: pageWidgetOf(payload.result.widget, boxOf) },
      };
    case 'forms.deleteWidget':
      return {
        ...payload,
        result: {
          ...payload.result,
          field: payload.result.field && pageFormFieldOf(payload.result.field, boxOf),
        },
      };
    default:
      return payload;
  }
}

/**
 * A job as callers send it, in page space. A shutdown runs in line with the
 * jobs too; the other control messages are taken on arrival.
 */
export type PageSpaceJob = WorkerJobRequest | ShutdownWorkerRequest;
/** A job as the handlers take it, in the file's coordinates. */
export type FileSpaceJob = WorkerJobRequest<PdfCoordinates> | ShutdownWorkerRequest;

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
    case 'forms.updateWidget':
      return { ...job, patch: pdfWidgetPatchOf(job.patch, boxOf(job.widget.page), boxOf) };
    case 'forms.createField':
      return { ...job, draft: pdfFormFieldDraftOf(job.draft, boxOf) };
    case 'document.apply':
      return { ...job, change: changeInFileSpace(job.change, boxOf) };
    case 'document.applyChanges':
      return {
        ...job,
        changes: job.changes.map((entry) => ({
          ...entry,
          change: changeInFileSpace(entry.change, boxOf),
        })),
      };
    case 'forms.addWidget':
      return { ...job, placement: pdfWidgetPlacementOf(job.placement, boxOf) };
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

/** A change's ops, each place measured in the file's coordinates, as its single verb's job is. */
function changeInFileSpace(
  change: Change<PageCoordinates, WireAnnotationResources>,
  boxOf: VisibleBoxOf,
): Change<PdfCoordinates, WireAnnotationResources>;
function changeInFileSpace(
  change: RecordedChange<PageCoordinates, WireAnnotationResources>,
  boxOf: VisibleBoxOf,
): RecordedChange<PdfCoordinates, WireAnnotationResources>;
function changeInFileSpace(
  change: RecordedChange<PageCoordinates, WireAnnotationResources>,
  boxOf: VisibleBoxOf,
): RecordedChange<PdfCoordinates, WireAnnotationResources> {
  if ('undoOf' in change) return change;
  return { ops: change.ops.map((op) => opInFileSpace(op, boxOf)) };
}

function opInFileSpace(
  op: RecordedOp<PageCoordinates, WireAnnotationResources>,
  boxOf: VisibleBoxOf,
): RecordedOp<PdfCoordinates, WireAnnotationResources> {
  switch (op.type) {
    // A bundle is page space: the import converts each create on its page.
    case 'annotations.import':
    case 'forms.import':
    case 'forms.importValues':
      return op;
    case 'annotations.create':
      return { ...op, data: pdfAnnotationDraftOf(op.data, boxOf(op.page), boxOf) };
    case 'annotations.update': {
      const box = boxOf(op.ref.page);
      const { expect, ...rest } = op;
      return {
        ...rest,
        patch: pdfAnnotationPatchOf(op.patch, box, boxOf),
        ...(expect ? { expect: pdfAnnotationPatchOf(expect, box, boxOf) } : {}),
      };
    }
    case 'annotations.delete': {
      const { expect, ...rest } = op;
      return expect
        ? { ...rest, expect: pdfAnnotationPatchOf(expect, boxOf(op.ref.page), boxOf) }
        : rest;
    }
    case 'forms.create':
      return { ...op, draft: pdfFormFieldDraftOf(op.draft, boxOf) };
    case 'forms.addWidget':
      return { ...op, placement: pdfWidgetPlacementOf(op.placement, boxOf) };
    case 'forms.updateWidget': {
      const box = boxOf(op.widget.page);
      const { expect, ...rest } = op;
      return {
        ...rest,
        patch: pdfWidgetPatchOf(op.patch, box, boxOf),
        ...(expect ? { expect: pdfWidgetPatchOf(expect, box, boxOf) } : {}),
      };
    }
    case 'forms.deleteWidget': {
      const { expect, ...rest } = op;
      return expect
        ? { ...rest, expect: pdfWidgetPatchOf(expect, boxOf(op.widget.page), boxOf) }
        : rest;
    }
    default:
      // The rest hold no places: values, flags, names, metadata.
      return op;
  }
}

/** What a change did, each place in page space, as its single verbs' results are. */
function changeResultInPageSpace(
  result: ChangeResult<PdfCoordinates>,
  boxOf: VisibleBoxOf,
): ChangeResult {
  return { ...result, items: result.items.map((item) => itemInPageSpace(item, boxOf)) };
}

function itemInPageSpace(item: ChangeItem<PdfCoordinates>, boxOf: VisibleBoxOf): ChangeItem {
  // An op an undo left alone holds no places.
  if (isSkippedItem(item)) return item;
  const annotation = (read: Annotation<PdfCoordinates>) =>
    pageAnnotationOf(read, boxOf(read.page), boxOf);
  const widgets = (rows: readonly WidgetAnnotation<PdfCoordinates>[]) =>
    rows.map((row) => pageWidgetOf(row, boxOf));
  switch (item.type) {
    case 'annotations.create':
    case 'annotations.update':
      return { ...item, annotation: annotation(item.annotation) } as ChangeItem;
    case 'annotations.restore':
      return { ...item, annotations: item.annotations.map(annotation) } as ChangeItem;
    case 'annotations.import':
      return { ...item, annotations: item.annotations.map(annotation) };
    case 'forms.setValue':
    case 'forms.setDisplay':
    case 'forms.setAppearanceText':
    case 'forms.setSignatureAppearance':
    case 'forms.create':
    case 'forms.update':
    case 'forms.restore':
    case 'forms.addWidget':
    case 'forms.removeWidget':
      return {
        ...item,
        field: pageFormFieldOf(item.field, boxOf),
        widgets: widgets(item.widgets),
      } as ChangeItem;
    case 'forms.reset':
    case 'forms.import':
    case 'forms.importValues':
      return {
        ...item,
        fields: item.fields.map((field) => pageFormFieldOf(field, boxOf)),
        widgets: widgets(item.widgets),
      } as ChangeItem;
    case 'forms.updateWidget':
      return { ...item, widget: pageWidgetOf(item.widget, boxOf) };
    case 'forms.deleteWidget':
      return { ...item, field: item.field && pageFormFieldOf(item.field, boxOf) };
    case 'forms.restoreWidget':
      return {
        ...item,
        field: item.field && pageFormFieldOf(item.field, boxOf),
        widgets: widgets(item.widgets),
      };
    default:
      // The rest hold no places: deletes, metadata.
      return item;
  }
}

/** A page-space widget patch in the file's coordinates: an annotation patch of a widget. */
function pdfWidgetPatchOf(
  patch: WidgetPatch,
  visible: PdfRect,
  boxOf: VisibleBoxOf,
): WidgetPatch<PdfCoordinates> {
  return pdfAnnotationPatchOf(
    { ...patch, subtype: 'widget' } as AnnotationPatch,
    visible,
    boxOf,
  ) as WidgetPatch<PdfCoordinates>;
}
