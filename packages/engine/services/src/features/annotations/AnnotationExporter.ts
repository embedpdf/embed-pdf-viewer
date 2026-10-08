import {
  ANNOTATION_RESOURCE_ROLES,
  EngineError,
  EngineErrorCode,
  assertWithinLimit,
  closeExportSelection,
  manifestBytesOf,
  pageAnnotationOf,
  toPageRef,
  type AnnotationBundleItem,
  type BundleLimits,
  type Annotation,
  type AnnotationExportSelection,
  type AnnotationResourceRole,
  type ResourceId,
  type WireAnnotationBundle,
  type PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { openAnnotRaw } from './internal/identity/resolveAnnotIndexRaw';
import { exportUnturnedAppearance } from './internal/read/exportUnturnedAppearance';
import { saveDocumentToBuffer } from './internal/saveDocumentToBuffer';
import { RawAnnotationReader } from './RawAnnotationReader';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import { extractAttachmentToBuffer } from '../attachments/internal/attachmentPrimitives';
import type { FontRegistrar } from '../fonts/FontRegistrar';
import { visibleBoxReader } from '../pages/PagesReader';
import { bundlePagesOf } from '../transfer/bundlePages';
import { BundleResources } from '../transfer/BundleResources';

/**
 * `doc.annotations.export`: the annotations a selection takes
 * ({@link closeExportSelection}) and the bytes beside them, as one bundle.
 * No page is loaded or parsed: annotations are read raw, and each resource
 * is exported from a raw handle, so a large document costs dictionary reads.
 * A drawing is one resource however many stamps place it, and equal bytes
 * are one resource under their hash. A bundle is page space, like
 * everything the engine hands out: each item is measured from the top-left
 * of its page. It is checked against `limits` as it is built, in the form
 * it leaves in, so an export never makes one an import refuses.
 */
export class AnnotationExporter {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
    /** This thread's font registry: FreeText faces read back as keys. */
    private readonly fonts?: FontRegistrar,
  ) {}

  export(
    selection: AnnotationExportSelection,
    limits: BundleLimits,
    signal: AbortSignal,
  ): WireAnnotationBundle {
    throwIfAborted(signal);
    const records = this.session.allRecords();
    const reader = new RawAnnotationReader(this.runtime, this.session, this.fonts);
    const annotations = closeExportSelection(
      selection,
      records.map((record) => toPageRef(record.pageObjectNumber)),
      // A bundle holds no widgets: form data travels as FDF or XFDF.
      (page) => reader.listOne(page.objectNumber, signal, 'annotations').annotations,
    );
    assertWithinLimit('annotation', limits, 'items', annotations.length);

    const resources = new ResourceCollector(this.runtime, this.session, limits);
    const boxOf = visibleBoxReader(this.runtime, this.session);
    const items: AnnotationBundleItem[] = annotations.map((data) => {
      throwIfAborted(signal);
      return {
        data: pageAnnotationOf(data, boxOf(data.ref.page), boxOf),
        resources: resources.of(data),
      };
    });

    const pages = bundlePagesOf(
      this.runtime,
      this.session,
      items.map((item) => item.data),
    );
    assertWithinLimit('annotation', limits, 'pages', pages.length);
    const manifestBytes = manifestBytesOf({ pages, items });
    assertWithinLimit('annotation', limits, 'manifestBytes', manifestBytes);
    assertWithinLimit('annotation', limits, 'bundleBytes', manifestBytes + resources.totalBytes);
    return { format: 'embedpdf/annotations', version: 1, pages, items, resources: resources.byId };
  }
}

/** The resources an export's annotations name: drawings and attached files. */
class ResourceCollector extends BundleResources {
  /** The id each shared drawing (by object number) was exported under. */
  private readonly drawings = new Map<number, ResourceId>();

  constructor(
    runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
    limits: BundleLimits,
  ) {
    super(runtime, 'annotation', limits);
  }

  /** The resources `data` names, by role. */
  of(data: Annotation<PdfCoordinates>): AnnotationBundleItem<PdfCoordinates>['resources'] {
    const roles = ANNOTATION_RESOURCE_ROLES[data.subtype];
    if (!roles) return {};
    const { fn } = this.runtime;
    const annotPtr = this.rawHandleOf(data);
    try {
      const found: Partial<Record<AnnotationResourceRole, ResourceId>> = {};
      if (roles.appearance) {
        const id = this.appearanceOf(annotPtr);
        if (id) found.appearance = id;
      }
      if (roles.file) {
        const id = this.fileOf(annotPtr);
        if (id) found.file = id;
      }
      return found;
    } finally {
      fn.FPDFPage_CloseAnnot(annotPtr);
    }
  }

  // The annotation a read returned, through the page's /Annots: no page is
  // loaded.
  private rawHandleOf(data: Annotation<PdfCoordinates>): Ptr {
    return openAnnotRaw(this.runtime, this.session, data.ref);
  }

  // A stamp placing a drawing exports the drawing, once however many stamps
  // place it; any other appearance exports as the page shows it.
  private appearanceOf(annotPtr: Ptr): ResourceId | null {
    const { fn, mem } = this.runtime;
    const drawing = fn.EPDFAnnot_GetStampDrawing(annotPtr);
    const known = drawing ? this.drawings.get(drawing) : undefined;
    if (known) return known;
    const exportedPtr = drawing
      ? fn.EPDFDoc_ExportDrawing(this.session.requireDocPtr(), drawing)
      : exportUnturnedAppearance(fn, mem, annotPtr);
    if (!exportedPtr) return null;
    try {
      const id = this.keep(saveDocumentToBuffer(fn, mem, exportedPtr, 'a drawing').bytes);
      if (drawing) this.drawings.set(drawing, id);
      return id;
    } finally {
      fn.FPDF_CloseDocument(exportedPtr);
    }
  }

  private fileOf(annotPtr: Ptr): ResourceId | null {
    const attachmentPtr = this.runtime.fn.FPDFAnnot_GetFileAttachment(annotPtr);
    if (!attachmentPtr) return null;
    let bytes: ArrayBuffer;
    try {
      bytes = extractAttachmentToBuffer(
        this.runtime,
        attachmentPtr,
        this.limits.resourceBytes,
      ).bytes;
    } catch (error) {
      if (!EngineError.is(error, EngineErrorCode.PayloadTooLarge)) throw error;
      throw new EngineError(
        EngineErrorCode.PayloadTooLarge,
        `the annotation bundle is past its resourceBytes limit: an attached file is larger than ${this.limits.resourceBytes}`,
        { details: { limit: 'resourceBytes', max: this.limits.resourceBytes } },
      );
    }
    return this.keep(bytes);
  }
}
