import {
  ANNOTATION_RESOURCE_ROLES,
  EngineError,
  EngineErrorCode,
  assertWithinLimit,
  closeExportSelection,
  encodePageKey,
  manifestBytesOf,
  pageAnnotationOf,
  pageRefsIn,
  toPageRef,
  type AnnotationBundleItem,
  type AnnotationBundleLimits,
  type AnnotationBundlePage,
  type Annotation,
  type AnnotationExportSelection,
  type AnnotationResourceRole,
  type ResourceId,
  type WireAnnotationBundle,
  type PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { sha256HexOf } from './internal/digest';
import { openAnnotRaw } from './internal/identity/resolveAnnotIndexRaw';
import { exportUnturnedAppearance } from './internal/read/exportUnturnedAppearance';
import { saveDocumentToBuffer } from './internal/saveDocumentToBuffer';
import { RawAnnotationReader } from './RawAnnotationReader';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { withScratch } from '../../runtime/memory/scratch';
import { RECTF_BYTES } from '../../runtime/memory/structs';
import { throwIfAborted } from '../../shared/abort';
import { extractAttachmentToBuffer } from '../attachments/internal/attachmentPrimitives';
import type { FontRegistrar } from '../fonts/FontRegistrar';
import { readBoxes, visibleBoxReader } from '../pages/PagesReader';

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
    limits: AnnotationBundleLimits,
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
    assertWithinLimit(limits, 'items', annotations.length);

    const resources = new ResourceCollector(this.runtime, this.session, limits);
    const boxOf = visibleBoxReader(this.runtime, this.session);
    const items: AnnotationBundleItem[] = annotations.map((data) => {
      throwIfAborted(signal);
      return {
        data: pageAnnotationOf(data, boxOf(data.ref.page), boxOf),
        resources: resources.of(data),
      };
    });

    const pages = this.pagesOf(items);
    assertWithinLimit(limits, 'pages', pages.length);
    const manifestBytes = manifestBytesOf({ pages, items });
    assertWithinLimit(limits, 'manifestBytes', manifestBytes);
    assertWithinLimit(limits, 'bundleBytes', manifestBytes + resources.totalBytes);
    return { format: 'embedpdf/annotations', version: 1, pages, items, resources: resources.byId };
  }

  /** Every page the items are on or point at, in document order. */
  private pagesOf(items: readonly AnnotationBundleItem[]): AnnotationBundlePage[] {
    const { fn, mem } = this.runtime;
    const named = new Set(items.flatMap((item) => pageRefsIn(item.data).map(encodePageKey)));
    const docPtr = this.session.requireDocPtr();
    return withScratch(mem, RECTF_BYTES, (rectPtr) =>
      this.session
        .allRecords()
        .filter((record) => named.has(encodePageKey(toPageRef(record.pageObjectNumber))))
        .map((record) => {
          const visible = readBoxes(fn, mem, docPtr, record.pageIndex, rectPtr).crop;
          return {
            page: toPageRef(record.pageObjectNumber),
            position: record.pageIndex,
            size: { width: visible.right - visible.left, height: visible.top - visible.bottom },
          };
        }),
    );
  }
}

/** The resources of one export: each once, under its id, within the limits. */
class ResourceCollector {
  readonly byId: Record<ResourceId, ArrayBuffer> = {};
  totalBytes = 0;
  /** The id each shared drawing (by object number) was exported under. */
  private readonly drawings = new Map<number, ResourceId>();

  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
    private readonly limits: AnnotationBundleLimits,
  ) {}

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

  private keep(bytes: ArrayBuffer): ResourceId {
    assertWithinLimit(this.limits, 'resourceBytes', bytes.byteLength);
    const { fn, mem } = this.runtime;
    const id: ResourceId = `sha256-${sha256HexOf(fn, mem, new Uint8Array(bytes))}`;
    if (!(id in this.byId)) {
      this.byId[id] = bytes;
      this.totalBytes += bytes.byteLength;
      assertWithinLimit(this.limits, 'resources', Object.keys(this.byId).length);
      assertWithinLimit(this.limits, 'bundleBytes', this.totalBytes);
    }
    return id;
  }
}
