import {
  BatchProgress,
  ImageDataLike,
  IPdfiumExecutor,
  PdfActionObject,
  PdfAnnotationObject,
  PdfTextRectObject,
  PdfAnnotationSubtype,
  PdfLinkAnnoObject,
  PdfWidgetAnnoObject,
  PdfLinkTarget,
  PdfZoomMode,
  Logger,
  NoopLogger,
  SearchResult,
  PdfDestinationObject,
  PdfBookmarkObject,
  PdfDocumentObject,
  PdfPageObject,
  PdfActionType,
  Rotation,
  PDF_FORM_FIELD_FLAG,
  PDF_FORM_FIELD_TYPE,
  PdfWidgetAnnoOption,
  PdfFileAttachmentAnnoObject,
  Rect,
  Size,
  PdfAttachmentObject,
  PdfUnsupportedAnnoObject,
  PdfTextAnnoObject,
  PdfSignatureObject,
  PdfInkAnnoObject,
  PdfInkListObject,
  Position,
  PdfStampAnnoObject,
  PdfCircleAnnoObject,
  PdfSquareAnnoObject,
  PdfFreeTextAnnoObject,
  PdfCaretAnnoObject,
  PdfRedactAnnoObject,
  PdfSquigglyAnnoObject,
  PdfStrikeOutAnnoObject,
  PdfUnderlineAnnoObject,
  PdfFile,
  PdfSegmentObject,
  AppearanceMode,
  PdfImageObject,
  PdfPageObjectType,
  PdfPathObject,
  PdfFormObject,
  PdfPolygonAnnoObject,
  PdfPolylineAnnoObject,
  PdfLineAnnoObject,
  PdfHighlightAnnoObject,
  PdfStampAnnoObjectContents,
  PdfWidgetAnnoField,
  PdfTransformMatrix,
  FormFieldValue,
  PdfErrorCode,
  PdfTaskHelper,
  PdfPageFlattenFlag,
  PdfPageFlattenResult,
  PdfTask,
  transformRect,
  PdfOpenDocumentBufferOptions,
  Task,
  PdfErrorReason,
  TextContext,
  PdfGlyphObject,
  PdfGlyphSlim,
  PdfPageGeometry,
  PdfRun,
  toIntRect,
  Quad,
  PdfAnnotationState,
  PdfAnnotationStateModel,
  quadToRect,
  PageTextSlice,
  stripPdfUnwantedMarkers,
  rectToQuad,
  dateToPdfDate,
  pdfDateToDate,
  PdfAnnotationColorType,
  PdfAnnotationBorderStyle,
  flagsToNames,
  PdfAnnotationFlagName,
  namesToFlags,
  PdfAnnotationLineEnding,
  LinePoints,
  LineEndings,
  WebColor,
  webColorToPdfColor,
  PdfColor,
  pdfColorToWebColor,
  pdfAlphaToWebOpacity,
  webOpacityToPdfAlpha,
  PdfStandardFont,
  PdfTextAlignment,
  PdfVerticalAlignment,
  AnnotationCreateContext,
  isUuidV4,
  uuidV4,
  PdfAnnotationIcon,
  PdfAnnotationReplyType,
  PdfRenderPageAnnotationOptions,
  PdfRedactTextOptions,
  PdfFlattenPageOptions,
  PdfRenderThumbnailOptions,
  PdfRenderPageOptions,
  buildUserToDeviceMatrix,
  Matrix,
  PdfMetadataObject,
  PdfPrintOptions,
  PdfTrappedStatus,
  PdfStampFit,
  PdfAddAttachmentParams,
  PdfFontInfo,
  PdfTextRun,
  PdfPageTextRuns,
  PdfAlphaColor,
} from '@embedpdf/models';
import { computeFormDrawParams, isValidCustomKey, readArrayBuffer, readString } from './helper';
import { WrappedPdfiumModule } from '@embedpdf/pdfium';
import { DocumentContext, PageContext, PdfCache } from './cache';
import { MemoryManager } from './core/memory-manager';
import { WasmPointer } from './types/branded';
import { FontFallbackManager, FontFallbackConfig } from './font-fallback';

/**
 * Format of bitmap
 */
export enum BitmapFormat {
  Bitmap_Gray = 1,
  Bitmap_BGR = 2,
  Bitmap_BGRx = 3,
  Bitmap_BGRA = 4,
}

/**
 * Pdf rendering flag
 */
export enum RenderFlag {
  ANNOT = 0x01, // Set if annotations are to be rendered.
  LCD_TEXT = 0x02, // Set if using text rendering optimized for LCD display.
  NO_NATIVETEXT = 0x04, // Don't use the native text output available on some platforms
  GRAYSCALE = 0x08, // Grayscale output.
  DEBUG_INFO = 0x80, // Set if you want to get some debug info. Please discuss with Foxit first if you need to collect debug info.
  NO_CATCH = 0x100, // Set if you don't want to catch exception.
  RENDER_LIMITEDIMAGECACHE = 0x200, // Limit image cache size.
  RENDER_FORCEHALFTONE = 0x400, // Always use halftone for image stretching.
  PRINTING = 0x800, // Render for printing.
  REVERSE_BYTE_ORDER = 0x10, // Set whether render in a reverse Byte order, this flag only.
}

const LOG_SOURCE = 'PDFiumEngine';
const LOG_CATEGORY = 'Engine';

/**
 * Error code of pdfium library
 */
export enum PdfiumErrorCode {
  Success = 0,
  Unknown = 1,
  File = 2,
  Format = 3,
  Password = 4,
  Security = 5,
  Page = 6,
  XFALoad = 7,
  XFALayout = 8,
}

export interface PdfiumEngineOptions {
  logger?: Logger;
  /**
   * Font fallback configuration for handling missing fonts in PDFs.
   * When enabled, PDFium will request fallback fonts from configured URLs
   * when it encounters text that requires fonts not embedded in the PDF.
   */
  fontFallback?: FontFallbackConfig;
}

/**
 * Pdf engine that based on pdfium wasm
 */
export class PdfiumNative implements IPdfiumExecutor {
  /**
   * pdf documents that opened
   */
  private readonly cache: PdfCache;

  /**
   * memory manager instance
   */
  private readonly memoryManager: MemoryManager;

  /**
   * interval to check memory leaks
   */
  private memoryLeakCheckInterval: number | null = null;

  /**
   * logger instance
   */
  private logger: Logger;

  /**
   * font fallback manager instance
   */
  private fontFallbackManager: FontFallbackManager | null = null;

  /**
   * Create an instance of PdfiumNative and initialize PDFium
   * @param wasmModule - pdfium wasm module
   * @param options - configuration options
   */
  constructor(
    private pdfiumModule: WrappedPdfiumModule,
    options: PdfiumEngineOptions = {},
  ) {
    const { logger = new NoopLogger(), fontFallback } = options;

    this.logger = logger;
    this.memoryManager = new MemoryManager(this.pdfiumModule, this.logger);
    this.cache = new PdfCache(this.pdfiumModule, this.memoryManager);

    if (this.logger.isEnabled('debug')) {
      this.memoryLeakCheckInterval = setInterval(() => {
        this.memoryManager.checkLeaks();
      }, 10000) as unknown as number;
    }

    // Initialize PDFium in constructor
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'initialize');
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `Initialize`, 'Begin', 'General');
    this.pdfiumModule.PDFiumExt_Init();
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `Initialize`, 'End', 'General');

    // Initialize font fallback system if configured
    if (fontFallback) {
      this.fontFallbackManager = new FontFallbackManager(fontFallback, this.logger);
      this.fontFallbackManager.initialize(this.pdfiumModule);
      this.logger.info(LOG_SOURCE, LOG_CATEGORY, 'Font fallback system enabled');
    }
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.destroy}
   *
   * @public
   */
  destroy() {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'destroy');
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `Destroy`, 'Begin', 'General');

    // Disable font fallback before destroying library
    if (this.fontFallbackManager) {
      this.fontFallbackManager.disable();
      this.fontFallbackManager = null;
    }

    this.pdfiumModule.FPDF_DestroyLibrary();
    if (this.memoryLeakCheckInterval) {
      clearInterval(this.memoryLeakCheckInterval);
      this.memoryLeakCheckInterval = null;
    }
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `Destroy`, 'End', 'General');
    return PdfTaskHelper.resolve(true);
  }

  /**
   * Get the font fallback manager instance
   * Useful for pre-loading fonts or checking stats
   */
  getFontFallbackManager(): FontFallbackManager | null {
    return this.fontFallbackManager;
  }

  /** Write a UTF-16LE (WIDESTRING) to wasm, call `fn(ptr)`, then free. */
  private withWString<T>(value: string, fn: (ptr: number) => T): T {
    // bytes = (len + 1) * 2
    const length = (value.length + 1) * 2;
    const ptr = this.memoryManager.malloc(length);
    try {
      // emscripten runtime exposes stringToUTF16
      this.pdfiumModule.pdfium.stringToUTF16(value, ptr, length);
      return fn(ptr);
    } finally {
      this.memoryManager.free(ptr);
    }
  }

  /** Write a float[] to wasm, call `fn(ptr, count)`, then free. */
  private withFloatArray<T>(
    values: number[] | undefined,
    fn: (ptr: number, count: number) => T,
  ): T {
    const arr = values ?? [];
    const bytes = arr.length * 4;
    const ptr = bytes ? this.memoryManager.malloc(bytes) : WasmPointer(0);
    try {
      if (bytes) {
        for (let i = 0; i < arr.length; i++) {
          this.pdfiumModule.pdfium.setValue(ptr + i * 4, arr[i], 'float');
        }
      }
      return fn(ptr, arr.length);
    } finally {
      if (bytes) this.memoryManager.free(ptr);
    }
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.openDocument}
   *
   * @public
   */
  openDocumentBuffer(file: PdfFile, options?: PdfOpenDocumentBufferOptions) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'openDocumentBuffer', file, options);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `OpenDocumentBuffer`, 'Begin', file.id);

    // Per-document normalizeRotation setting (defaults to false for backwards compatibility)
    const normalizeRotation = options?.normalizeRotation ?? false;

    const array = new Uint8Array(file.content);
    const length = array.length;
    const filePtr = this.memoryManager.malloc(length);
    this.pdfiumModule.pdfium.HEAPU8.set(array, filePtr);

    const docPtr = this.pdfiumModule.FPDF_LoadMemDocument(filePtr, length, options?.password ?? '');

    if (!docPtr) {
      const lastError = this.pdfiumModule.FPDF_GetLastError();
      this.logger.error(LOG_SOURCE, LOG_CATEGORY, `FPDF_LoadMemDocument failed with ${lastError}`);
      this.memoryManager.free(filePtr);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `OpenDocumentBuffer`, 'End', file.id);

      return PdfTaskHelper.reject<PdfDocumentObject>({
        code: lastError,
        message: `FPDF_LoadMemDocument failed`,
      });
    }

    const pageCount = this.pdfiumModule.FPDF_GetPageCount(docPtr);

    const pages: PdfPageObject[] = [];
    const sizePtr = this.memoryManager.malloc(8);
    for (let index = 0; index < pageCount; index++) {
      // Use normalized size function when normalizeRotation is enabled
      const result = normalizeRotation
        ? this.pdfiumModule.EPDF_GetPageSizeByIndexNormalized(docPtr, index, sizePtr)
        : this.pdfiumModule.FPDF_GetPageSizeByIndexF(docPtr, index, sizePtr);

      if (!result) {
        const lastError = this.pdfiumModule.FPDF_GetLastError();
        this.logger.error(
          LOG_SOURCE,
          LOG_CATEGORY,
          `${normalizeRotation ? 'EPDF_GetPageSizeByIndexNormalized' : 'FPDF_GetPageSizeByIndexF'} failed with ${lastError}`,
        );
        this.memoryManager.free(sizePtr);
        this.pdfiumModule.FPDF_CloseDocument(docPtr);
        this.memoryManager.free(filePtr);
        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `OpenDocumentBuffer`, 'End', file.id);
        return PdfTaskHelper.reject<PdfDocumentObject>({
          code: lastError,
          message: `${normalizeRotation ? 'EPDF_GetPageSizeByIndexNormalized' : 'FPDF_GetPageSizeByIndexF'} failed`,
        });
      }

      const rotation = this.pdfiumModule.EPDF_GetPageRotationByIndex(docPtr, index) as Rotation;

      const page = {
        index,
        size: {
          width: this.pdfiumModule.pdfium.getValue(sizePtr, 'float'),
          height: this.pdfiumModule.pdfium.getValue(sizePtr + 4, 'float'),
        },
        rotation,
      };

      pages.push(page);
    }
    this.memoryManager.free(sizePtr);

    // Query security state
    const isEncrypted = this.pdfiumModule.EPDF_IsEncrypted(docPtr);
    const isOwnerUnlocked = this.pdfiumModule.EPDF_IsOwnerUnlocked(docPtr);
    const permissions = this.pdfiumModule.FPDF_GetDocPermissions(docPtr);

    const pdfDoc: PdfDocumentObject = {
      id: file.id,
      pageCount,
      pages,
      isEncrypted,
      isOwnerUnlocked,
      permissions,
      normalizedRotation: normalizeRotation,
    };

    this.cache.setDocument(file.id, filePtr, docPtr, normalizeRotation);

    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `OpenDocumentBuffer`, 'End', file.id);

    return PdfTaskHelper.resolve(pdfDoc);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getMetadata}
   *
   * @public
   */
  getMetadata(doc: PdfDocumentObject): PdfTask<PdfMetadataObject> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getMetadata', doc);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `GetMetadata`, 'Begin', doc.id);

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `GetMetadata`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const creationRaw = this.readMetaText(ctx.docPtr, 'CreationDate');
    const modRaw = this.readMetaText(ctx.docPtr, 'ModDate');

    const metadata: PdfMetadataObject = {
      title: this.readMetaText(ctx.docPtr, 'Title'),
      author: this.readMetaText(ctx.docPtr, 'Author'),
      subject: this.readMetaText(ctx.docPtr, 'Subject'),
      keywords: this.readMetaText(ctx.docPtr, 'Keywords'),
      producer: this.readMetaText(ctx.docPtr, 'Producer'),
      creator: this.readMetaText(ctx.docPtr, 'Creator'),
      creationDate: creationRaw ? (pdfDateToDate(creationRaw) ?? null) : null,
      modificationDate: modRaw ? (pdfDateToDate(modRaw) ?? null) : null,
      trapped: this.getMetaTrapped(ctx.docPtr),
      custom: this.readAllMeta(ctx.docPtr, true),
    };

    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `GetMetadata`, 'End', doc.id);

    return PdfTaskHelper.resolve(metadata);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.setMetadata}
   *
   * @public
   */
  setMetadata(doc: PdfDocumentObject, meta: Partial<PdfMetadataObject>) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'setMetadata', doc, meta);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'SetMetadata', 'Begin', doc.id);

    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'SetMetadata', 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    // Field -> PDF Info key
    const strMap: Array<[keyof PdfMetadataObject, string]> = [
      ['title', 'Title'],
      ['author', 'Author'],
      ['subject', 'Subject'],
      ['keywords', 'Keywords'],
      ['producer', 'Producer'],
      ['creator', 'Creator'],
    ];

    let ok = true;

    // Write string fields (string|null|undefined)
    for (const [field, key] of strMap) {
      const v = meta[field];
      if (v === undefined) continue;
      const s = v === null ? null : (v as string);
      if (!this.setMetaText(ctx.docPtr, key, s)) ok = false;
    }

    // Write date fields (Date|null|undefined)
    const writeDate = (
      field: 'creationDate' | 'modificationDate',
      key: 'CreationDate' | 'ModDate',
    ) => {
      const v = meta[field];
      if (v === undefined) return;
      if (v === null) {
        if (!this.setMetaText(ctx.docPtr, key, null)) ok = false;
        return;
      }
      const d = v as Date;
      const raw = dateToPdfDate(d);
      if (!this.setMetaText(ctx.docPtr, key, raw)) ok = false;
    };

    writeDate('creationDate', 'CreationDate');
    writeDate('modificationDate', 'ModDate');

    if (meta.trapped !== undefined) {
      if (!this.setMetaTrapped(ctx.docPtr, meta.trapped ?? null)) ok = false;
    }

    if (meta.custom !== undefined) {
      for (const [key, value] of Object.entries(meta.custom)) {
        if (!isValidCustomKey(key)) {
          this.logger.warn(LOG_SOURCE, LOG_CATEGORY, 'Invalid custom metadata key skipped', key);
          continue;
        }
        if (!this.setMetaText(ctx.docPtr, key, value ?? null)) ok = false;
      }
    }

    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'SetMetadata', 'End', doc.id);

    return ok
      ? PdfTaskHelper.resolve(true)
      : PdfTaskHelper.reject({
          code: PdfErrorCode.Unknown,
          message: 'one or more metadata fields could not be written',
        });
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getDocPermissions}
   *
   * @public
   */
  getDocPermissions(doc: PdfDocumentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getDocPermissions', doc);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `getDocPermissions`, 'Begin', doc.id);

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `getDocPermissions`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const permissions = this.pdfiumModule.FPDF_GetDocPermissions(ctx.docPtr);

    return PdfTaskHelper.resolve(permissions);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getDocUserPermissions}
   *
   * @public
   */
  getDocUserPermissions(doc: PdfDocumentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getDocUserPermissions', doc);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `getDocUserPermissions`, 'Begin', doc.id);

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `getDocUserPermissions`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const permissions = this.pdfiumModule.FPDF_GetDocUserPermissions(ctx.docPtr);

    return PdfTaskHelper.resolve(permissions);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getSignatures}
   *
   * @public
   */
  getSignatures(doc: PdfDocumentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getSignatures', doc);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `GetSignatures`, 'Begin', doc.id);

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `GetSignatures`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const signatures: PdfSignatureObject[] = [];

    const count = this.pdfiumModule.FPDF_GetSignatureCount(ctx.docPtr);
    for (let i = 0; i < count; i++) {
      const signatureObjPtr = this.pdfiumModule.FPDF_GetSignatureObject(ctx.docPtr, i);

      const contents = readArrayBuffer(this.pdfiumModule.pdfium, (buffer, bufferSize) => {
        return this.pdfiumModule.FPDFSignatureObj_GetContents(signatureObjPtr, buffer, bufferSize);
      });

      const byteRange = readArrayBuffer(this.pdfiumModule.pdfium, (buffer, bufferSize) => {
        return (
          this.pdfiumModule.FPDFSignatureObj_GetByteRange(signatureObjPtr, buffer, bufferSize) * 4
        );
      });

      const subFilter = readArrayBuffer(this.pdfiumModule.pdfium, (buffer, bufferSize) => {
        return this.pdfiumModule.FPDFSignatureObj_GetSubFilter(signatureObjPtr, buffer, bufferSize);
      });

      const reason = readString(
        this.pdfiumModule.pdfium,
        (buffer, bufferLength) => {
          return this.pdfiumModule.FPDFSignatureObj_GetReason(
            signatureObjPtr,
            buffer,
            bufferLength,
          );
        },
        this.pdfiumModule.pdfium.UTF16ToString,
      );

      const time = readString(
        this.pdfiumModule.pdfium,
        (buffer, bufferLength) => {
          return this.pdfiumModule.FPDFSignatureObj_GetTime(signatureObjPtr, buffer, bufferLength);
        },
        this.pdfiumModule.pdfium.UTF8ToString,
      );

      const docMDP = this.pdfiumModule.FPDFSignatureObj_GetDocMDPPermission(signatureObjPtr);

      signatures.push({
        contents,
        byteRange,
        subFilter,
        reason,
        time,
        docMDP,
      });
    }
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `GetSignatures`, 'End', doc.id);

    return PdfTaskHelper.resolve(signatures);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getBookmarks}
   *
   * @public
   */
  getBookmarks(doc: PdfDocumentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getBookmarks', doc);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `GetBookmarks`, 'Begin', doc.id);

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `getBookmarks`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const bookmarks = this.readPdfBookmarks(ctx.docPtr, 0);

    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `GetBookmarks`, 'End', doc.id);

    return PdfTaskHelper.resolve({
      bookmarks,
    });
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.setBookmarks}
   *
   * @public
   */
  setBookmarks(doc: PdfDocumentObject, list: PdfBookmarkObject[]) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'setBookmarks', doc, list);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `SetBookmarks`, 'Begin', doc.id);

    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `SetBookmarks`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    // Clear any existing outlines
    if (!this.pdfiumModule.EPDFBookmark_Clear(ctx.docPtr)) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `SetBookmarks`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Unknown,
        message: 'failed to clear existing bookmarks',
      });
    }

    // Recursive builder
    const build = (parentPtr: number, items: PdfBookmarkObject[]): boolean => {
      let prevChild = 0;
      for (const item of items) {
        // Create
        const bmPtr = this.withWString(item.title ?? '', (wptr) =>
          this.pdfiumModule.EPDFBookmark_AppendChild(ctx.docPtr, parentPtr, wptr),
        );
        if (!bmPtr) return false;

        // Target (optional)
        if (item.target) {
          const ok = this.applyBookmarkTarget(ctx.docPtr, bmPtr, item.target);
          if (!ok) return false;
        }

        // Children
        if (item.children?.length) {
          const ok = build(bmPtr, item.children);
          if (!ok) return false;
        }

        prevChild = bmPtr;
      }
      return true;
    };

    const ok = build(/*top-level*/ 0, list);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `SetBookmarks`, 'End', doc.id);

    if (!ok) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Unknown,
        message: 'failed to build bookmark tree',
      });
    }
    return PdfTaskHelper.resolve(true);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.deleteBookmarks}
   *
   * @public
   */
  deleteBookmarks(doc: PdfDocumentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'deleteBookmarks', doc);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `DeleteBookmarks`, 'Begin', doc.id);

    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `DeleteBookmarks`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const ok = this.pdfiumModule.EPDFBookmark_Clear(ctx.docPtr);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `DeleteBookmarks`, 'End', doc.id);

    return ok
      ? PdfTaskHelper.resolve(true)
      : PdfTaskHelper.reject({
          code: PdfErrorCode.Unknown,
          message: 'failed to clear bookmarks',
        });
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.renderPage}
   *
   * @public
   */
  renderPageRaw(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    options?: PdfRenderPageOptions,
  ): PdfTask<ImageDataLike> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'renderPage', doc, page, options);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `RenderPage`, 'Begin', `${doc.id}-${page.index}`);

    const rect = { origin: { x: 0, y: 0 }, size: page.size };
    const task = this.renderRectEncoded(doc, page, rect, options);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `RenderPage`, 'End', `${doc.id}-${page.index}`);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.renderPageRect}
   *
   * @public
   */
  renderPageRect(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    rect: Rect,
    options?: PdfRenderPageOptions,
  ): PdfTask<ImageDataLike> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'renderPageRect', doc, page, rect, options);
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `RenderPageRect`,
      'Begin',
      `${doc.id}-${page.index}`,
    );

    const task = this.renderRectEncoded(doc, page, rect, options);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `RenderPageRect`, 'End', `${doc.id}-${page.index}`);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getPageAnnotations}
   *
   * @public
   */
  getPageAnnotations(doc: PdfDocumentObject, page: PdfPageObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getPageAnnotations', doc, page);
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `GetPageAnnotations`,
      'Begin',
      `${doc.id}-${page.index}`,
    );

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        `GetPageAnnotations`,
        'End',
        `${doc.id}-${page.index}`,
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const annotations = this.readPageAnnotations(doc, ctx, page);

    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `GetPageAnnotations`,
      'End',
      `${doc.id}-${page.index}`,
    );

    this.logger.debug(
      LOG_SOURCE,
      LOG_CATEGORY,
      `GetPageAnnotations`,
      `${doc.id}-${page.index}`,
      annotations,
    );

    return PdfTaskHelper.resolve(annotations);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.createPageAnnotation}
   *
   * @public
   */
  createPageAnnotation<A extends PdfAnnotationObject>(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: A,
    context?: AnnotationCreateContext<A>,
  ): PdfTask<string> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'createPageAnnotation', doc, page, annotation);
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `CreatePageAnnotation`,
      'Begin',
      `${doc.id}-${page.index}`,
    );

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        `CreatePageAnnotation`,
        'End',
        `${doc.id}-${page.index}`,
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const pageCtx = ctx.acquirePage(page.index);
    const annotationPtr = this.pdfiumModule.EPDFPage_CreateAnnot(pageCtx.pagePtr, annotation.type);
    if (!annotationPtr) {
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        `CreatePageAnnotation`,
        'End',
        `${doc.id}-${page.index}`,
      );
      pageCtx.release();

      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantCreateAnnot,
        message: 'can not create annotation with specified type',
      });
    }

    if (!isUuidV4(annotation.id)) {
      annotation.id = uuidV4();
    }

    if (!this.setAnnotString(annotationPtr, 'NM', annotation.id)) {
      this.pdfiumModule.FPDFPage_CloseAnnot(annotationPtr);
      pageCtx.release();
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantSetAnnotString,
        message: 'can not set the name of the annotation',
      });
    }

    if (!this.setPageAnnoRect(doc, page, annotationPtr, annotation.rect)) {
      this.pdfiumModule.FPDFPage_CloseAnnot(annotationPtr);
      pageCtx.release();
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        `CreatePageAnnotation`,
        'End',
        `${doc.id}-${page.index}`,
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantSetAnnotRect,
        message: 'can not set the rect of the annotation',
      });
    }

    // Rotate vertices for PDF storage if the annotation has rotation
    const saveAnnotation = this.prepareAnnotationForSave(annotation);

    let isSucceed = false;
    switch (saveAnnotation.type) {
      case PdfAnnotationSubtype.INK:
        isSucceed = this.addInkStroke(
          doc,
          page,
          pageCtx.pagePtr,
          annotationPtr,
          saveAnnotation as PdfInkAnnoObject,
        );
        break;
      case PdfAnnotationSubtype.STAMP:
        isSucceed = this.addStampContent(
          doc,
          ctx.docPtr,
          page,
          pageCtx.pagePtr,
          annotationPtr,
          saveAnnotation as PdfStampAnnoObject,
          context?.imageData,
        );
        break;
      case PdfAnnotationSubtype.TEXT:
        isSucceed = this.addTextContent(
          doc,
          page,
          pageCtx.pagePtr,
          annotationPtr,
          saveAnnotation as PdfTextAnnoObject,
        );
        break;
      case PdfAnnotationSubtype.FREETEXT:
        isSucceed = this.addFreeTextContent(
          doc,
          page,
          pageCtx.pagePtr,
          annotationPtr,
          saveAnnotation as PdfFreeTextAnnoObject,
        );
        break;
      case PdfAnnotationSubtype.LINE:
        isSucceed = this.addLineContent(
          doc,
          page,
          pageCtx.pagePtr,
          annotationPtr,
          saveAnnotation as PdfLineAnnoObject,
        );
        break;
      case PdfAnnotationSubtype.POLYLINE:
      case PdfAnnotationSubtype.POLYGON:
        isSucceed = this.addPolyContent(
          doc,
          page,
          pageCtx.pagePtr,
          annotationPtr,
          saveAnnotation as PdfPolygonAnnoObject | PdfPolylineAnnoObject,
        );
        break;
      case PdfAnnotationSubtype.CIRCLE:
      case PdfAnnotationSubtype.SQUARE:
        isSucceed = this.addShapeContent(doc, page, pageCtx.pagePtr, annotationPtr, saveAnnotation);
        break;
      case PdfAnnotationSubtype.UNDERLINE:
      case PdfAnnotationSubtype.STRIKEOUT:
      case PdfAnnotationSubtype.SQUIGGLY:
      case PdfAnnotationSubtype.HIGHLIGHT:
        isSucceed = this.addTextMarkupContent(
          doc,
          page,
          pageCtx.pagePtr,
          annotationPtr,
          saveAnnotation as PdfHighlightAnnoObject,
        );
        break;
      case PdfAnnotationSubtype.LINK:
        isSucceed = this.addLinkContent(
          doc,
          page,
          ctx.docPtr,
          pageCtx.pagePtr,
          annotationPtr,
          saveAnnotation as PdfLinkAnnoObject,
        );
        break;
      case PdfAnnotationSubtype.REDACT:
        isSucceed = this.addRedactContent(
          doc,
          page,
          pageCtx.pagePtr,
          annotationPtr,
          saveAnnotation as PdfRedactAnnoObject,
        );
        break;
    }

    if (!isSucceed) {
      this.pdfiumModule.FPDFPage_RemoveAnnot(pageCtx.pagePtr, annotationPtr);
      pageCtx.release();
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        `CreatePageAnnotation`,
        'End',
        `${doc.id}-${page.index}`,
      );

      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantSetAnnotContent,
        message: 'can not add content of the annotation',
      });
    }

    if (annotation.blendMode !== undefined) {
      this.pdfiumModule.EPDFAnnot_GenerateAppearanceWithBlend(annotationPtr, annotation.blendMode);
    } else {
      this.pdfiumModule.EPDFAnnot_GenerateAppearance(annotationPtr);
    }

    this.pdfiumModule.FPDFPage_GenerateContent(pageCtx.pagePtr);

    this.pdfiumModule.FPDFPage_CloseAnnot(annotationPtr);
    pageCtx.release();
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `CreatePageAnnotation`,
      'End',
      `${doc.id}-${page.index}`,
    );

    return PdfTaskHelper.resolve<string>(annotation.id);
  }

  /**
   * Update an existing page annotation in-place
   *
   *  • Locates the annot by page-local index (`annotation.id`)
   *  • Re-writes its /Rect and type-specific payload
   *  • Calls FPDFPage_GenerateContent so the new appearance is rendered
   *
   * @returns PdfTask<boolean>  –  true on success
   */
  updatePageAnnotation(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
  ): PdfTask<boolean> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'updatePageAnnotation', doc, page, annotation);
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      'UpdatePageAnnotation',
      'Begin',
      `${doc.id}-${page.index}`,
    );

    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        'UpdatePageAnnotation',
        'End',
        `${doc.id}-${page.index}`,
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const pageCtx = ctx.acquirePage(page.index);
    const annotPtr = this.getAnnotationByName(pageCtx.pagePtr, annotation.id);
    if (!annotPtr) {
      pageCtx.release();
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        'UpdatePageAnnotation',
        'End',
        `${doc.id}-${page.index}`,
      );
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'annotation not found' });
    }

    /* 1 ── (re)set bounding-box ────────────────────────────────────────────── */
    if (!this.setPageAnnoRect(doc, page, annotPtr, annotation.rect)) {
      this.pdfiumModule.FPDFPage_CloseAnnot(annotPtr);
      pageCtx.release();
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        'UpdatePageAnnotation',
        'End',
        `${doc.id}-${page.index}`,
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantSetAnnotRect,
        message: 'failed to move annotation',
      });
    }

    /* 2 ── For rotated vertex types, rotate vertices for PDF storage ────────── */
    // PDF stores physically rotated vertices so other viewers render correctly.
    // Our viewer stores unrotated vertices + rotation metadata in EPDFCustom.
    const saveAnnotation = this.prepareAnnotationForSave(annotation);

    /* 3 ── wipe previous payload and rebuild fresh one ─────────────────────── */
    let ok = false;
    switch (saveAnnotation.type) {
      /* ── Ink ─────────────────────────────────────────────────────────────── */
      case PdfAnnotationSubtype.INK: {
        /* clear every existing stroke first */
        if (!this.pdfiumModule.FPDFAnnot_RemoveInkList(annotPtr)) break;
        ok = this.addInkStroke(
          doc,
          page,
          pageCtx.pagePtr,
          annotPtr,
          saveAnnotation as PdfInkAnnoObject,
        );
        break;
      }

      /* ── Stamp ───────────────────────────────────────────────────────────── */
      case PdfAnnotationSubtype.STAMP: {
        ok = this.addStampContent(
          doc,
          ctx.docPtr,
          page,
          pageCtx.pagePtr,
          annotPtr,
          saveAnnotation as PdfStampAnnoObject,
        );
        break;
      }

      case PdfAnnotationSubtype.TEXT: {
        ok = this.addTextContent(
          doc,
          page,
          pageCtx.pagePtr,
          annotPtr,
          saveAnnotation as PdfTextAnnoObject,
        );
        break;
      }

      /* ── Free text ────────────────────────────────────────────────────────── */
      case PdfAnnotationSubtype.FREETEXT: {
        ok = this.addFreeTextContent(
          doc,
          page,
          pageCtx.pagePtr,
          annotPtr,
          saveAnnotation as PdfFreeTextAnnoObject,
        );
        break;
      }

      /* ── Shape ───────────────────────────────────────────────────────────── */
      case PdfAnnotationSubtype.CIRCLE:
      case PdfAnnotationSubtype.SQUARE: {
        ok = this.addShapeContent(doc, page, pageCtx.pagePtr, annotPtr, saveAnnotation);
        break;
      }

      /* ── Line ─────────────────────────────────────────────────────────────── */
      case PdfAnnotationSubtype.LINE: {
        ok = this.addLineContent(
          doc,
          page,
          pageCtx.pagePtr,
          annotPtr,
          saveAnnotation as PdfLineAnnoObject,
        );
        break;
      }

      /* ── Polygon / Polyline ───────────────────────────────────────────────── */
      case PdfAnnotationSubtype.POLYGON:
      case PdfAnnotationSubtype.POLYLINE: {
        ok = this.addPolyContent(
          doc,
          page,
          pageCtx.pagePtr,
          annotPtr,
          saveAnnotation as PdfPolygonAnnoObject | PdfPolylineAnnoObject,
        );
        break;
      }

      /* ── Text-markup family ──────────────────────────────────────────────── */
      case PdfAnnotationSubtype.HIGHLIGHT:
      case PdfAnnotationSubtype.UNDERLINE:
      case PdfAnnotationSubtype.STRIKEOUT:
      case PdfAnnotationSubtype.SQUIGGLY: {
        /* replace quad-points / colour / strings in one go */
        ok = this.addTextMarkupContent(
          doc,
          page,
          pageCtx.pagePtr,
          annotPtr,
          saveAnnotation as PdfHighlightAnnoObject,
        );
        break;
      }

      /* ── Link ─────────────────────────────────────────────────────────────── */
      case PdfAnnotationSubtype.LINK: {
        ok = this.addLinkContent(
          doc,
          page,
          ctx.docPtr,
          pageCtx.pagePtr,
          annotPtr,
          saveAnnotation as PdfLinkAnnoObject,
        );
        break;
      }

      /* ── Redact ───────────────────────────────────────────────────────────── */
      case PdfAnnotationSubtype.REDACT: {
        ok = this.addRedactContent(
          doc,
          page,
          pageCtx.pagePtr,
          annotPtr,
          saveAnnotation as PdfRedactAnnoObject,
        );
        break;
      }

      /* ── Unsupported edits – fall through to error ───────────────────────── */
      default:
        ok = false;
    }

    /* 4 ── regenerate appearance if payload was changed ───────────────────── */
    if (ok) {
      if (annotation.blendMode !== undefined) {
        this.pdfiumModule.EPDFAnnot_GenerateAppearanceWithBlend(annotPtr, annotation.blendMode);
      } else {
        this.pdfiumModule.EPDFAnnot_GenerateAppearance(annotPtr);
      }
      this.pdfiumModule.FPDFPage_GenerateContent(pageCtx.pagePtr);
    }

    /* 5 ── tidy-up native handles ──────────────────────────────────────────── */
    this.pdfiumModule.FPDFPage_CloseAnnot(annotPtr);
    pageCtx.release();
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      'UpdatePageAnnotation',
      'End',
      `${doc.id}-${page.index}`,
    );

    return ok
      ? PdfTaskHelper.resolve<boolean>(true)
      : PdfTaskHelper.reject<boolean>({
          code: PdfErrorCode.CantSetAnnotContent,
          message: 'failed to update annotation',
        });
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.removePageAnnotation}
   *
   * @public
   */
  removePageAnnotation(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
  ) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'removePageAnnotation', doc, page, annotation);
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `RemovePageAnnotation`,
      'Begin',
      `${doc.id}-${page.index}`,
    );

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        `RemovePageAnnotation`,
        'End',
        `${doc.id}-${page.index}`,
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const pageCtx = ctx.acquirePage(page.index);
    let result = false;
    result = this.removeAnnotationByName(pageCtx.pagePtr, annotation.id);
    if (!result) {
      this.logger.error(
        LOG_SOURCE,
        LOG_CATEGORY,
        `FPDFPage_RemoveAnnot Failed`,
        `${doc.id}-${page.index}`,
      );
    } else {
      result = this.pdfiumModule.FPDFPage_GenerateContent(pageCtx.pagePtr);
      if (!result) {
        this.logger.error(
          LOG_SOURCE,
          LOG_CATEGORY,
          `FPDFPage_GenerateContent Failed`,
          `${doc.id}-${page.index}`,
        );
      }
    }

    pageCtx.release();

    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `RemovePageAnnotation`,
      'End',
      `${doc.id}-${page.index}`,
    );
    return PdfTaskHelper.resolve(result);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getPageTextRects}
   *
   * @public
   */
  getPageTextRects(doc: PdfDocumentObject, page: PdfPageObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getPageTextRects', doc, page);
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `GetPageTextRects`,
      'Begin',
      `${doc.id}-${page.index}`,
    );

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        `GetPageTextRects`,
        'End',
        `${doc.id}-${page.index}`,
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const pageCtx = ctx.acquirePage(page.index);
    const textPagePtr = this.pdfiumModule.FPDFText_LoadPage(pageCtx.pagePtr);

    const textRects = this.readPageTextRects(page, pageCtx.docPtr, pageCtx.pagePtr, textPagePtr);

    this.pdfiumModule.FPDFText_ClosePage(textPagePtr);
    pageCtx.release();

    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `GetPageTextRects`,
      'End',
      `${doc.id}-${page.index}`,
    );
    return PdfTaskHelper.resolve(textRects);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.renderThumbnail}
   *
   * @public
   */
  renderThumbnailRaw(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    options?: PdfRenderThumbnailOptions,
  ): PdfTask<ImageDataLike> {
    const { scaleFactor = 1, ...rest } = options ?? {};
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'renderThumbnail', doc, page, options);
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `RenderThumbnail`,
      'Begin',
      `${doc.id}-${page.index}`,
    );

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        `RenderThumbnail`,
        'End',
        `${doc.id}-${page.index}`,
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const result = this.renderPageRaw(doc, page, {
      scaleFactor: Math.max(scaleFactor, 0.5),
      ...rest,
    });
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `RenderThumbnail`, 'End', `${doc.id}-${page.index}`);

    return result;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getAttachments}
   *
   * @public
   */
  getAttachments(doc: PdfDocumentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getAttachments', doc);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `GetAttachments`, 'Begin', doc.id);

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `GetAttachments`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const attachments: PdfAttachmentObject[] = [];

    const count = this.pdfiumModule.FPDFDoc_GetAttachmentCount(ctx.docPtr);
    for (let i = 0; i < count; i++) {
      const attachment = this.readPdfAttachment(ctx.docPtr, i);
      attachments.push(attachment);
    }

    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `GetAttachments`, 'End', doc.id);
    return PdfTaskHelper.resolve(attachments);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.addAttachment}
   *
   * @public
   */
  addAttachment(doc: PdfDocumentObject, params: PdfAddAttachmentParams): PdfTask<boolean> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'addAttachment', doc, params?.name);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `AddAttachment`, 'Begin', doc.id);

    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `AddAttachment`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const { name, description, mimeType, data } = params ?? {};
    if (!name) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `AddAttachment`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'attachment name is required',
      });
    }
    if (!data || (data instanceof Uint8Array ? data.byteLength === 0 : data.byteLength === 0)) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `AddAttachment`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'attachment data is empty',
      });
    }

    // 1) Create the attachment handle (also inserts into the EmbeddedFiles name tree).
    const attachmentPtr = this.withWString(name, (wNamePtr) =>
      this.pdfiumModule.FPDFDoc_AddAttachment(ctx.docPtr, wNamePtr),
    );

    if (!attachmentPtr) {
      // Most likely: duplicate name in the name tree.
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `AddAttachment`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Unknown,
        message: `An attachment named "${name}" already exists`,
      });
    }

    this.withWString(description, (wDescriptionPtr) =>
      this.pdfiumModule.EPDFAttachment_SetDescription(attachmentPtr, wDescriptionPtr),
    );

    this.pdfiumModule.EPDFAttachment_SetSubtype(attachmentPtr, mimeType);

    // 3) Copy data into WASM memory and call SetFile (this stores bytes and fills Size/CreationDate/CheckSum)
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    const len = u8.byteLength;

    const contentPtr = this.memoryManager.malloc(len);
    try {
      this.pdfiumModule.pdfium.HEAPU8.set(u8, contentPtr);
      const ok = this.pdfiumModule.FPDFAttachment_SetFile(
        attachmentPtr,
        ctx.docPtr,
        contentPtr,
        len,
      );
      if (!ok) {
        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `AddAttachment`, 'End', doc.id);
        return PdfTaskHelper.reject({
          code: PdfErrorCode.Unknown,
          message: 'failed to write attachment bytes',
        });
      }
    } finally {
      this.memoryManager.free(contentPtr);
    }

    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `AddAttachment`, 'End', doc.id);
    return PdfTaskHelper.resolve<boolean>(true);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.removeAttachment}
   *
   * @public
   */
  removeAttachment(doc: PdfDocumentObject, attachment: PdfAttachmentObject): PdfTask<boolean> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'deleteAttachment', doc, attachment);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `DeleteAttachment`, 'Begin', doc.id);

    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `DeleteAttachment`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const count = this.pdfiumModule.FPDFDoc_GetAttachmentCount(ctx.docPtr);
    if (attachment.index < 0 || attachment.index >= count) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `DeleteAttachment`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Unknown,
        message: `attachment index ${attachment.index} out of range`,
      });
    }

    const ok = this.pdfiumModule.FPDFDoc_DeleteAttachment(ctx.docPtr, attachment.index);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `DeleteAttachment`, 'End', doc.id);

    if (!ok) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Unknown,
        message: 'failed to delete attachment',
      });
    }
    return PdfTaskHelper.resolve<boolean>(true);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.readAttachmentContent}
   *
   * @public
   */
  readAttachmentContent(doc: PdfDocumentObject, attachment: PdfAttachmentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'readAttachmentContent', doc, attachment);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `ReadAttachmentContent`, 'Begin', doc.id);

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `ReadAttachmentContent`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const attachmentPtr = this.pdfiumModule.FPDFDoc_GetAttachment(ctx.docPtr, attachment.index);
    const sizePtr = this.memoryManager.malloc(4);
    if (!this.pdfiumModule.FPDFAttachment_GetFile(attachmentPtr, 0, 0, sizePtr)) {
      this.memoryManager.free(sizePtr);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `ReadAttachmentContent`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantReadAttachmentSize,
        message: 'can not read attachment size',
      });
    }
    const size = this.pdfiumModule.pdfium.getValue(sizePtr, 'i32') >>> 0;

    const contentPtr = this.memoryManager.malloc(size);
    if (!this.pdfiumModule.FPDFAttachment_GetFile(attachmentPtr, contentPtr, size, sizePtr)) {
      this.memoryManager.free(sizePtr);
      this.memoryManager.free(contentPtr);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `ReadAttachmentContent`, 'End', doc.id);

      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantReadAttachmentContent,
        message: 'can not read attachment content',
      });
    }

    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    for (let i = 0; i < size; i++) {
      view.setInt8(i, this.pdfiumModule.pdfium.getValue(contentPtr + i, 'i8'));
    }

    this.memoryManager.free(sizePtr);
    this.memoryManager.free(contentPtr);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `ReadAttachmentContent`, 'End', doc.id);

    return PdfTaskHelper.resolve(buffer);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.setFormFieldValue}
   *
   * @public
   */
  setFormFieldValue(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfWidgetAnnoObject,
    value: FormFieldValue,
  ) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'SetFormFieldValue', doc, annotation, value);
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `SetFormFieldValue`,
      'Begin',
      `${doc.id}-${annotation.id}`,
    );

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'SetFormFieldValue', 'document is not opened');
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        `SetFormFieldValue`,
        'End',
        `${doc.id}-${annotation.id}`,
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const formFillInfoPtr = this.pdfiumModule.PDFiumExt_OpenFormFillInfo();
    const formHandle = this.pdfiumModule.PDFiumExt_InitFormFillEnvironment(
      ctx.docPtr,
      formFillInfoPtr,
    );

    const pageCtx = ctx.acquirePage(page.index);

    this.pdfiumModule.FORM_OnAfterLoadPage(pageCtx.pagePtr, formHandle);

    const annotationPtr = this.getAnnotationByName(pageCtx.pagePtr, annotation.id);

    if (!annotationPtr) {
      pageCtx.release();
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        'SetFormFieldValue',
        'End',
        `${doc.id}-${page.index}`,
      );
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'annotation not found' });
    }

    if (!this.pdfiumModule.FORM_SetFocusedAnnot(formHandle, annotationPtr)) {
      this.logger.debug(
        LOG_SOURCE,
        LOG_CATEGORY,
        'SetFormFieldValue',
        'failed to set focused annotation',
      );
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        `SetFormFieldValue`,
        'End',
        `${doc.id}-${annotation.id}`,
      );
      this.pdfiumModule.FPDFPage_CloseAnnot(annotationPtr);
      this.pdfiumModule.FORM_OnBeforeClosePage(pageCtx.pagePtr, formHandle);
      pageCtx.release();
      this.pdfiumModule.PDFiumExt_ExitFormFillEnvironment(formHandle);
      this.pdfiumModule.PDFiumExt_CloseFormFillInfo(formFillInfoPtr);

      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantFocusAnnot,
        message: 'failed to set focused annotation',
      });
    }

    switch (value.kind) {
      case 'text':
        {
          if (!this.pdfiumModule.FORM_SelectAllText(formHandle, pageCtx.pagePtr)) {
            this.logger.debug(
              LOG_SOURCE,
              LOG_CATEGORY,
              'SetFormFieldValue',
              'failed to select all text',
            );
            this.logger.perf(
              LOG_SOURCE,
              LOG_CATEGORY,
              `SetFormFieldValue`,
              'End',
              `${doc.id}-${annotation.id}`,
            );
            this.pdfiumModule.FORM_ForceToKillFocus(formHandle);
            this.pdfiumModule.FPDFPage_CloseAnnot(annotationPtr);
            this.pdfiumModule.FORM_OnBeforeClosePage(pageCtx.pagePtr, formHandle);
            pageCtx.release();
            this.pdfiumModule.PDFiumExt_ExitFormFillEnvironment(formHandle);
            this.pdfiumModule.PDFiumExt_CloseFormFillInfo(formFillInfoPtr);

            return PdfTaskHelper.reject({
              code: PdfErrorCode.CantSelectText,
              message: 'failed to select all text',
            });
          }
          const length = 2 * (value.text.length + 1);
          const textPtr = this.memoryManager.malloc(length);
          this.pdfiumModule.pdfium.stringToUTF16(value.text, textPtr, length);
          this.pdfiumModule.FORM_ReplaceSelection(formHandle, pageCtx.pagePtr, textPtr);
          this.memoryManager.free(textPtr);
        }
        break;
      case 'selection':
        {
          if (
            !this.pdfiumModule.FORM_SetIndexSelected(
              formHandle,
              pageCtx.pagePtr,
              value.index,
              value.isSelected,
            )
          ) {
            this.logger.debug(
              LOG_SOURCE,
              LOG_CATEGORY,
              'SetFormFieldValue',
              'failed to set index selected',
            );
            this.logger.perf(
              LOG_SOURCE,
              LOG_CATEGORY,
              `SetFormFieldValue`,
              'End',
              `${doc.id}-${annotation.id}`,
            );
            this.pdfiumModule.FORM_ForceToKillFocus(formHandle);
            this.pdfiumModule.FPDFPage_CloseAnnot(annotationPtr);
            this.pdfiumModule.FORM_OnBeforeClosePage(pageCtx.pagePtr, formHandle);
            pageCtx.release();
            this.pdfiumModule.PDFiumExt_ExitFormFillEnvironment(formHandle);
            this.pdfiumModule.PDFiumExt_CloseFormFillInfo(formFillInfoPtr);

            return PdfTaskHelper.reject({
              code: PdfErrorCode.CantSelectOption,
              message: 'failed to set index selected',
            });
          }
        }
        break;
      case 'checked':
        {
          const kReturn = 0x0d;
          if (!this.pdfiumModule.FORM_OnChar(formHandle, pageCtx.pagePtr, kReturn, 0)) {
            this.logger.debug(
              LOG_SOURCE,
              LOG_CATEGORY,
              'SetFormFieldValue',
              'failed to set field checked',
            );
            this.logger.perf(
              LOG_SOURCE,
              LOG_CATEGORY,
              `SetFormFieldValue`,
              'End',
              `${doc.id}-${annotation.id}`,
            );
            this.pdfiumModule.FORM_ForceToKillFocus(formHandle);
            this.pdfiumModule.FPDFPage_CloseAnnot(annotationPtr);
            this.pdfiumModule.FORM_OnBeforeClosePage(pageCtx.pagePtr, formHandle);
            pageCtx.release();
            this.pdfiumModule.PDFiumExt_ExitFormFillEnvironment(formHandle);
            this.pdfiumModule.PDFiumExt_CloseFormFillInfo(formFillInfoPtr);

            return PdfTaskHelper.reject({
              code: PdfErrorCode.CantCheckField,
              message: 'failed to set field checked',
            });
          }
        }
        break;
    }

    this.pdfiumModule.FORM_ForceToKillFocus(formHandle);

    this.pdfiumModule.FPDFPage_CloseAnnot(annotationPtr);
    this.pdfiumModule.FORM_OnBeforeClosePage(pageCtx.pagePtr, formHandle);
    pageCtx.release();

    this.pdfiumModule.PDFiumExt_ExitFormFillEnvironment(formHandle);
    this.pdfiumModule.PDFiumExt_CloseFormFillInfo(formFillInfoPtr);

    return PdfTaskHelper.resolve<boolean>(true);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.flattenPage}
   *
   * @public
   */
  flattenPage(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    options?: PdfFlattenPageOptions,
  ): PdfTask<PdfPageFlattenResult> {
    const { flag = PdfPageFlattenFlag.Display } = options ?? {};
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'flattenPage', doc, page, flag);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `flattenPage`, 'Begin', doc.id);

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `flattenPage`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const pageCtx = ctx.acquirePage(page.index);
    const result = this.pdfiumModule.FPDFPage_Flatten(pageCtx.pagePtr, flag);
    pageCtx.release();

    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `flattenPage`, 'End', doc.id);

    return PdfTaskHelper.resolve(result);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.extractPages}
   *
   * @public
   */
  extractPages(doc: PdfDocumentObject, pageIndexes: number[]) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'extractPages', doc, pageIndexes);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `ExtractPages`, 'Begin', doc.id);

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `ExtractPages`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const newDocPtr = this.pdfiumModule.FPDF_CreateNewDocument();
    if (!newDocPtr) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `ExtractPages`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantCreateNewDoc,
        message: 'can not create new document',
      });
    }

    const pageIndexesPtr = this.memoryManager.malloc(pageIndexes.length * 4);
    for (let i = 0; i < pageIndexes.length; i++) {
      this.pdfiumModule.pdfium.setValue(pageIndexesPtr + i * 4, pageIndexes[i], 'i32');
    }

    if (
      !this.pdfiumModule.FPDF_ImportPagesByIndex(
        newDocPtr,
        ctx.docPtr,
        pageIndexesPtr,
        pageIndexes.length,
        0,
      )
    ) {
      this.pdfiumModule.FPDF_CloseDocument(newDocPtr);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `ExtractPages`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantImportPages,
        message: 'can not import pages to new document',
      });
    }

    const buffer = this.saveDocument(newDocPtr);

    this.pdfiumModule.FPDF_CloseDocument(newDocPtr);

    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `ExtractPages`, 'End', doc.id);
    return PdfTaskHelper.resolve(buffer);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.extractText}
   *
   * @public
   */
  extractText(doc: PdfDocumentObject, pageIndexes: number[]) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'extractText', doc, pageIndexes);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `ExtractText`, 'Begin', doc.id);

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `ExtractText`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const strings: string[] = [];
    for (let i = 0; i < pageIndexes.length; i++) {
      const pageCtx = ctx.acquirePage(pageIndexes[i]);
      const textPagePtr = this.pdfiumModule.FPDFText_LoadPage(pageCtx.pagePtr);
      const charCount = this.pdfiumModule.FPDFText_CountChars(textPagePtr);
      const bufferPtr = this.memoryManager.malloc((charCount + 1) * 2);
      this.pdfiumModule.FPDFText_GetText(textPagePtr, 0, charCount, bufferPtr);
      const text = this.pdfiumModule.pdfium.UTF16ToString(bufferPtr);
      this.memoryManager.free(bufferPtr);
      strings.push(text);
      this.pdfiumModule.FPDFText_ClosePage(textPagePtr);
      pageCtx.release();
    }

    const text = strings.join('\n\n');
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `ExtractText`, 'End', doc.id);
    return PdfTaskHelper.resolve(text);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getTextSlices}
   *
   * @public
   */
  getTextSlices(doc: PdfDocumentObject, slices: PageTextSlice[]): PdfTask<string[]> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getTextSlices', doc, slices);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'GetTextSlices', 'Begin', doc.id);

    /* ⚠︎ 1 — trivial case */
    if (slices.length === 0) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'GetTextSlices', 'End', doc.id);
      return PdfTaskHelper.resolve<string[]>([]);
    }

    /* ⚠︎ 2 — document must be open */
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'GetTextSlices', 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    try {
      /* keep caller order */
      const out = new Array<string>(slices.length);

      /* group → open each page once */
      const byPage = new Map<number, { slice: PageTextSlice; pos: number }[]>();
      slices.forEach((s, i) => {
        (byPage.get(s.pageIndex) ?? byPage.set(s.pageIndex, []).get(s.pageIndex))!.push({
          slice: s,
          pos: i,
        });
      });

      for (const [pageIdx, list] of byPage) {
        const pageCtx = ctx.acquirePage(pageIdx);
        const textPagePtr = pageCtx.getTextPage();

        for (const { slice, pos } of list) {
          const bufPtr = this.memoryManager.malloc(2 * (slice.charCount + 1)); // UTF-16 + NIL
          this.pdfiumModule.FPDFText_GetText(textPagePtr, slice.charIndex, slice.charCount, bufPtr);
          out[pos] = stripPdfUnwantedMarkers(this.pdfiumModule.pdfium.UTF16ToString(bufPtr));
          this.memoryManager.free(bufPtr);
        }
        pageCtx.release();
      }

      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'GetTextSlices', 'End', doc.id);
      return PdfTaskHelper.resolve(out);
    } catch (e) {
      this.logger.error(LOG_SOURCE, LOG_CATEGORY, 'getTextSlices error', e);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'GetTextSlices', 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Unknown,
        message: String(e),
      });
    }
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.merge}
   *
   * @public
   */
  merge(files: PdfFile[]) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'merge', files);
    const fileIds = files.map((file) => file.id).join('.');
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `Merge`, 'Begin', fileIds);

    const newDocPtr = this.pdfiumModule.FPDF_CreateNewDocument();
    if (!newDocPtr) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `Merge`, 'End', fileIds);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantCreateNewDoc,
        message: 'can not create new document',
      });
    }

    const ptrs: { docPtr: number; filePtr: WasmPointer }[] = [];
    for (const file of files.reverse()) {
      const array = new Uint8Array(file.content);
      const length = array.length;
      const filePtr = this.memoryManager.malloc(length);
      this.pdfiumModule.pdfium.HEAPU8.set(array, filePtr);

      const docPtr = this.pdfiumModule.FPDF_LoadMemDocument(filePtr, length, '');
      if (!docPtr) {
        const lastError = this.pdfiumModule.FPDF_GetLastError();
        this.logger.error(
          LOG_SOURCE,
          LOG_CATEGORY,
          `FPDF_LoadMemDocument failed with ${lastError}`,
        );
        this.memoryManager.free(filePtr);

        for (const ptr of ptrs) {
          this.pdfiumModule.FPDF_CloseDocument(ptr.docPtr);
          this.memoryManager.free(ptr.filePtr);
        }

        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `Merge`, 'End', fileIds);
        return PdfTaskHelper.reject<PdfFile>({
          code: lastError,
          message: `FPDF_LoadMemDocument failed`,
        });
      }
      ptrs.push({ filePtr, docPtr });

      if (!this.pdfiumModule.FPDF_ImportPages(newDocPtr, docPtr, '', 0)) {
        this.pdfiumModule.FPDF_CloseDocument(newDocPtr);

        for (const ptr of ptrs) {
          this.pdfiumModule.FPDF_CloseDocument(ptr.docPtr);
          this.memoryManager.free(ptr.filePtr);
        }

        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `Merge`, 'End', fileIds);
        return PdfTaskHelper.reject({
          code: PdfErrorCode.CantImportPages,
          message: 'can not import pages to new document',
        });
      }
    }
    const buffer = this.saveDocument(newDocPtr);

    this.pdfiumModule.FPDF_CloseDocument(newDocPtr);

    for (const ptr of ptrs) {
      this.pdfiumModule.FPDF_CloseDocument(ptr.docPtr);
      this.memoryManager.free(ptr.filePtr);
    }

    const file: PdfFile = {
      id: `${Math.random()}`,
      content: buffer,
    };
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `Merge`, 'End', fileIds);
    return PdfTaskHelper.resolve(file);
  }

  /**
   * Merges specific pages from multiple PDF documents in a custom order
   *
   * @param mergeConfigs Array of configurations specifying which pages to merge from which documents
   * @returns A PdfTask that resolves with the merged PDF file
   * @public
   */
  mergePages(mergeConfigs: Array<{ docId: string; pageIndices: number[] }>) {
    const configIds = mergeConfigs
      .map((config) => `${config.docId}:${config.pageIndices.join(',')}`)
      .join('|');
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'mergePages', mergeConfigs);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `MergePages`, 'Begin', configIds);

    // Create a new document to import pages into
    const newDocPtr = this.pdfiumModule.FPDF_CreateNewDocument();
    if (!newDocPtr) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `MergePages`, 'End', configIds);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantCreateNewDoc,
        message: 'Cannot create new document',
      });
    }

    try {
      // Process each merge configuration in reverse order (since we're inserting at position 0)
      // This ensures the final document has pages in the order specified by the user
      for (const config of [...mergeConfigs].reverse()) {
        // Check if the document is open
        const ctx = this.cache.getContext(config.docId);

        if (!ctx) {
          this.logger.warn(
            LOG_SOURCE,
            LOG_CATEGORY,
            `Document ${config.docId} is not open, skipping`,
          );
          continue;
        }

        // Get the page count for this document
        const pageCount = this.pdfiumModule.FPDF_GetPageCount(ctx.docPtr);

        // Filter out invalid page indices
        const validPageIndices = config.pageIndices.filter(
          (index) => index >= 0 && index < pageCount,
        );

        if (validPageIndices.length === 0) {
          continue; // No valid pages to import
        }

        // Convert 0-based indices to 1-based for PDFium and join with commas
        const pageString = validPageIndices.map((index) => index + 1).join(',');

        try {
          // Import all specified pages at once from this document
          if (
            !this.pdfiumModule.FPDF_ImportPages(
              newDocPtr,
              ctx.docPtr,
              pageString,
              0, // Insert at the beginning
            )
          ) {
            throw new Error(`Failed to import pages ${pageString} from document ${config.docId}`);
          }
        } finally {
        }
      }

      // Save the new document to buffer
      const buffer = this.saveDocument(newDocPtr);

      const file: PdfFile = {
        id: `${Math.random()}`,
        content: buffer,
      };

      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `MergePages`, 'End', configIds);
      return PdfTaskHelper.resolve(file);
    } catch (error) {
      this.logger.error(LOG_SOURCE, LOG_CATEGORY, 'mergePages failed', error);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `MergePages`, 'End', configIds);

      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantImportPages,
        message: error instanceof Error ? error.message : 'Failed to merge pages',
      });
    } finally {
      // Clean up the new document
      if (newDocPtr) {
        this.pdfiumModule.FPDF_CloseDocument(newDocPtr);
      }
    }
  }

  /**
   * Sets AES-256 encryption on a document.
   * Must be called before saveAsCopy() for encryption to take effect.
   *
   * @param doc - Document to encrypt
   * @param userPassword - Password to open document (empty = no open password)
   * @param ownerPassword - Password to change permissions (required)
   * @param allowedFlags - OR'd PdfPermissionFlag values indicating allowed actions
   * @returns true on success, false if already encrypted or invalid params
   *
   * @public
   */
  setDocumentEncryption(
    doc: PdfDocumentObject,
    userPassword: string,
    ownerPassword: string,
    allowedFlags: number,
  ): PdfTask<boolean> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'setDocumentEncryption', doc, allowedFlags);

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const result = this.pdfiumModule.EPDF_SetEncryption(
      ctx.docPtr,
      userPassword,
      ownerPassword,
      allowedFlags,
    );

    return PdfTaskHelper.resolve(result);
  }

  /**
   * Marks document for encryption removal on save.
   * When saveAsCopy is called, the document will be saved without encryption.
   *
   * @param doc - Document to remove encryption from
   * @returns true on success
   *
   * @public
   */
  removeEncryption(doc: PdfDocumentObject): PdfTask<boolean> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'removeEncryption', doc);

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const result = this.pdfiumModule.EPDF_RemoveEncryption(ctx.docPtr);

    return PdfTaskHelper.resolve(result);
  }

  /**
   * Attempts to unlock owner permissions for an already-opened encrypted document.
   *
   * @param doc - Document to unlock
   * @param ownerPassword - The owner password
   * @returns true on success, false on failure
   *
   * @public
   */
  unlockOwnerPermissions(doc: PdfDocumentObject, ownerPassword: string): PdfTask<boolean> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'unlockOwnerPermissions', doc.id);

    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const success = this.pdfiumModule.EPDF_UnlockOwnerPermissions(ctx.docPtr, ownerPassword);

    return PdfTaskHelper.resolve(success);
  }

  /**
   * Check if a document is encrypted.
   *
   * @param doc - Document to check
   * @returns true if the document is encrypted
   *
   * @public
   */
  isEncrypted(doc: PdfDocumentObject): PdfTask<boolean> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'isEncrypted', doc.id);

    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const result = this.pdfiumModule.EPDF_IsEncrypted(ctx.docPtr);
    return PdfTaskHelper.resolve(result);
  }

  /**
   * Check if owner permissions are currently unlocked.
   *
   * @param doc - Document to check
   * @returns true if owner permissions are unlocked
   *
   * @public
   */
  isOwnerUnlocked(doc: PdfDocumentObject): PdfTask<boolean> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'isOwnerUnlocked', doc.id);

    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const result = this.pdfiumModule.EPDF_IsOwnerUnlocked(ctx.docPtr);
    return PdfTaskHelper.resolve(result);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.saveAsCopy}
   *
   * @public
   */
  saveAsCopy(doc: PdfDocumentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'saveAsCopy', doc);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `SaveAsCopy`, 'Begin', doc.id);

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `SaveAsCopy`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const buffer = this.saveDocument(ctx.docPtr);

    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `SaveAsCopy`, 'End', doc.id);
    return PdfTaskHelper.resolve(buffer);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.closeDocument}
   *
   * @public
   */
  closeDocument(doc: PdfDocumentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'closeDocument', doc);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `CloseDocument`, 'Begin', doc.id);

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) return PdfTaskHelper.resolve(true);

    ctx.dispose();
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `CloseDocument`, 'End', doc.id);
    return PdfTaskHelper.resolve(true);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.closeAllDocuments}
   *
   * @public
   */
  closeAllDocuments() {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'closeAllDocuments');
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `CloseAllDocuments`, 'Begin');
    this.cache.closeAllDocuments();
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `CloseAllDocuments`, 'End');
    return PdfTaskHelper.resolve(true);
  }

  /**
   * Add text content to annotation
   * @param page - page info
   * @param pagePtr - pointer to page object
   * @param annotationPtr - pointer to text annotation
   * @param annotation - text annotation
   * @returns whether text content is added to annotation
   *
   * @private
   */
  private addTextContent(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    annotation: PdfTextAnnoObject,
  ) {
    // Type-specific properties
    if (!this.setAnnotationIcon(annotationPtr, annotation.icon || PdfAnnotationIcon.Comment)) {
      return false;
    }
    if (annotation.state && !this.setAnnotString(annotationPtr, 'State', annotation.state)) {
      return false;
    }
    if (
      annotation.stateModel &&
      !this.setAnnotString(annotationPtr, 'StateModel', annotation.stateModel)
    ) {
      return false;
    }

    // Text annotations have default flags if not specified
    if (!annotation.flags) {
      if (!this.setAnnotationFlags(annotationPtr, ['print', 'noZoom', 'noRotate'])) {
        return false;
      }
    }

    // Apply base annotation properties (author, contents, dates, flags, custom, IRT, RT)
    return this.applyBaseAnnotationProperties(doc, page, pagePtr, annotationPtr, annotation);
  }

  /**
   * Add free text content to annotation
   * @param page - page info
   * @param pagePtr - pointer to page object
   * @param annotationPtr - pointer to free text annotation
   * @param annotation - free text annotation
   * @returns whether free text content is added to annotation
   *
   * @private
   */
  private addFreeTextContent(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    annotation: PdfFreeTextAnnoObject,
  ) {
    // Type-specific properties
    if (!this.setBorderStyle(annotationPtr, PdfAnnotationBorderStyle.SOLID, 0)) {
      return false;
    }
    if (!this.setAnnotationOpacity(annotationPtr, annotation.opacity ?? 1)) {
      return false;
    }
    if (!this.setAnnotationTextAlignment(annotationPtr, annotation.textAlign)) {
      return false;
    }
    if (!this.setAnnotationVerticalAlignment(annotationPtr, annotation.verticalAlign)) {
      return false;
    }
    if (
      !this.setAnnotationDefaultAppearance(
        annotationPtr,
        annotation.fontFamily,
        annotation.fontSize,
        annotation.fontColor,
      )
    ) {
      return false;
    }
    if (annotation.intent && !this.setAnnotIntent(annotationPtr, annotation.intent)) {
      return false;
    }
    // Prefer color, fall back to deprecated backgroundColor
    const bgColor = annotation.color ?? annotation.backgroundColor;
    if (!bgColor || bgColor === 'transparent') {
      if (!this.pdfiumModule.EPDFAnnot_ClearColor(annotationPtr, PdfAnnotationColorType.Color)) {
        return false;
      }
    } else if (
      !this.setAnnotationColor(annotationPtr, bgColor ?? '#FFFFFF', PdfAnnotationColorType.Color)
    ) {
      return false;
    }

    // Apply base annotation properties (author, contents, dates, flags, custom, IRT, RT)
    return this.applyBaseAnnotationProperties(doc, page, pagePtr, annotationPtr, annotation);
  }

  /**
   * Set the rect of specified annotation
   * @param page - page info that the annotation is belonged to
   * @param pagePtr - pointer of page object
   * @param annotationPtr - pointer to annotation object
   * @param inkList - ink lists that added to the annotation
   * @returns whether the ink lists is setted
   *
   * @private
   */
  private addInkStroke(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    annotation: PdfInkAnnoObject,
  ) {
    // Type-specific properties
    if (
      !this.setBorderStyle(annotationPtr, PdfAnnotationBorderStyle.SOLID, annotation.strokeWidth)
    ) {
      return false;
    }
    if (!this.setInkList(doc, page, annotationPtr, annotation.inkList)) {
      return false;
    }
    if (!this.setAnnotationOpacity(annotationPtr, annotation.opacity ?? 1)) {
      return false;
    }
    // Prefer strokeColor, fall back to deprecated color
    const strokeColor = annotation.strokeColor ?? annotation.color ?? '#FFFF00';
    if (!this.setAnnotationColor(annotationPtr, strokeColor, PdfAnnotationColorType.Color)) {
      return false;
    }

    // Apply base annotation properties (author, contents, dates, flags, custom, IRT, RT)
    return this.applyBaseAnnotationProperties(doc, page, pagePtr, annotationPtr, annotation);
  }

  /**
   * Add line content to annotation
   * @param page - page info
   * @param pagePtr - pointer to page object
   * @param annotationPtr - pointer to line annotation
   * @param annotation - line annotation
   * @returns whether line content is added to annotation
   *
   * @private
   */
  private addLineContent(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    annotation: PdfLineAnnoObject,
  ) {
    // Type-specific properties
    if (
      !this.setLinePoints(
        doc,
        page,
        annotationPtr,
        annotation.linePoints.start,
        annotation.linePoints.end,
      )
    ) {
      return false;
    }
    if (
      !this.setLineEndings(
        annotationPtr,
        annotation.lineEndings?.start ?? PdfAnnotationLineEnding.None,
        annotation.lineEndings?.end ?? PdfAnnotationLineEnding.None,
      )
    ) {
      return false;
    }
    if (!this.setBorderStyle(annotationPtr, annotation.strokeStyle, annotation.strokeWidth)) {
      return false;
    }
    if (!this.setBorderDashPattern(annotationPtr, annotation.strokeDashArray ?? [])) {
      return false;
    }
    if (annotation.intent && !this.setAnnotIntent(annotationPtr, annotation.intent)) {
      return false;
    }
    if (!annotation.color || annotation.color === 'transparent') {
      if (
        !this.pdfiumModule.EPDFAnnot_ClearColor(annotationPtr, PdfAnnotationColorType.InteriorColor)
      ) {
        return false;
      }
    } else if (
      !this.setAnnotationColor(
        annotationPtr,
        annotation.color ?? '#FFFF00',
        PdfAnnotationColorType.InteriorColor,
      )
    ) {
      return false;
    }
    if (!this.setAnnotationOpacity(annotationPtr, annotation.opacity ?? 1)) {
      return false;
    }
    if (
      !this.setAnnotationColor(
        annotationPtr,
        annotation.strokeColor ?? '#FFFF00',
        PdfAnnotationColorType.Color,
      )
    ) {
      return false;
    }

    // Apply base annotation properties (author, contents, dates, flags, custom, IRT, RT)
    return this.applyBaseAnnotationProperties(doc, page, pagePtr, annotationPtr, annotation);
  }

  /**
   * Add polygon or polyline content to annotation
   * @param page - page info
   * @param pagePtr - pointer to page object
   * @param annotationPtr - pointer to polygon or polyline annotation
   * @param annotation - polygon or polyline annotation
   * @returns whether polygon or polyline content is added to annotation
   *
   * @private
   */
  private addPolyContent(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    annotation: PdfPolygonAnnoObject | PdfPolylineAnnoObject,
  ) {
    // Type-specific properties
    if (
      annotation.type === PdfAnnotationSubtype.POLYLINE &&
      !this.setLineEndings(
        annotationPtr,
        annotation.lineEndings?.start ?? PdfAnnotationLineEnding.None,
        annotation.lineEndings?.end ?? PdfAnnotationLineEnding.None,
      )
    ) {
      return false;
    }
    if (!this.setPdfAnnoVertices(doc, page, annotationPtr, annotation.vertices)) {
      return false;
    }
    if (!this.setBorderStyle(annotationPtr, annotation.strokeStyle, annotation.strokeWidth)) {
      return false;
    }
    if (!this.setBorderDashPattern(annotationPtr, annotation.strokeDashArray ?? [])) {
      return false;
    }
    if (annotation.intent && !this.setAnnotIntent(annotationPtr, annotation.intent)) {
      return false;
    }
    if (!annotation.color || annotation.color === 'transparent') {
      if (
        !this.pdfiumModule.EPDFAnnot_ClearColor(annotationPtr, PdfAnnotationColorType.InteriorColor)
      ) {
        return false;
      }
    } else if (
      !this.setAnnotationColor(
        annotationPtr,
        annotation.color ?? '#FFFF00',
        PdfAnnotationColorType.InteriorColor,
      )
    ) {
      return false;
    }
    if (!this.setAnnotationOpacity(annotationPtr, annotation.opacity ?? 1)) {
      return false;
    }
    if (
      !this.setAnnotationColor(
        annotationPtr,
        annotation.strokeColor ?? '#FFFF00',
        PdfAnnotationColorType.Color,
      )
    ) {
      return false;
    }

    // Apply base annotation properties (author, contents, dates, flags, custom, IRT, RT)
    return this.applyBaseAnnotationProperties(doc, page, pagePtr, annotationPtr, annotation);
  }

  /**
   * Add link content (action or destination) to a link annotation
   * @param docPtr - pointer to pdf document
   * @param pagePtr - pointer to the page
   * @param annotationPtr - pointer to pdf annotation
   * @param annotation - the link annotation object
   * @returns true if successful
   *
   * @private
   */
  private addLinkContent(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    docPtr: number,
    pagePtr: number,
    annotationPtr: number,
    annotation: PdfLinkAnnoObject,
  ): boolean {
    // Type-specific properties
    // Border style and width (default: underline with width 2)
    const style = annotation.strokeStyle ?? PdfAnnotationBorderStyle.UNDERLINE;
    const width = annotation.strokeWidth ?? 2;
    if (!this.setBorderStyle(annotationPtr, style, width)) {
      return false;
    }
    if (
      annotation.strokeDashArray &&
      !this.setBorderDashPattern(annotationPtr, annotation.strokeDashArray)
    ) {
      return false;
    }

    // Stroke color
    if (annotation.strokeColor) {
      if (
        !this.setAnnotationColor(
          annotationPtr,
          annotation.strokeColor,
          PdfAnnotationColorType.Color,
        )
      ) {
        return false;
      }
    }

    // Target (action or destination)
    if (annotation.target) {
      if (!this.applyLinkTarget(docPtr, annotationPtr, annotation.target)) {
        return false;
      }
    }

    // Apply base annotation properties (author, contents, dates, flags, custom, IRT, RT)
    return this.applyBaseAnnotationProperties(doc, page, pagePtr, annotationPtr, annotation);
  }

  /**
   * Add shape content to annotation
   * @param page - page info
   * @param pagePtr - pointer to page object
   * @param annotationPtr - pointer to shape annotation
   * @param annotation - shape annotation
   * @returns whether shape content is added to annotation
   *
   * @private
   */
  addShapeContent(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    annotation: PdfCircleAnnoObject | PdfSquareAnnoObject,
  ) {
    // Type-specific properties
    if (!this.setBorderStyle(annotationPtr, annotation.strokeStyle, annotation.strokeWidth)) {
      return false;
    }
    if (!this.setBorderDashPattern(annotationPtr, annotation.strokeDashArray ?? [])) {
      return false;
    }
    if (!annotation.color || annotation.color === 'transparent') {
      if (
        !this.pdfiumModule.EPDFAnnot_ClearColor(annotationPtr, PdfAnnotationColorType.InteriorColor)
      ) {
        return false;
      }
    } else if (
      !this.setAnnotationColor(
        annotationPtr,
        annotation.color ?? '#FFFF00',
        PdfAnnotationColorType.InteriorColor,
      )
    ) {
      return false;
    }
    if (!this.setAnnotationOpacity(annotationPtr, annotation.opacity ?? 1)) {
      return false;
    }
    if (
      !this.setAnnotationColor(
        annotationPtr,
        annotation.strokeColor ?? '#FFFF00',
        PdfAnnotationColorType.Color,
      )
    ) {
      return false;
    }

    // Apply base annotation properties (author, contents, dates, flags, custom, IRT, RT)
    return this.applyBaseAnnotationProperties(doc, page, pagePtr, annotationPtr, annotation);
  }

  /**
   * Add highlight content to annotation
   * @param page - page info
   * @param annotationPtr - pointer to highlight annotation
   * @param annotation - highlight annotation
   * @returns whether highlight content is added to annotation
   *
   * @private
   */
  addTextMarkupContent(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    annotation:
      | PdfHighlightAnnoObject
      | PdfUnderlineAnnoObject
      | PdfStrikeOutAnnoObject
      | PdfSquigglyAnnoObject,
  ) {
    // Type-specific properties
    if (!this.syncQuadPointsAnno(doc, page, annotationPtr, annotation.segmentRects)) {
      return false;
    }
    if (!this.setAnnotationOpacity(annotationPtr, annotation.opacity ?? 1)) {
      return false;
    }
    // Prefer strokeColor, fall back to deprecated color
    const strokeColor = annotation.strokeColor ?? annotation.color ?? '#FFFF00';
    if (!this.setAnnotationColor(annotationPtr, strokeColor, PdfAnnotationColorType.Color)) {
      return false;
    }

    // Apply base annotation properties (author, contents, dates, flags, custom, IRT, RT)
    return this.applyBaseAnnotationProperties(doc, page, pagePtr, annotationPtr, annotation);
  }

  /**
   * Add content to redact annotation
   * @param page - page info
   * @param pagePtr - pointer to page object
   * @param annotationPtr - pointer to redact annotation
   * @param annotation - redact annotation
   * @returns whether redact content is added to annotation
   *
   * @private
   */
  private addRedactContent(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    annotation: PdfRedactAnnoObject,
  ) {
    // Sync QuadPoints for redaction areas
    if (!this.syncQuadPointsAnno(doc, page, annotationPtr, annotation.segmentRects)) {
      return false;
    }

    // Set opacity
    if (!this.setAnnotationOpacity(annotationPtr, annotation.opacity ?? 1)) {
      return false;
    }

    // Set interior/preview color (IC)
    if (!annotation.color || annotation.color === 'transparent') {
      if (
        !this.pdfiumModule.EPDFAnnot_ClearColor(annotationPtr, PdfAnnotationColorType.InteriorColor)
      ) {
        return false;
      }
    } else if (
      !this.setAnnotationColor(
        annotationPtr,
        annotation.color,
        PdfAnnotationColorType.InteriorColor,
      )
    ) {
      return false;
    }

    // Set overlay color (OC) - the fill after redaction is applied
    if (!annotation.overlayColor || annotation.overlayColor === 'transparent') {
      if (
        !this.pdfiumModule.EPDFAnnot_ClearColor(annotationPtr, PdfAnnotationColorType.OverlayColor)
      ) {
        return false;
      }
    } else if (
      !this.setAnnotationColor(
        annotationPtr,
        annotation.overlayColor,
        PdfAnnotationColorType.OverlayColor,
      )
    ) {
      return false;
    }

    // Set stroke/border color (C)
    if (!annotation.strokeColor || annotation.strokeColor === 'transparent') {
      if (!this.pdfiumModule.EPDFAnnot_ClearColor(annotationPtr, PdfAnnotationColorType.Color)) {
        return false;
      }
    } else if (
      !this.setAnnotationColor(annotationPtr, annotation.strokeColor, PdfAnnotationColorType.Color)
    ) {
      return false;
    }

    // Set overlay text
    if (!this.setOverlayText(annotationPtr, annotation.overlayText)) {
      return false;
    }

    // Set overlay text repeat
    if (
      annotation.overlayTextRepeat !== undefined &&
      !this.setOverlayTextRepeat(annotationPtr, annotation.overlayTextRepeat)
    ) {
      return false;
    }

    // Set font properties via default appearance (DA) if provided
    if (annotation.fontFamily !== undefined || annotation.fontSize !== undefined) {
      if (
        !this.setAnnotationDefaultAppearance(
          annotationPtr,
          annotation.fontFamily ?? PdfStandardFont.Helvetica,
          annotation.fontSize ?? 12,
          annotation.fontColor ?? '#000000',
        )
      ) {
        return false;
      }
    }

    // Set text alignment
    if (
      annotation.textAlign !== undefined &&
      !this.setAnnotationTextAlignment(annotationPtr, annotation.textAlign)
    ) {
      return false;
    }

    // Apply base annotation properties (author, contents, dates, flags, custom, IRT, RT)
    return this.applyBaseAnnotationProperties(doc, page, pagePtr, annotationPtr, annotation);
  }

  /**
   * Add contents to stamp annotation
   * @param doc - pdf document object
   * @param docPtr - pointer to pdf document object
   * @param page - page info
   * @param pagePtr - pointer to page object
   * @param annotationPtr - pointer to stamp annotation
   * @param rect - rect of stamp annotation
   * @param contents - contents of stamp annotation
   * @returns whether contents is added to annotation
   *
   * @private
   */
  addStampContent(
    doc: PdfDocumentObject,
    docPtr: number,
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    annotation: PdfStampAnnoObject,
    imageData?: ImageData,
  ) {
    // Type-specific properties
    if (annotation.icon && !this.setAnnotationIcon(annotationPtr, annotation.icon)) {
      return false;
    }
    if (annotation.subject && !this.setAnnotString(annotationPtr, 'Subj', annotation.subject)) {
      return false;
    }
    if (imageData) {
      for (let i = this.pdfiumModule.FPDFAnnot_GetObjectCount(annotationPtr) - 1; i >= 0; i--) {
        this.pdfiumModule.FPDFAnnot_RemoveObject(annotationPtr, i);
      }

      if (
        !this.addImageObject(doc, docPtr, page, pagePtr, annotationPtr, annotation.rect, imageData)
      ) {
        return false;
      }
    }

    // Apply base annotation properties first so that EPDFRotate / EPDFUnrotatedRect
    // are available when UpdateAppearanceToRect reads them for rotation-aware AP generation.
    if (!this.applyBaseAnnotationProperties(doc, page, pagePtr, annotationPtr, annotation)) {
      return false;
    }

    return !!this.pdfiumModule.EPDFAnnot_UpdateAppearanceToRect(annotationPtr, PdfStampFit.Cover);
  }

  /**
   * Add image object to annotation
   * @param doc - pdf document object
   * @param docPtr - pointer to pdf document object
   * @param page - page info
   * @param pagePtr - pointer to page object
   * @param annotationPtr - pointer to stamp annotation
   * @param position - position of image
   * @param imageData - data of image
   * @returns whether image is added to annotation
   *
   * @private
   */
  addImageObject(
    doc: PdfDocumentObject,
    docPtr: number,
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    rect: Rect,
    imageData: ImageData,
  ) {
    const bytesPerPixel = 4;
    const pixelCount = imageData.width * imageData.height;

    const bitmapBufferPtr = this.memoryManager.malloc(bytesPerPixel * pixelCount);
    if (!bitmapBufferPtr) {
      return false;
    }

    for (let i = 0; i < pixelCount; i++) {
      const red = imageData.data[i * bytesPerPixel];
      const green = imageData.data[i * bytesPerPixel + 1];
      const blue = imageData.data[i * bytesPerPixel + 2];
      const alpha = imageData.data[i * bytesPerPixel + 3];

      this.pdfiumModule.pdfium.setValue(bitmapBufferPtr + i * bytesPerPixel, blue, 'i8');
      this.pdfiumModule.pdfium.setValue(bitmapBufferPtr + i * bytesPerPixel + 1, green, 'i8');
      this.pdfiumModule.pdfium.setValue(bitmapBufferPtr + i * bytesPerPixel + 2, red, 'i8');
      this.pdfiumModule.pdfium.setValue(bitmapBufferPtr + i * bytesPerPixel + 3, alpha, 'i8');
    }

    const format = BitmapFormat.Bitmap_BGRA;
    const bitmapPtr = this.pdfiumModule.FPDFBitmap_CreateEx(
      imageData.width,
      imageData.height,
      format,
      bitmapBufferPtr,
      0,
    );
    if (!bitmapPtr) {
      this.memoryManager.free(bitmapBufferPtr);
      return false;
    }

    const imageObjectPtr = this.pdfiumModule.FPDFPageObj_NewImageObj(docPtr);
    if (!imageObjectPtr) {
      this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr);
      this.memoryManager.free(bitmapBufferPtr);
      return false;
    }

    if (!this.pdfiumModule.FPDFImageObj_SetBitmap(pagePtr, 0, imageObjectPtr, bitmapPtr)) {
      this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr);
      this.pdfiumModule.FPDFPageObj_Destroy(imageObjectPtr);
      this.memoryManager.free(bitmapBufferPtr);
      return false;
    }

    const matrixPtr = this.memoryManager.malloc(6 * 4);
    this.pdfiumModule.pdfium.setValue(matrixPtr, imageData.width, 'float');
    this.pdfiumModule.pdfium.setValue(matrixPtr + 4, 0, 'float');
    this.pdfiumModule.pdfium.setValue(matrixPtr + 8, 0, 'float');
    this.pdfiumModule.pdfium.setValue(matrixPtr + 12, imageData.height, 'float');
    this.pdfiumModule.pdfium.setValue(matrixPtr + 16, 0, 'float');
    this.pdfiumModule.pdfium.setValue(matrixPtr + 20, 0, 'float');
    if (!this.pdfiumModule.FPDFPageObj_SetMatrix(imageObjectPtr, matrixPtr)) {
      this.memoryManager.free(matrixPtr);
      this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr);
      this.pdfiumModule.FPDFPageObj_Destroy(imageObjectPtr);
      this.memoryManager.free(bitmapBufferPtr);
      return false;
    }
    this.memoryManager.free(matrixPtr);

    const pagePos = this.convertDevicePointToPagePoint(doc, page, {
      x: rect.origin.x,
      y: rect.origin.y + imageData.height, // shift down by the image height
    });
    this.pdfiumModule.FPDFPageObj_Transform(imageObjectPtr, 1, 0, 0, 1, pagePos.x, pagePos.y);

    if (!this.pdfiumModule.FPDFAnnot_AppendObject(annotationPtr, imageObjectPtr)) {
      this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr);
      this.pdfiumModule.FPDFPageObj_Destroy(imageObjectPtr);
      this.memoryManager.free(bitmapBufferPtr);
      return false;
    }

    this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr);
    this.memoryManager.free(bitmapBufferPtr);

    return true;
  }

  /**
   * Save document to array buffer
   * @param docPtr - pointer to pdf document
   * @returns array buffer contains the pdf content
   *
   * @private
   */
  saveDocument(docPtr: number) {
    const writerPtr = this.pdfiumModule.PDFiumExt_OpenFileWriter();
    this.pdfiumModule.PDFiumExt_SaveAsCopy(docPtr, writerPtr);
    const size = this.pdfiumModule.PDFiumExt_GetFileWriterSize(writerPtr);
    const dataPtr = this.memoryManager.malloc(size);
    this.pdfiumModule.PDFiumExt_GetFileWriterData(writerPtr, dataPtr, size);
    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    for (let i = 0; i < size; i++) {
      view.setInt8(i, this.pdfiumModule.pdfium.getValue(dataPtr + i, 'i8'));
    }
    this.memoryManager.free(dataPtr);
    this.pdfiumModule.PDFiumExt_CloseFileWriter(writerPtr);

    return buffer;
  }

  /**
   * Read Catalog /Lang via EPDFCatalog_GetLanguage (UTF-16LE → JS string).
   * Returns:
   *   null  -> /Lang not present (getter returned 0) OR doc not open,
   *   ''    -> /Lang exists but is explicitly empty,
   *   'en', 'en-US', ... -> normal tag.
   *
   * Note: EPDFCatalog_GetLanguage lengths are BYTES (incl. trailing NUL).
   *
   * @private
   */
  private readCatalogLanguage(docPtr: number): string | null {
    // Probe required length in BYTES (includes UTF-16LE trailing NUL).
    const byteLen = this.pdfiumModule.EPDFCatalog_GetLanguage(docPtr, 0, 0) >>> 0;

    // 0 => /Lang missing (or invalid doc/root) → expose as null
    if (byteLen === 0) return null;

    // 2 => empty UTF-16LE string (just the NUL) → explicitly empty
    if (byteLen === 2) return '';

    // Read exact buffer to avoid extra allocs.
    return readString(
      this.pdfiumModule.pdfium,
      (buffer, bufferLength) =>
        this.pdfiumModule.EPDFCatalog_GetLanguage(docPtr, buffer, bufferLength),
      this.pdfiumModule.pdfium.UTF16ToString,
      byteLen,
    );
  }

  /**
   * Read metadata from pdf document
   * @param docPtr - pointer to pdf document
   * @param key - key of metadata field
   * @returns metadata value
   *
   * @private
   */
  private readMetaText(docPtr: number, key: string): string | null {
    const exists = !!this.pdfiumModule.EPDF_HasMetaText(docPtr, key);
    if (!exists) return null;

    const len = this.pdfiumModule.FPDF_GetMetaText(docPtr, key, 0, 0);
    if (len === 2) return '';

    // Read with an exact buffer to avoid extra allocations.
    return readString(
      this.pdfiumModule.pdfium,
      (buffer, bufferLength) =>
        this.pdfiumModule.FPDF_GetMetaText(docPtr, key, buffer, bufferLength),
      this.pdfiumModule.pdfium.UTF16ToString,
      len,
    );
  }

  /**
   * Write metadata into the PDF's Info dictionary.
   * If `value` is null or empty string, the key is removed.
   * @param docPtr - pointer to pdf document
   * @param key - key of metadata field
   * @param value - value of metadata field
   * @returns whether metadata is written to the pdf document
   *
   * @private
   */
  private setMetaText(docPtr: number, key: string, value: string | null | undefined): boolean {
    // Remove key if value is null/undefined/empty
    if (value == null || value.length === 0) {
      // Pass nullptr for value → removal in our C++ implementation
      const ok = this.pdfiumModule.EPDF_SetMetaText(docPtr, key, 0);
      return !!ok;
    }

    // UTF-16LE buffer (+2 bytes for NUL)
    const bytes = 2 * (value.length + 1);
    const ptr = this.memoryManager.malloc(bytes);
    try {
      this.pdfiumModule.pdfium.stringToUTF16(value, ptr, bytes);
      const ok = this.pdfiumModule.EPDF_SetMetaText(docPtr, key, ptr);
      return !!ok;
    } finally {
      this.memoryManager.free(ptr);
    }
  }

  /**
   * Read the document's trapped status via PDFium.
   * Falls back to `Unknown` on unexpected values.
   *
   * @private
   */
  private getMetaTrapped(docPtr: number): PdfTrappedStatus {
    const raw = Number(this.pdfiumModule.EPDF_GetMetaTrapped(docPtr));
    switch (raw) {
      case PdfTrappedStatus.NotSet:
      case PdfTrappedStatus.True:
      case PdfTrappedStatus.False:
      case PdfTrappedStatus.Unknown:
        return raw;
      default:
        return PdfTrappedStatus.Unknown;
    }
  }

  /**
   * Write (or clear) the document's trapped status via PDFium.
   * Pass `null`/`undefined` to remove the `/Trapped` key.
   *
   * @private
   */
  private setMetaTrapped(docPtr: number, status: PdfTrappedStatus | null | undefined): boolean {
    // Treat null/undefined as “remove key” — the C++ side handles NotSet by
    // deleting /Trapped from the Info dictionary.
    const toSet = status == null || status === undefined ? PdfTrappedStatus.NotSet : status;

    // Guard against unexpected values.
    const valid =
      toSet === PdfTrappedStatus.NotSet ||
      toSet === PdfTrappedStatus.True ||
      toSet === PdfTrappedStatus.False ||
      toSet === PdfTrappedStatus.Unknown;

    if (!valid) return false;

    return !!this.pdfiumModule.EPDF_SetMetaTrapped(docPtr, toSet);
  }

  /**
   * Get the number of keys in the document's Info dictionary.
   * @param docPtr - pointer to pdf document
   * @param customOnly - if true, only count non-reserved (custom) keys; if false, count all keys.
   * @returns the number of keys (possibly 0). On error, returns 0.
   *
   * @private
   */
  private getMetaKeyCount(docPtr: number, customOnly: boolean): number {
    return Number(this.pdfiumModule.EPDF_GetMetaKeyCount(docPtr, customOnly)) | 0;
  }

  /**
   * Get the name of the Info dictionary key at |index|.
   * @param docPtr - pointer to pdf document
   * @param index - 0-based key index in the order returned by PDFium.
   * @param customOnly - if true, indexes only over non-reserved (custom) keys; if false, indexes over all keys.
   * @returns the name of the key, or null if the key is not found.
   *
   * @private
   */
  private getMetaKeyName(docPtr: number, index: number, customOnly: boolean): string | null {
    const len = this.pdfiumModule.EPDF_GetMetaKeyName(docPtr, index, customOnly, 0, 0);
    if (!len) return null;
    return readString(
      this.pdfiumModule.pdfium,
      (buffer, buflen) =>
        this.pdfiumModule.EPDF_GetMetaKeyName(docPtr, index, customOnly, buffer, buflen),
      this.pdfiumModule.pdfium.UTF8ToString,
      len,
    );
  }

  /**
   * Read all metadata from the document's Info dictionary.
   * @param docPtr - pointer to pdf document
   * @param customOnly - if true, only read non-reserved (custom) keys; if false, read all keys.
   * @returns all metadata
   *
   * @private
   */
  private readAllMeta(docPtr: number, customOnly: boolean = true): Record<string, string | null> {
    const n = this.getMetaKeyCount(docPtr, customOnly);
    const out: Record<string, string | null> = {};
    for (let i = 0; i < n; i++) {
      const key = this.getMetaKeyName(docPtr, i, customOnly);
      if (!key) continue;
      out[key] = this.readMetaText(docPtr, key); // returns null if not present
    }
    return out;
  }

  /**
   * Read bookmarks in the pdf document
   * @param docPtr - pointer to pdf document
   * @param rootBookmarkPtr - pointer to root bookmark
   * @returns bookmarks in the pdf document
   *
   * @private
   */
  readPdfBookmarks(docPtr: number, rootBookmarkPtr = 0) {
    let bookmarkPtr = this.pdfiumModule.FPDFBookmark_GetFirstChild(docPtr, rootBookmarkPtr);

    const bookmarks: PdfBookmarkObject[] = [];
    while (bookmarkPtr) {
      const bookmark = this.readPdfBookmark(docPtr, bookmarkPtr);
      bookmarks.push(bookmark);

      const nextBookmarkPtr = this.pdfiumModule.FPDFBookmark_GetNextSibling(docPtr, bookmarkPtr);

      bookmarkPtr = nextBookmarkPtr;
    }

    return bookmarks;
  }

  /**
   * Read bookmark in the pdf document
   * @param docPtr - pointer to pdf document
   * @param bookmarkPtr - pointer to bookmark object
   * @returns pdf bookmark object
   *
   * @private
   */
  private readPdfBookmark(docPtr: number, bookmarkPtr: number): PdfBookmarkObject {
    const title = readString(
      this.pdfiumModule.pdfium,
      (buffer, bufferLength) => {
        return this.pdfiumModule.FPDFBookmark_GetTitle(bookmarkPtr, buffer, bufferLength);
      },
      this.pdfiumModule.pdfium.UTF16ToString,
    );

    const bookmarks = this.readPdfBookmarks(docPtr, bookmarkPtr);

    const target = this.readPdfBookmarkTarget(
      docPtr,
      () => {
        return this.pdfiumModule.FPDFBookmark_GetAction(bookmarkPtr);
      },
      () => {
        return this.pdfiumModule.FPDFBookmark_GetDest(docPtr, bookmarkPtr);
      },
    );

    return {
      title,
      target,
      children: bookmarks,
    };
  }

  /**
   * Read text rects in pdf page
   * @param page - pdf page info
   * @param docPtr - pointer to pdf document
   * @param pagePtr - pointer to pdf page
   * @param textPagePtr - pointer to pdf text page
   * @returns text rects in the pdf page
   *
   * @public
   */
  private readPageTextRects(
    page: PdfPageObject,
    docPtr: number,
    pagePtr: number,
    textPagePtr: number,
  ) {
    const rectsCount = this.pdfiumModule.FPDFText_CountRects(textPagePtr, 0, -1);

    const textRects: PdfTextRectObject[] = [];
    for (let i = 0; i < rectsCount; i++) {
      const topPtr = this.memoryManager.malloc(8);
      const leftPtr = this.memoryManager.malloc(8);
      const rightPtr = this.memoryManager.malloc(8);
      const bottomPtr = this.memoryManager.malloc(8);
      const isSucceed = this.pdfiumModule.FPDFText_GetRect(
        textPagePtr,
        i,
        leftPtr,
        topPtr,
        rightPtr,
        bottomPtr,
      );
      if (!isSucceed) {
        this.memoryManager.free(leftPtr);
        this.memoryManager.free(topPtr);
        this.memoryManager.free(rightPtr);
        this.memoryManager.free(bottomPtr);
        continue;
      }

      const left = this.pdfiumModule.pdfium.getValue(leftPtr, 'double');
      const top = this.pdfiumModule.pdfium.getValue(topPtr, 'double');
      const right = this.pdfiumModule.pdfium.getValue(rightPtr, 'double');
      const bottom = this.pdfiumModule.pdfium.getValue(bottomPtr, 'double');

      this.memoryManager.free(leftPtr);
      this.memoryManager.free(topPtr);
      this.memoryManager.free(rightPtr);
      this.memoryManager.free(bottomPtr);

      const deviceXPtr = this.memoryManager.malloc(4);
      const deviceYPtr = this.memoryManager.malloc(4);
      this.pdfiumModule.FPDF_PageToDevice(
        pagePtr,
        0,
        0,
        page.size.width,
        page.size.height,
        0,
        left,
        top,
        deviceXPtr,
        deviceYPtr,
      );
      const x = this.pdfiumModule.pdfium.getValue(deviceXPtr, 'i32');
      const y = this.pdfiumModule.pdfium.getValue(deviceYPtr, 'i32');
      this.memoryManager.free(deviceXPtr);
      this.memoryManager.free(deviceYPtr);

      const rect = {
        origin: {
          x,
          y,
        },
        size: {
          width: Math.ceil(Math.abs(right - left)),
          height: Math.ceil(Math.abs(top - bottom)),
        },
      };

      const utf16Length = this.pdfiumModule.FPDFText_GetBoundedText(
        textPagePtr,
        left,
        top,
        right,
        bottom,
        0,
        0,
      );
      const bytesCount = (utf16Length + 1) * 2; // include NIL
      const textBuffer = this.memoryManager.malloc(bytesCount);
      this.pdfiumModule.FPDFText_GetBoundedText(
        textPagePtr,
        left,
        top,
        right,
        bottom,
        textBuffer,
        utf16Length,
      );
      const content = this.pdfiumModule.pdfium.UTF16ToString(textBuffer);
      this.memoryManager.free(textBuffer);

      const charIndex = this.pdfiumModule.FPDFText_GetCharIndexAtPos(textPagePtr, left, top, 2, 2);
      let fontFamily = '';
      let fontSize = rect.size.height;
      if (charIndex >= 0) {
        fontSize = this.pdfiumModule.FPDFText_GetFontSize(textPagePtr, charIndex);

        const fontNameLength = this.pdfiumModule.FPDFText_GetFontInfo(
          textPagePtr,
          charIndex,
          0,
          0,
          0,
        );

        const bytesCount = fontNameLength + 1; // include NIL
        const textBufferPtr = this.memoryManager.malloc(bytesCount);
        const flagsPtr = this.memoryManager.malloc(4);
        this.pdfiumModule.FPDFText_GetFontInfo(
          textPagePtr,
          charIndex,
          textBufferPtr,
          bytesCount,
          flagsPtr,
        );
        fontFamily = this.pdfiumModule.pdfium.UTF8ToString(textBufferPtr);
        this.memoryManager.free(textBufferPtr);
        this.memoryManager.free(flagsPtr);
      }

      const textRect: PdfTextRectObject = {
        content,
        rect,
        font: {
          family: fontFamily,
          size: fontSize,
        },
      };

      textRects.push(textRect);
    }

    return textRects;
  }

  /**
   * Return geometric + logical text layout for one page
   * (glyph-only implementation, no FPDFText_GetRect).
   *
   * @public
   */
  getPageGeometry(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<PdfPageGeometry> {
    const label = 'getPageGeometry';
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, label, 'Begin', doc.id);

    /* ── guards ───────────────────────────────────────────── */
    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, label, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    /* ── native handles ──────────────────────────────────── */
    const pageCtx = ctx.acquirePage(page.index);
    const textPagePtr = pageCtx.getTextPage();

    /* ── 1. read ALL glyphs in logical order ─────────────── */
    const glyphCount = this.pdfiumModule.FPDFText_CountChars(textPagePtr);
    const glyphs: PdfGlyphObject[] = [];

    for (let i = 0; i < glyphCount; i++) {
      const g = this.readGlyphInfo(page, pageCtx.pagePtr, textPagePtr, i);
      glyphs.push(g);
    }

    /* ── 2. build visual runs from glyph stream ───────────── */
    const runs: PdfRun[] = this.buildRunsFromGlyphs(glyphs, textPagePtr);

    /* ── 3. cleanup & resolve task ───────────────────────── */
    pageCtx.release();

    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, label, 'End', doc.id);
    return PdfTaskHelper.resolve({ runs });
  }

  /**
   * Group consecutive glyphs that belong to the same CPDF_TextObject
   * using FPDFText_GetTextObject(), and calculate rotation from glyph positions.
   */
  private buildRunsFromGlyphs(glyphs: PdfGlyphObject[], textPagePtr: number): PdfRun[] {
    const runs: PdfRun[] = [];
    let current: PdfRun | null = null;
    let curObjPtr: number | null = null;
    let bounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;

    /** ── main loop ──────────────────────────────────────────── */
    for (let i = 0; i < glyphs.length; i++) {
      const g = glyphs[i];

      /* 1 — find the CPDF_TextObject this glyph belongs to */
      const objPtr = this.pdfiumModule.FPDFText_GetTextObject(textPagePtr, i) as number;

      /* 2 — start a new run when the text object changes */
      if (objPtr !== curObjPtr) {
        curObjPtr = objPtr;
        current = {
          rect: {
            x: g.origin.x,
            y: g.origin.y,
            width: g.size.width,
            height: g.size.height,
          },
          charStart: i,
          glyphs: [],
          fontSize: this.pdfiumModule.FPDFText_GetFontSize(textPagePtr, i),
        };
        bounds = {
          minX: g.origin.x,
          minY: g.origin.y,
          maxX: g.origin.x + g.size.width,
          maxY: g.origin.y + g.size.height,
        };
        runs.push(current);
      }

      /* 3 — append the slim glyph record */
      current!.glyphs.push({
        x: g.origin.x,
        y: g.origin.y,
        width: g.size.width,
        height: g.size.height,
        flags: g.isEmpty ? 2 : g.isSpace ? 1 : 0,
      });

      /* 4 — expand the run's bounding rect */
      if (g.isEmpty) {
        continue;
      }

      const right = g.origin.x + g.size.width;
      const bottom = g.origin.y + g.size.height;

      // Update bounds
      bounds!.minX = Math.min(bounds!.minX, g.origin.x);
      bounds!.minY = Math.min(bounds!.minY, g.origin.y);
      bounds!.maxX = Math.max(bounds!.maxX, right);
      bounds!.maxY = Math.max(bounds!.maxY, bottom);

      // Calculate final rect from bounds
      current!.rect.x = bounds!.minX;
      current!.rect.y = bounds!.minY;
      current!.rect.width = bounds!.maxX - bounds!.minX;
      current!.rect.height = bounds!.maxY - bounds!.minY;
    }

    return runs;
  }

  /**
   * Rich text runs: groups consecutive characters sharing the same
   * text object, font, size, and fill color into structured segments
   * with full font metadata and bounding boxes in PDF page coordinates.
   *
   * @public
   */
  getPageTextRuns(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<PdfPageTextRuns> {
    const label = 'getPageTextRuns';
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, label, 'Begin', doc.id);

    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, label, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const pageCtx = ctx.acquirePage(page.index);
    const textPagePtr = pageCtx.getTextPage();
    const charCount = this.pdfiumModule.FPDFText_CountChars(textPagePtr);

    const runs: PdfTextRun[] = [];
    let runStart = 0;
    let curObjPtr: number | null = null;
    let curFont: PdfFontInfo | null = null;
    let curFontSize = 0;
    let curColor: PdfAlphaColor | null = null;
    let bounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;

    const flushRun = (end: number) => {
      if (curObjPtr === null || curFont === null || curColor === null || bounds === null) return;
      const count = end - runStart;
      if (count <= 0) return;

      const bufPtr = this.memoryManager.malloc(2 * (count + 1));
      this.pdfiumModule.FPDFText_GetText(textPagePtr, runStart, count, bufPtr);
      const text = stripPdfUnwantedMarkers(this.pdfiumModule.pdfium.UTF16ToString(bufPtr));
      this.memoryManager.free(bufPtr);

      runs.push({
        text,
        rect: {
          origin: { x: bounds.minX, y: bounds.minY },
          size: {
            width: Math.max(1, bounds.maxX - bounds.minX),
            height: Math.max(1, bounds.maxY - bounds.minY),
          },
        },
        font: curFont,
        fontSize: curFontSize,
        color: curColor,
        charIndex: runStart,
        charCount: count,
      });
    };

    const rPtr = this.memoryManager.malloc(4);
    const gPtr = this.memoryManager.malloc(4);
    const bPtr = this.memoryManager.malloc(4);
    const aPtr = this.memoryManager.malloc(4);
    const rectPtr = this.memoryManager.malloc(16);
    const dx1Ptr = this.memoryManager.malloc(4);
    const dy1Ptr = this.memoryManager.malloc(4);
    const dx2Ptr = this.memoryManager.malloc(4);
    const dy2Ptr = this.memoryManager.malloc(4);
    const italicAnglePtr = this.memoryManager.malloc(4);

    for (let i = 0; i < charCount; i++) {
      const uc = this.pdfiumModule.FPDFText_GetUnicode(textPagePtr, i);
      if (uc === 0xfffe || uc === 0xfffd) continue;

      const objPtr = this.pdfiumModule.FPDFText_GetTextObject(textPagePtr, i) as number;
      if (objPtr === 0) continue;

      const fontSize = this.pdfiumModule.FPDFText_GetFontSize(textPagePtr, i);

      this.pdfiumModule.FPDFText_GetFillColor(textPagePtr, i, rPtr, gPtr, bPtr, aPtr);
      const red = this.pdfiumModule.pdfium.getValue(rPtr, 'i32') & 0xff;
      const green = this.pdfiumModule.pdfium.getValue(gPtr, 'i32') & 0xff;
      const blue = this.pdfiumModule.pdfium.getValue(bPtr, 'i32') & 0xff;
      const alpha = this.pdfiumModule.pdfium.getValue(aPtr, 'i32') & 0xff;

      const fontInfo = this.readFontInfoFromTextObject(objPtr, italicAnglePtr);

      const needNewRun =
        curObjPtr === null ||
        objPtr !== curObjPtr ||
        fontInfo.name !== curFont!.name ||
        Math.abs(fontSize - curFontSize) > 0.01 ||
        red !== curColor!.red ||
        green !== curColor!.green ||
        blue !== curColor!.blue;

      if (needNewRun) {
        flushRun(i);
        curObjPtr = objPtr;
        curFont = fontInfo;
        curFontSize = fontSize;
        curColor = { red, green, blue, alpha };
        runStart = i;
        bounds = null;
      }

      // Expand bounds with this character's bbox
      if (this.pdfiumModule.FPDFText_GetLooseCharBox(textPagePtr, i, rectPtr)) {
        const left = this.pdfiumModule.pdfium.getValue(rectPtr, 'float');
        const top = this.pdfiumModule.pdfium.getValue(rectPtr + 4, 'float');
        const right = this.pdfiumModule.pdfium.getValue(rectPtr + 8, 'float');
        const bottom = this.pdfiumModule.pdfium.getValue(rectPtr + 12, 'float');

        if (left !== right && top !== bottom) {
          this.pdfiumModule.FPDF_PageToDevice(
            pageCtx.pagePtr,
            0,
            0,
            page.size.width,
            page.size.height,
            0,
            left,
            top,
            dx1Ptr,
            dy1Ptr,
          );
          this.pdfiumModule.FPDF_PageToDevice(
            pageCtx.pagePtr,
            0,
            0,
            page.size.width,
            page.size.height,
            0,
            right,
            bottom,
            dx2Ptr,
            dy2Ptr,
          );

          const x1 = this.pdfiumModule.pdfium.getValue(dx1Ptr, 'i32');
          const y1 = this.pdfiumModule.pdfium.getValue(dy1Ptr, 'i32');
          const x2 = this.pdfiumModule.pdfium.getValue(dx2Ptr, 'i32');
          const y2 = this.pdfiumModule.pdfium.getValue(dy2Ptr, 'i32');
          const cx = Math.min(x1, x2);
          const cy = Math.min(y1, y2);
          const cw = Math.abs(x2 - x1);
          const ch = Math.abs(y2 - y1);

          if (bounds === null) {
            bounds = { minX: cx, minY: cy, maxX: cx + cw, maxY: cy + ch };
          } else {
            bounds.minX = Math.min(bounds.minX, cx);
            bounds.minY = Math.min(bounds.minY, cy);
            bounds.maxX = Math.max(bounds.maxX, cx + cw);
            bounds.maxY = Math.max(bounds.maxY, cy + ch);
          }
        }
      }
    }

    flushRun(charCount);

    [rPtr, gPtr, bPtr, aPtr, rectPtr, dx1Ptr, dy1Ptr, dx2Ptr, dy2Ptr, italicAnglePtr].forEach((p) =>
      this.memoryManager.free(p),
    );

    pageCtx.release();
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, label, 'End', doc.id);
    return PdfTaskHelper.resolve({ runs });
  }

  /**
   * Read font metadata from a text object handle via FPDFFont_* APIs.
   */
  private readFontInfoFromTextObject(textObjPtr: number, italicAnglePtr: number): PdfFontInfo {
    const fontPtr = this.pdfiumModule.FPDFTextObj_GetFont(textObjPtr);

    let name = '';
    let familyName = '';
    let weight = 400;
    let italic = false;
    let monospaced = false;
    let embedded = false;

    if (fontPtr) {
      // PostScript name via FPDFFont_GetBaseFontName
      const nameLen = this.pdfiumModule.FPDFFont_GetBaseFontName(fontPtr, 0, 0);
      if (nameLen > 0) {
        const nameBuf = this.memoryManager.malloc(nameLen + 1);
        this.pdfiumModule.FPDFFont_GetBaseFontName(fontPtr, nameBuf, nameLen + 1);
        name = this.pdfiumModule.pdfium.UTF8ToString(nameBuf);
        this.memoryManager.free(nameBuf);
      }

      // Family name via FPDFFont_GetFamilyName
      const famLen = this.pdfiumModule.FPDFFont_GetFamilyName(fontPtr, 0, 0);
      if (famLen > 0) {
        const famBuf = this.memoryManager.malloc(famLen + 1);
        this.pdfiumModule.FPDFFont_GetFamilyName(fontPtr, famBuf, famLen + 1);
        familyName = this.pdfiumModule.pdfium.UTF8ToString(famBuf);
        this.memoryManager.free(famBuf);
      }

      weight = this.pdfiumModule.FPDFFont_GetWeight(fontPtr);
      embedded = this.pdfiumModule.FPDFFont_GetIsEmbedded(fontPtr) !== 0;

      if (this.pdfiumModule.FPDFFont_GetItalicAngle(fontPtr, italicAnglePtr)) {
        const angle = this.pdfiumModule.pdfium.getValue(italicAnglePtr, 'i32');
        italic = angle !== 0;
      }

      // Bit 0 of font flags = FixedPitch (monospaced)
      const flags = this.pdfiumModule.FPDFFont_GetFlags(fontPtr);
      monospaced = (flags & 1) !== 0;
    }

    return { name, familyName, weight, italic, monospaced, embedded };
  }

  /**
   * Extract glyph geometry + metadata for `charIndex`
   *
   * Returns device–space coordinates:
   *   x,y  → **top-left** corner (integer-pixels)
   *   w,h  → width / height (integer-pixels, ≥ 1)
   *
   * And two flags:
   *   isSpace → true if the glyph's Unicode code-point is U+0020
   */
  private readGlyphInfo(
    page: PdfPageObject,
    pagePtr: number,
    textPagePtr: number,
    charIndex: number,
  ): PdfGlyphObject {
    // ── native stack temp pointers ──────────────────────────────
    const dx1Ptr = this.memoryManager.malloc(4);
    const dy1Ptr = this.memoryManager.malloc(4);
    const dx2Ptr = this.memoryManager.malloc(4);
    const dy2Ptr = this.memoryManager.malloc(4);
    const rectPtr = this.memoryManager.malloc(16); // 4 floats = 16 bytes

    const allPtrs = [rectPtr, dx1Ptr, dy1Ptr, dx2Ptr, dy2Ptr];

    let x = 0,
      y = 0,
      width = 0,
      height = 0,
      isSpace = false;

    // ── 1) loose glyph bbox (FPDFText_GetLooseCharBox) ──────────
    if (this.pdfiumModule.FPDFText_GetLooseCharBox(textPagePtr, charIndex, rectPtr)) {
      const left = this.pdfiumModule.pdfium.getValue(rectPtr, 'float');
      const top = this.pdfiumModule.pdfium.getValue(rectPtr + 4, 'float');
      const right = this.pdfiumModule.pdfium.getValue(rectPtr + 8, 'float');
      const bottom = this.pdfiumModule.pdfium.getValue(rectPtr + 12, 'float');

      if (left === right || top === bottom) {
        allPtrs.forEach((p) => this.memoryManager.free(p));

        return {
          origin: { x: 0, y: 0 },
          size: { width: 0, height: 0 },
          isEmpty: true,
        };
      }

      // ── 2) map loose corners to device-space ──────────────────
      this.pdfiumModule.FPDF_PageToDevice(
        pagePtr,
        0,
        0,
        page.size.width,
        page.size.height,
        0,
        left,
        top,
        dx1Ptr,
        dy1Ptr,
      );
      this.pdfiumModule.FPDF_PageToDevice(
        pagePtr,
        0,
        0,
        page.size.width,
        page.size.height,
        0,
        right,
        bottom,
        dx2Ptr,
        dy2Ptr,
      );

      const x1 = this.pdfiumModule.pdfium.getValue(dx1Ptr, 'i32');
      const y1 = this.pdfiumModule.pdfium.getValue(dy1Ptr, 'i32');
      const x2 = this.pdfiumModule.pdfium.getValue(dx2Ptr, 'i32');
      const y2 = this.pdfiumModule.pdfium.getValue(dy2Ptr, 'i32');

      x = Math.min(x1, x2);
      y = Math.min(y1, y2);
      width = Math.max(1, Math.abs(x2 - x1));
      height = Math.max(1, Math.abs(y2 - y1));

      // ── 3) extra flags ────────────────────────────────────────
      const uc = this.pdfiumModule.FPDFText_GetUnicode(textPagePtr, charIndex);
      isSpace = uc === 32;
    }

    // ── free tmps ───────────────────────────────────────────────
    allPtrs.forEach((p) => this.memoryManager.free(p));

    return {
      origin: { x, y },
      size: { width, height },
      ...(isSpace && { isSpace }),
    };
  }

  /**
   * Geometry-only text extraction
   * ------------------------------------------
   * Returns every glyph on the requested page
   * in the logical order delivered by PDFium.
   *
   * The promise resolves to an array of objects:
   *   {
   *     idx:     number;            // glyph index on the page (0…n-1)
   *     origin:  { x: number; y: number };
   *     size:    { width: number;  height: number };
   *     angle:   number;            // degrees, counter-clock-wise
   *     isSpace: boolean;           // true  → U+0020
   *   }
   *
   * No Unicode is included; front-end decides whether to hydrate it.
   */
  public getPageGlyphs(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<PdfGlyphObject[]> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getPageGlyphs', doc, page);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'getPageGlyphs', 'Begin', doc.id);

    // ── 1) safety: document handle must be alive ───────────────
    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'getPageGlyphs', 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    // ── 2) load page + text page handles ───────────────────────
    const pageCtx = ctx.acquirePage(page.index);
    const textPagePtr = pageCtx.getTextPage();

    // ── 3) iterate all glyphs in logical order ─────────────────
    const total = this.pdfiumModule.FPDFText_CountChars(textPagePtr);
    const glyphs = new Array(total);

    for (let i = 0; i < total; i++) {
      const g = this.readGlyphInfo(page, pageCtx.pagePtr, textPagePtr, i);

      if (g.isEmpty) {
        continue;
      }

      glyphs[i] = { ...g };
    }

    // ── 4) clean-up native handles ─────────────────────────────
    pageCtx.release();

    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'getPageGlyphs', 'End', doc.id);

    return PdfTaskHelper.resolve(glyphs);
  }

  private readCharBox(
    page: PdfPageObject,
    pagePtr: number,
    textPagePtr: number,
    charIndex: number,
  ): Rect {
    const topPtr = this.memoryManager.malloc(8);
    const leftPtr = this.memoryManager.malloc(8);
    const bottomPtr = this.memoryManager.malloc(8);
    const rightPtr = this.memoryManager.malloc(8);
    let x = 0;
    let y = 0;
    let width = 0;
    let height = 0;
    if (
      this.pdfiumModule.FPDFText_GetCharBox(
        textPagePtr,
        charIndex,
        leftPtr,
        rightPtr,
        bottomPtr,
        topPtr,
      )
    ) {
      const top = this.pdfiumModule.pdfium.getValue(topPtr, 'double');
      const left = this.pdfiumModule.pdfium.getValue(leftPtr, 'double');
      const bottom = this.pdfiumModule.pdfium.getValue(bottomPtr, 'double');
      const right = this.pdfiumModule.pdfium.getValue(rightPtr, 'double');

      const deviceXPtr = this.memoryManager.malloc(4);
      const deviceYPtr = this.memoryManager.malloc(4);
      this.pdfiumModule.FPDF_PageToDevice(
        pagePtr,
        0,
        0,
        page.size.width,
        page.size.height,
        0,
        left,
        top,
        deviceXPtr,
        deviceYPtr,
      );
      x = this.pdfiumModule.pdfium.getValue(deviceXPtr, 'i32');
      y = this.pdfiumModule.pdfium.getValue(deviceYPtr, 'i32');
      this.memoryManager.free(deviceXPtr);
      this.memoryManager.free(deviceYPtr);

      width = Math.ceil(Math.abs(right - left));
      height = Math.ceil(Math.abs(top - bottom));
    }
    this.memoryManager.free(topPtr);
    this.memoryManager.free(leftPtr);
    this.memoryManager.free(bottomPtr);
    this.memoryManager.free(rightPtr);

    return {
      origin: {
        x,
        y,
      },
      size: {
        width,
        height,
      },
    };
  }

  /**
   * Read page annotations
   *
   * @param doc - pdf document object
   * @param ctx - document context
   * @param page - page info
   * @returns annotations on the pdf page
   *
   * @private
   */
  private readPageAnnotations(doc: PdfDocumentObject, ctx: DocumentContext, page: PdfPageObject) {
    return ctx.borrowPage(page.index, (pageCtx) => {
      const annotationCount = this.pdfiumModule.FPDFPage_GetAnnotCount(pageCtx.pagePtr);

      const annotations: PdfAnnotationObject[] = [];
      for (let i = 0; i < annotationCount; i++) {
        pageCtx.withAnnotation(i, (annotPtr) => {
          const anno = this.readPageAnnotation(doc, ctx.docPtr, page, annotPtr, pageCtx);
          if (anno) annotations.push(anno);
        });
      }
      return annotations;
    });
  }

  /**
   * Read page annotations without loading the page (raw approach)
   *
   * @param doc - pdf document object
   * @param ctx - document context
   * @param page - page info
   * @returns annotations on the pdf page
   *
   * @private
   */
  private readPageAnnotationsRaw(
    doc: PdfDocumentObject,
    ctx: DocumentContext,
    page: PdfPageObject,
  ): PdfAnnotationObject[] {
    const count = this.pdfiumModule.EPDFPage_GetAnnotCountRaw(ctx.docPtr, page.index);
    if (count <= 0) return [];

    const out: PdfAnnotationObject[] = [];

    for (let i = 0; i < count; ++i) {
      const annotPtr = this.pdfiumModule.EPDFPage_GetAnnotRaw(ctx.docPtr, page.index, i);
      if (!annotPtr) continue;

      try {
        const anno = this.readPageAnnotation(doc, ctx.docPtr, page, annotPtr);
        if (anno) out.push(anno);
      } finally {
        this.pdfiumModule.FPDFPage_CloseAnnot(annotPtr);
      }
    }
    return out;
  }

  /**
   * Get page annotations (public API, returns Task)
   *
   * @param doc - pdf document
   * @param page - page info
   * @returns task with annotations on the pdf page
   *
   * @public
   */
  getPageAnnotationsRaw(
    doc: PdfDocumentObject,
    page: PdfPageObject,
  ): PdfTask<PdfAnnotationObject[]> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getPageAnnotationsRaw', doc, page);
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `GetPageAnnotationsRaw`,
      'Begin',
      `${doc.id}-${page.index}`,
    );

    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const out = this.readPageAnnotationsRaw(doc, ctx, page);

    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `GetPageAnnotationsRaw`,
      'End',
      `${doc.id}-${page.index}`,
    );
    this.logger.debug(
      LOG_SOURCE,
      LOG_CATEGORY,
      'getPageAnnotationsRaw',
      `${doc.id}-${page.index}`,
      out,
    );
    return PdfTaskHelper.resolve(out);
  }

  /**
   * Read pdf annotation from pdf document
   *
   * @param doc - pdf document object
   * @param docPtr - pointer to pdf document
   * @param page - page info
   * @param annotationPtr - pointer to pdf annotation
   * @param pageCtx - page context
   * @returns pdf annotation
   *
   * @private
   */
  private readPageAnnotation(
    doc: PdfDocumentObject,
    docPtr: number,
    page: PdfPageObject,
    annotationPtr: number,
    pageCtx?: PageContext,
  ) {
    let index = this.getAnnotString(annotationPtr, 'NM');
    if (!index || !isUuidV4(index)) {
      index = uuidV4();
      this.setAnnotString(annotationPtr, 'NM', index);
    }
    const subType = this.pdfiumModule.FPDFAnnot_GetSubtype(
      annotationPtr,
    ) as PdfAnnotationObject['type'];
    let annotation: PdfAnnotationObject | undefined;
    switch (subType) {
      case PdfAnnotationSubtype.TEXT:
        {
          annotation = this.readPdfTextAnno(doc, page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.FREETEXT:
        {
          annotation = this.readPdfFreeTextAnno(doc, page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.LINK:
        {
          annotation = this.readPdfLinkAnno(doc, page, docPtr, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.WIDGET:
        if (pageCtx) {
          return this.readPdfWidgetAnno(doc, page, annotationPtr, pageCtx.getFormHandle(), index);
        }
      case PdfAnnotationSubtype.FILEATTACHMENT:
        {
          annotation = this.readPdfFileAttachmentAnno(doc, page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.INK:
        {
          annotation = this.readPdfInkAnno(doc, page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.POLYGON:
        {
          annotation = this.readPdfPolygonAnno(doc, page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.POLYLINE:
        {
          annotation = this.readPdfPolylineAnno(doc, page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.LINE:
        {
          annotation = this.readPdfLineAnno(doc, page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.HIGHLIGHT:
        annotation = this.readPdfHighlightAnno(doc, page, annotationPtr, index);
        break;
      case PdfAnnotationSubtype.STAMP:
        {
          annotation = this.readPdfStampAnno(doc, page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.SQUARE:
        {
          annotation = this.readPdfSquareAnno(doc, page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.CIRCLE:
        {
          annotation = this.readPdfCircleAnno(doc, page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.UNDERLINE:
        {
          annotation = this.readPdfUnderlineAnno(doc, page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.SQUIGGLY:
        {
          annotation = this.readPdfSquigglyAnno(doc, page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.STRIKEOUT:
        {
          annotation = this.readPdfStrikeOutAnno(doc, page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.CARET:
        {
          annotation = this.readPdfCaretAnno(doc, page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.REDACT:
        {
          annotation = this.readPdfRedactAnno(doc, page, annotationPtr, index);
        }
        break;
      default:
        {
          annotation = this.readPdfAnno(doc, page, subType, annotationPtr, index);
        }
        break;
    }

    // Post-process: reverse-rotate vertices for vertex types that have rotation metadata
    if (annotation) {
      annotation = this.reverseRotateAnnotationOnLoad(annotation);
    }

    return annotation;
  }

  /**
   * On load, if a vertex-type annotation has rotation metadata in EPDFCustom,
   * reverse-rotate the PDF's physically rotated vertices by -rotation to recover
   * the unrotated vertices for runtime editing.
   */
  private reverseRotateAnnotationOnLoad(annotation: PdfAnnotationObject): PdfAnnotationObject {
    const rotation = annotation.rotation;
    const unrotatedRect = annotation.unrotatedRect;

    // Only process vertex types that have rotation metadata
    if (!rotation || rotation === 0 || !unrotatedRect) {
      return annotation;
    }

    const center: Position = {
      x: unrotatedRect.origin.x + unrotatedRect.size.width / 2,
      y: unrotatedRect.origin.y + unrotatedRect.size.height / 2,
    };

    // Reverse-rotate by -rotation to recover unrotated vertices
    switch (annotation.type) {
      case PdfAnnotationSubtype.INK: {
        const ink = annotation as PdfInkAnnoObject;
        const unrotatedInkList = ink.inkList.map((stroke) => ({
          points: stroke.points.map((p) => this.rotatePointForSave(p, center, -rotation)),
        }));
        return { ...ink, inkList: unrotatedInkList };
      }

      case PdfAnnotationSubtype.LINE: {
        const line = annotation as PdfLineAnnoObject;
        return {
          ...line,
          linePoints: {
            start: this.rotatePointForSave(line.linePoints.start, center, -rotation),
            end: this.rotatePointForSave(line.linePoints.end, center, -rotation),
          },
        };
      }

      case PdfAnnotationSubtype.POLYGON: {
        const poly = annotation as PdfPolygonAnnoObject;
        return {
          ...poly,
          vertices: poly.vertices.map((v) => this.rotatePointForSave(v, center, -rotation)),
        };
      }

      case PdfAnnotationSubtype.POLYLINE: {
        const polyline = annotation as PdfPolylineAnnoObject;
        return {
          ...polyline,
          vertices: polyline.vertices.map((v) => this.rotatePointForSave(v, center, -rotation)),
        };
      }

      default:
        return annotation;
    }
  }

  /**
   * Return the colour stored directly in the annotation dictionary's `/C` entry.
   *
   * Most PDFs created by Acrobat, Microsoft Office, LaTeX, etc. include this entry.
   * When the key is absent (common in macOS Preview, Chrome, Drawboard) the call
   * fails and the function returns `undefined`.
   *
   * @param annotationPtr - pointer to an `FPDF_ANNOTATION`
   * @returns An RGBA tuple (0-255 channels) or `undefined` if no `/C` entry exists
   *
   * @private
   */
  private readAnnotationColor(
    annotationPtr: number,
    colorType: PdfAnnotationColorType = PdfAnnotationColorType.Color,
  ): PdfColor | undefined {
    const rPtr = this.memoryManager.malloc(4);
    const gPtr = this.memoryManager.malloc(4);
    const bPtr = this.memoryManager.malloc(4);

    // colourType 0 = "colour" (stroke/fill); other types are interior/border
    const ok = this.pdfiumModule.EPDFAnnot_GetColor(annotationPtr, colorType, rPtr, gPtr, bPtr);

    let colour: PdfColor | undefined;

    if (ok) {
      colour = {
        red: this.pdfiumModule.pdfium.getValue(rPtr, 'i32') & 0xff,
        green: this.pdfiumModule.pdfium.getValue(gPtr, 'i32') & 0xff,
        blue: this.pdfiumModule.pdfium.getValue(bPtr, 'i32') & 0xff,
      };
    }

    this.memoryManager.free(rPtr);
    this.memoryManager.free(gPtr);
    this.memoryManager.free(bPtr);

    return colour;
  }

  /**
   * Get the fill/stroke colour annotation.
   *
   * @param annotationPtr - pointer to the annotation whose colour is being set
   * @param colorType - which colour to get (0 = fill, 1 = stroke)
   * @returns WebColor with hex color
   *
   * @private
   */
  private getAnnotationColor(
    annotationPtr: number,
    colorType: PdfAnnotationColorType = PdfAnnotationColorType.Color,
  ): WebColor | undefined {
    const annotationColor = this.readAnnotationColor(annotationPtr, colorType);

    return annotationColor ? pdfColorToWebColor(annotationColor) : undefined;
  }

  /**
   * Set the fill/stroke colour for a **Highlight / Underline / StrikeOut / Squiggly** markup annotation.
   *
   * @param annotationPtr - pointer to the annotation whose colour is being set
   * @param webAlphaColor - WebAlphaColor with hex color and opacity (0-1)
   * @param shouldClearAP - whether to clear the /AP entry
   * @param which - which colour to set (0 = fill, 1 = stroke)
   * @returns `true` if the operation was successful
   *
   * @private
   */
  private setAnnotationColor(
    annotationPtr: number,
    webColor: WebColor,
    colorType: PdfAnnotationColorType = PdfAnnotationColorType.Color,
  ): boolean {
    const pdfColor = webColorToPdfColor(webColor);

    return this.pdfiumModule.EPDFAnnot_SetColor(
      annotationPtr,
      colorType,
      pdfColor.red & 0xff,
      pdfColor.green & 0xff,
      pdfColor.blue & 0xff,
    );
  }

  /**
   * Get the opacity of the annotation.
   *
   * @param annotationPtr - pointer to the annotation whose opacity is being set
   * @returns opacity (0-1)
   *
   * @private
   */
  private getAnnotationOpacity(annotationPtr: number): number {
    const opacityPtr = this.memoryManager.malloc(4);
    const ok = this.pdfiumModule.EPDFAnnot_GetOpacity(annotationPtr, opacityPtr);
    const opacity = ok ? this.pdfiumModule.pdfium.getValue(opacityPtr, 'i32') : 255;
    this.memoryManager.free(opacityPtr);
    return pdfAlphaToWebOpacity(opacity);
  }

  /**
   * Set the opacity of the annotation.
   *
   * @param annotationPtr - pointer to the annotation whose opacity is being set
   * @param opacity - opacity (0-1)
   * @returns true on success
   *
   * @private
   */
  private setAnnotationOpacity(annotationPtr: number, opacity: number): boolean {
    const pdfOpacity = webOpacityToPdfAlpha(opacity);
    return this.pdfiumModule.EPDFAnnot_SetOpacity(annotationPtr, pdfOpacity & 0xff);
  }

  /**
   * Get the rotation angle (in degrees) from the annotation's /Rotate entry.
   * Returns 0 if no rotation is set or on error.
   *
   * @param annotationPtr - pointer to the annotation
   * @returns rotation in degrees (0 if not set)
   */
  private getAnnotationRotation(annotationPtr: number): number {
    const rotationPtr = this.memoryManager.malloc(4);
    const ok = this.pdfiumModule.EPDFAnnot_GetRotate(annotationPtr, rotationPtr);
    if (!ok) {
      this.memoryManager.free(rotationPtr);
      return 0;
    }
    const rotation = this.pdfiumModule.pdfium.getValue(rotationPtr, 'float');
    this.memoryManager.free(rotationPtr);
    return rotation;
  }

  /**
   * Set the rotation angle (in degrees) on the annotation's /Rotate entry.
   * A value of 0 removes the /Rotate key.
   *
   * @param annotationPtr - pointer to the annotation
   * @param rotation - rotation in degrees (clockwise)
   * @returns true on success
   */
  private setAnnotationRotation(annotationPtr: number, rotation: number): boolean {
    return !!this.pdfiumModule.EPDFAnnot_SetRotate(annotationPtr, rotation);
  }

  /**
   * Get the EmbedPDF extended rotation (in degrees) from the annotation's
   * /EPDFRotate entry. Returns 0 if not set or on error.
   *
   * @param annotationPtr - pointer to the annotation
   * @returns rotation in degrees (0 if not set)
   */
  private getAnnotExtendedRotation(annotationPtr: number): number {
    const rotationPtr = this.memoryManager.malloc(4);
    const ok = this.pdfiumModule.EPDFAnnot_GetExtendedRotation(annotationPtr, rotationPtr);
    if (!ok) {
      this.memoryManager.free(rotationPtr);
      return 0;
    }
    const rotation = this.pdfiumModule.pdfium.getValue(rotationPtr, 'float');
    this.memoryManager.free(rotationPtr);
    return rotation;
  }

  /**
   * Set the EmbedPDF extended rotation (in degrees) on the annotation's
   * /EPDFRotate entry. A value of 0 removes the key.
   *
   * @param annotationPtr - pointer to the annotation
   * @param rotation - rotation in degrees
   * @returns true on success
   */
  private setAnnotExtendedRotation(annotationPtr: number, rotation: number): boolean {
    return !!this.pdfiumModule.EPDFAnnot_SetExtendedRotation(annotationPtr, rotation);
  }

  /**
   * Read the EmbedPDF unrotated rect from the annotation's /EPDFUnrotatedRect
   * entry. Returns the raw page-space rect (same format as `readPageAnnoRect`)
   * or null if not set.
   *
   * @param annotationPtr - pointer to the annotation
   * @returns raw `{ left, top, right, bottom }` in page coords, or null
   */
  private readAnnotUnrotatedRect(
    annotationPtr: number,
  ): { left: number; top: number; right: number; bottom: number } | null {
    const rectPtr = this.memoryManager.malloc(4 * 4);
    const ok = this.pdfiumModule.EPDFAnnot_GetUnrotatedRect(annotationPtr, rectPtr);
    if (!ok) {
      this.memoryManager.free(rectPtr);
      return null;
    }
    // FS_RECTF layout: left, top, right, bottom (same as FPDFAnnot_GetRect)
    const left = this.pdfiumModule.pdfium.getValue(rectPtr, 'float');
    const top = this.pdfiumModule.pdfium.getValue(rectPtr + 4, 'float');
    const right = this.pdfiumModule.pdfium.getValue(rectPtr + 8, 'float');
    const bottom = this.pdfiumModule.pdfium.getValue(rectPtr + 12, 'float');
    this.memoryManager.free(rectPtr);

    // All zeros means the entry was not set
    if (left === 0 && top === 0 && right === 0 && bottom === 0) {
      return null;
    }

    return { left, top, right, bottom };
  }

  /**
   * Write the EmbedPDF unrotated rect (/EPDFUnrotatedRect) for an annotation.
   * Accepts a device-space `Rect` and converts to page coordinates internally,
   * following the same pattern as `setPageAnnoRect`.
   *
   * @param doc  - pdf document object
   * @param page - pdf page object
   * @param annotPtr - pointer to the annotation
   * @param rect - device-space rect to store as the unrotated rect
   * @returns true on success
   */
  private setAnnotUnrotatedRect(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotPtr: number,
    rect: Rect,
  ): boolean {
    // Snap device edges the same way setPageAnnoRect does
    const x0d = Math.floor(rect.origin.x);
    const y0d = Math.floor(rect.origin.y);
    const x1d = Math.floor(rect.origin.x + rect.size.width);
    const y1d = Math.floor(rect.origin.y + rect.size.height);

    // Map all 4 integer corners to page space (handles any /Rotate)
    const TL = this.convertDevicePointToPagePoint(doc, page, { x: x0d, y: y0d });
    const TR = this.convertDevicePointToPagePoint(doc, page, { x: x1d, y: y0d });
    const BR = this.convertDevicePointToPagePoint(doc, page, { x: x1d, y: y1d });
    const BL = this.convertDevicePointToPagePoint(doc, page, { x: x0d, y: y1d });

    // Page-space AABB
    let left = Math.min(TL.x, TR.x, BR.x, BL.x);
    let right = Math.max(TL.x, TR.x, BR.x, BL.x);
    let bottom = Math.min(TL.y, TR.y, BR.y, BL.y);
    let top = Math.max(TL.y, TR.y, BR.y, BL.y);
    if (left > right) [left, right] = [right, left];
    if (bottom > top) [bottom, top] = [top, bottom];

    // Write FS_RECTF in memory order: L, T, R, B
    const ptr = this.memoryManager.malloc(16);
    const pdf = this.pdfiumModule.pdfium;
    pdf.setValue(ptr + 0, left, 'float'); // L
    pdf.setValue(ptr + 4, top, 'float'); // T
    pdf.setValue(ptr + 8, right, 'float'); // R
    pdf.setValue(ptr + 12, bottom, 'float'); // B

    const ok = this.pdfiumModule.EPDFAnnot_SetUnrotatedRect(annotPtr, ptr);
    this.memoryManager.free(ptr);
    return !!ok;
  }

  /**
   * Fetch the `/Q` text-alignment value from a **FreeText** annotation.
   *
   * @param annotationPtr pointer returned by `FPDFPage_GetAnnot`
   * @returns `PdfTextAlignment`
   */
  private getAnnotationTextAlignment(annotationPtr: number): PdfTextAlignment {
    return this.pdfiumModule.EPDFAnnot_GetTextAlignment(annotationPtr);
  }

  /**
   * Write the `/Q` text-alignment value into a **FreeText** annotation
   * and clear the existing appearance stream so it can be regenerated.
   *
   * @param annotationPtr pointer returned by `FPDFPage_GetAnnot`
   * @param alignment     `PdfTextAlignment`
   * @returns `true` on success
   */
  private setAnnotationTextAlignment(annotationPtr: number, alignment: PdfTextAlignment): boolean {
    return !!this.pdfiumModule.EPDFAnnot_SetTextAlignment(annotationPtr, alignment);
  }

  /**
   * Fetch the `/EPDF:VerticalAlignment` vertical-alignment value from a **FreeText** annotation.
   *
   * @param annotationPtr pointer returned by `FPDFPage_GetAnnot`
   * @returns `PdfVerticalAlignment`
   */
  private getAnnotationVerticalAlignment(annotationPtr: number): PdfVerticalAlignment {
    return this.pdfiumModule.EPDFAnnot_GetVerticalAlignment(annotationPtr);
  }

  /**
   * Write the `/EPDF:VerticalAlignment` vertical-alignment value into a **FreeText** annotation
   * and clear the existing appearance stream so it can be regenerated.
   *
   * @param annotationPtr pointer returned by `FPDFPage_GetAnnot`
   * @param alignment     `PdfVerticalAlignment`
   * @returns `true` on success
   */
  private setAnnotationVerticalAlignment(
    annotationPtr: number,
    alignment: PdfVerticalAlignment,
  ): boolean {
    return !!this.pdfiumModule.EPDFAnnot_SetVerticalAlignment(annotationPtr, alignment);
  }

  /**
   * Get the overlay text from a Redact annotation.
   *
   * @param annotationPtr pointer returned by `FPDFPage_GetAnnot`
   * @returns overlay text string or `undefined` if not set
   *
   * @private
   */
  private getOverlayText(annotationPtr: number): string | undefined {
    const len = this.pdfiumModule.EPDFAnnot_GetOverlayText(annotationPtr, 0, 0);
    if (len === 0) return undefined;

    const bytes = (len + 1) * 2;
    const ptr = this.memoryManager.malloc(bytes);

    this.pdfiumModule.EPDFAnnot_GetOverlayText(annotationPtr, ptr, bytes);
    const value = this.pdfiumModule.pdfium.UTF16ToString(ptr);
    this.memoryManager.free(ptr);

    return value || undefined;
  }

  /**
   * Set the overlay text on a Redact annotation.
   *
   * @param annotationPtr pointer returned by `FPDFPage_GetAnnot`
   * @param text overlay text to set, or undefined/empty to clear
   * @returns `true` on success
   *
   * @private
   */
  private setOverlayText(annotationPtr: number, text: string | undefined): boolean {
    if (!text) {
      return this.pdfiumModule.EPDFAnnot_SetOverlayText(annotationPtr, 0);
    }
    return this.withWString(text, (wPtr) => {
      return this.pdfiumModule.EPDFAnnot_SetOverlayText(annotationPtr, wPtr);
    });
  }

  /**
   * Get whether overlay text repeats in a Redact annotation.
   *
   * @param annotationPtr pointer returned by `FPDFPage_GetAnnot`
   * @returns `true` if overlay text repeats
   *
   * @private
   */
  private getOverlayTextRepeat(annotationPtr: number): boolean {
    return this.pdfiumModule.EPDFAnnot_GetOverlayTextRepeat(annotationPtr);
  }

  /**
   * Set whether overlay text repeats in a Redact annotation.
   *
   * @param annotationPtr pointer returned by `FPDFPage_GetAnnot`
   * @param repeat whether overlay text should repeat
   * @returns `true` on success
   *
   * @private
   */
  private setOverlayTextRepeat(annotationPtr: number, repeat: boolean): boolean {
    return this.pdfiumModule.EPDFAnnot_SetOverlayTextRepeat(annotationPtr, repeat);
  }

  /**
   * Return the **default appearance** (font, size, colour) declared in the
   * `/DA` string of a **FreeText** annotation.
   *
   * @param annotationPtr  pointer to `FPDF_ANNOTATION`
   * @returns `{ font, fontSize, color }` or `undefined` when PDFium returns false
   *
   * NOTE – `font` is the raw `FPDF_STANDARD_FONT` enum value that PDFium uses
   *        (same range as the C API: 0 = Courier, 12 = ZapfDingbats, …).
   */
  private getAnnotationDefaultAppearance(
    annotationPtr: number,
  ): { fontFamily: PdfStandardFont; fontSize: number; fontColor: WebColor } | undefined {
    const fontPtr = this.memoryManager.malloc(4);
    const sizePtr = this.memoryManager.malloc(4);
    const rPtr = this.memoryManager.malloc(4);
    const gPtr = this.memoryManager.malloc(4);
    const bPtr = this.memoryManager.malloc(4);

    const ok = !!this.pdfiumModule.EPDFAnnot_GetDefaultAppearance(
      annotationPtr,
      fontPtr,
      sizePtr,
      rPtr,
      gPtr,
      bPtr,
    );

    if (!ok) {
      [fontPtr, sizePtr, rPtr, gPtr, bPtr].forEach((p) => this.memoryManager.free(p));
      return; // undefined – caller decides what to do
    }

    const pdf = this.pdfiumModule.pdfium;
    const font = pdf.getValue(fontPtr, 'i32');
    const fontSize = pdf.getValue(sizePtr, 'float');
    const red = pdf.getValue(rPtr, 'i32') & 0xff;
    const green = pdf.getValue(gPtr, 'i32') & 0xff;
    const blue = pdf.getValue(bPtr, 'i32') & 0xff;

    [fontPtr, sizePtr, rPtr, gPtr, bPtr].forEach((p) => this.memoryManager.free(p));

    return {
      fontFamily: font,
      fontSize,
      fontColor: pdfColorToWebColor({ red, green, blue }),
    };
  }

  /**
   * Write a **default appearance** (`/DA`) into a FreeText annotation.
   *
   * @param annotationPtr pointer to `FPDF_ANNOTATION`
   * @param font          `FPDF_STANDARD_FONT` enum value
   * @param fontSize      size in points (≥ 0)
   * @param color         CSS-style `#rrggbb` string (alpha ignored)
   * @returns `true` on success
   */
  private setAnnotationDefaultAppearance(
    annotationPtr: number,
    font: PdfStandardFont,
    fontSize: number,
    color: WebColor,
  ): boolean {
    // Fallback unknown / non-standard fonts to Helvetica so the write never fails.
    const resolvedFont = font === PdfStandardFont.Unknown ? PdfStandardFont.Helvetica : font;
    const { red, green, blue } = webColorToPdfColor(color); // 0-255 ints

    return !!this.pdfiumModule.EPDFAnnot_SetDefaultAppearance(
      annotationPtr,
      resolvedFont,
      fontSize,
      red & 0xff,
      green & 0xff,
      blue & 0xff,
    );
  }

  /**
   * Border‐style + width helper
   *
   * Tries the new PDFium helper `EPDFAnnot_GetBorderStyle()` (patch series
   * 9 July 2025).
   *
   * @param  annotationPtr  pointer to an `FPDF_ANNOTATION`
   * @returns `{ ok, style, width }`
   *          • `ok`     – `true` when the call succeeded
   *          • `style`  – `PdfAnnotationBorderStyle` enum
   *          • `width`  – stroke-width in points (defaults to 0 pt)
   */
  private getBorderStyle(annotationPtr: number): {
    ok: boolean;
    style: PdfAnnotationBorderStyle;
    width: number;
  } {
    /* 1 ── allocate tmp storage for the returned width ─────────────── */
    const widthPtr = this.memoryManager.malloc(4);
    let width = 0;
    let style: PdfAnnotationBorderStyle = PdfAnnotationBorderStyle.UNKNOWN;
    let ok = false;

    style = this.pdfiumModule.EPDFAnnot_GetBorderStyle(annotationPtr, widthPtr);
    width = this.pdfiumModule.pdfium.getValue(widthPtr, 'float');
    ok = style !== PdfAnnotationBorderStyle.UNKNOWN;
    this.memoryManager.free(widthPtr);
    return { ok, style, width };
  }

  private setBorderStyle(
    annotationPtr: number,
    style: PdfAnnotationBorderStyle,
    width: number,
  ): boolean {
    return this.pdfiumModule.EPDFAnnot_SetBorderStyle(annotationPtr, style, width);
  }

  /**
   * Get the icon of the annotation
   *
   * @param annotationPtr - pointer to an `FPDF_ANNOTATION`
   * @returns `PdfAnnotationIcon`
   */
  private getAnnotationIcon(annotationPtr: number): PdfAnnotationIcon {
    return this.pdfiumModule.EPDFAnnot_GetIcon(annotationPtr);
  }

  /**
   * Set the icon of the annotation
   *
   * @param annotationPtr - pointer to an `FPDF_ANNOTATION`
   * @param icon - `PdfAnnotationIcon`
   * @returns `true` on success
   */
  private setAnnotationIcon(annotationPtr: number, icon: PdfAnnotationIcon): boolean {
    return this.pdfiumModule.EPDFAnnot_SetIcon(annotationPtr, icon);
  }

  /**
   * Get the reply type of the annotation (RT property per ISO 32000-2)
   *
   * @param annotationPtr - pointer to an `FPDF_ANNOTATION`
   * @returns `PdfAnnotationReplyType`
   */
  private getReplyType(annotationPtr: number): PdfAnnotationReplyType {
    return this.pdfiumModule.EPDFAnnot_GetReplyType(annotationPtr);
  }

  /**
   * Set the reply type of the annotation (RT property per ISO 32000-2)
   *
   * @param annotationPtr - pointer to an `FPDF_ANNOTATION`
   * @param replyType - `PdfAnnotationReplyType`
   * @returns `true` on success
   */
  private setReplyType(annotationPtr: number, replyType?: PdfAnnotationReplyType): boolean {
    // If undefined or Unknown, clear the RT key (Unknown = 0 removes the key)
    return this.pdfiumModule.EPDFAnnot_SetReplyType(
      annotationPtr,
      replyType ?? PdfAnnotationReplyType.Unknown,
    );
  }

  /**
   * Border-effect (“cloudy”) helper
   *
   * Calls the new PDFium function `EPDFAnnot_GetBorderEffect()` (July 2025).
   *
   * @param  annotationPtr  pointer to an `FPDF_ANNOTATION`
   * @returns `{ ok, intensity }`
   *          • `ok`        – `true` when the annotation *does* have a
   *                          valid cloudy-border effect
   *          • `intensity` – radius/intensity value (0 when `ok` is false)
   */
  private getBorderEffect(annotationPtr: number): { ok: boolean; intensity: number } {
    const intensityPtr = this.memoryManager.malloc(4);

    const ok = !!this.pdfiumModule.EPDFAnnot_GetBorderEffect(annotationPtr, intensityPtr);

    const intensity = ok ? this.pdfiumModule.pdfium.getValue(intensityPtr, 'float') : 0;

    this.memoryManager.free(intensityPtr);
    return { ok, intensity };
  }

  /**
   * Rectangle-differences helper ( /RD array on Square / Circle annots )
   *
   * Calls `EPDFAnnot_GetRectangleDifferences()` introduced in July 2025.
   *
   * @param  annotationPtr  pointer to an `FPDF_ANNOTATION`
   * @returns `{ ok, left, top, right, bottom }`
   *          • `ok`     – `true` when the annotation *has* an /RD entry
   *          • the four floats are 0 when `ok` is false
   */
  private getRectangleDifferences(annotationPtr: number): {
    ok: boolean;
    left: number;
    top: number;
    right: number;
    bottom: number;
  } {
    /* tmp storage ─────────────────────────────────────────── */
    const lPtr = this.memoryManager.malloc(4);
    const tPtr = this.memoryManager.malloc(4);
    const rPtr = this.memoryManager.malloc(4);
    const bPtr = this.memoryManager.malloc(4);

    const ok = !!this.pdfiumModule.EPDFAnnot_GetRectangleDifferences(
      annotationPtr,
      lPtr,
      tPtr,
      rPtr,
      bPtr,
    );

    const pdf = this.pdfiumModule.pdfium;
    const left = pdf.getValue(lPtr, 'float');
    const top = pdf.getValue(tPtr, 'float');
    const right = pdf.getValue(rPtr, 'float');
    const bottom = pdf.getValue(bPtr, 'float');

    /* cleanup ─────────────────────────────────────────────── */
    this.memoryManager.free(lPtr);
    this.memoryManager.free(tPtr);
    this.memoryManager.free(rPtr);
    this.memoryManager.free(bPtr);

    return { ok, left, top, right, bottom };
  }

  /**
   * Get the date of the annotation
   *
   * @param annotationPtr - pointer to an `FPDF_ANNOTATION`
   * @param key - 'M' for modified date, 'CreationDate' for creation date
   * @returns `Date` or `undefined` when PDFium can't read the date
   */
  private getAnnotationDate(annotationPtr: number, key: 'M' | 'CreationDate'): Date | undefined {
    const raw = this.getAnnotString(annotationPtr, key);
    return raw ? pdfDateToDate(raw) : undefined;
  }

  /**
   * Set the date of the annotation
   *
   * @param annotationPtr - pointer to an `FPDF_ANNOTATION`
   * @param key - 'M' for modified date, 'CreationDate' for creation date
   * @param date - `Date` to set
   * @returns `true` on success
   */
  private setAnnotationDate(annotationPtr: number, key: 'M' | 'CreationDate', date: Date): boolean {
    const raw = dateToPdfDate(date);
    return this.setAnnotString(annotationPtr, key, raw);
  }

  /**
   * Get the date of the attachment
   *
   * @param attachmentPtr - pointer to an `FPDF_ATTACHMENT`
   * @param key - 'ModDate' for modified date, 'CreationDate' for creation date
   * @returns `Date` or `undefined` when PDFium can't read the date
   */
  private getAttachmentDate(
    attachmentPtr: number,
    key: 'ModDate' | 'CreationDate',
  ): Date | undefined {
    const raw = this.getAttachmentString(attachmentPtr, key);
    return raw ? pdfDateToDate(raw) : undefined;
  }

  /**
   * Set the date of the attachment
   *
   * @param attachmentPtr - pointer to an `FPDF_ATTACHMENT`
   * @param key - 'ModDate' for modified date, 'CreationDate' for creation date
   * @param date - `Date` to set
   * @returns `true` on success
   */
  private setAttachmentDate(
    attachmentPtr: number,
    key: 'ModDate' | 'CreationDate',
    date: Date,
  ): boolean {
    const raw = dateToPdfDate(date);
    return this.setAttachmentString(attachmentPtr, key, raw);
  }

  /**
   * Dash-pattern helper ( /BS → /D array, dashed borders only )
   *
   * Uses the two new PDFium helpers:
   *   • `EPDFAnnot_GetBorderDashPatternCount`
   *   • `EPDFAnnot_GetBorderDashPattern`
   *
   * @param  annotationPtr  pointer to an `FPDF_ANNOTATION`
   * @returns `{ ok, pattern }`
   *          • `ok`       – `true` when the annot is dashed *and* the array
   *                          was retrieved successfully
   *          • `pattern`  – numeric array of dash/space lengths (empty when `ok` is false)
   */
  private getBorderDashPattern(annotationPtr: number): { ok: boolean; pattern: number[] } {
    const count = this.pdfiumModule.EPDFAnnot_GetBorderDashPatternCount(annotationPtr);
    if (count === 0) {
      return { ok: false, pattern: [] };
    }

    /* allocate `count` floats on the WASM heap */
    const arrPtr = this.memoryManager.malloc(4 * count);
    const okNative = !!this.pdfiumModule.EPDFAnnot_GetBorderDashPattern(
      annotationPtr,
      arrPtr,
      count,
    );

    /* copy out */
    const pattern: number[] = [];
    if (okNative) {
      const pdf = this.pdfiumModule.pdfium;
      for (let i = 0; i < count; i++) {
        pattern.push(pdf.getValue(arrPtr + 4 * i, 'float'));
      }
    }

    this.memoryManager.free(arrPtr);
    return { ok: okNative, pattern };
  }

  /**
   * Write the /BS /D dash pattern array for an annotation border.
   *
   * @param annotationPtr Pointer to FPDF_ANNOTATION
   * @param pattern       Array of dash/space lengths in *points* (e.g. [3, 2])
   *                      Empty array clears the pattern (solid line).
   * @returns true on success
   *
   * @private
   */
  private setBorderDashPattern(annotationPtr: number, pattern: number[]): boolean {
    // Empty → clear the pattern (PDF spec: no /D = solid)
    if (!pattern || pattern.length === 0) {
      return this.pdfiumModule.EPDFAnnot_SetBorderDashPattern(annotationPtr, 0, 0);
    }

    // Validate and sanitize numbers (must be positive floats, spec allows 1–8 numbers typically)
    const clean = pattern.map((n) => (Number.isFinite(n) && n > 0 ? n : 0)).filter((n) => n > 0);
    if (clean.length === 0) {
      // nothing valid → treat as clear
      return this.pdfiumModule.EPDFAnnot_SetBorderDashPattern(annotationPtr, 0, 0);
    }

    const bytes = 4 * clean.length;
    const bufPtr = this.memoryManager.malloc(bytes);
    for (let i = 0; i < clean.length; i++) {
      this.pdfiumModule.pdfium.setValue(bufPtr + 4 * i, clean[i], 'float');
    }

    const ok = !!this.pdfiumModule.EPDFAnnot_SetBorderDashPattern(
      annotationPtr,
      bufPtr,
      clean.length,
    );

    this.memoryManager.free(bufPtr);
    return ok;
  }

  /**
   * Return the `/LE` array (start/end line-ending styles) for a LINE / POLYLINE annot.
   *
   * @param annotationPtr - pointer to an `FPDF_ANNOTATION`
   * @returns `{ start, end }` or `undefined` when PDFium can't read them
   *
   * @private
   */
  private getLineEndings(annotationPtr: number): LineEndings | undefined {
    const startPtr = this.memoryManager.malloc(4);
    const endPtr = this.memoryManager.malloc(4);

    const ok = !!this.pdfiumModule.EPDFAnnot_GetLineEndings(annotationPtr, startPtr, endPtr);
    if (!ok) {
      this.memoryManager.free(startPtr);
      this.memoryManager.free(endPtr);
      return undefined;
    }

    const start = this.pdfiumModule.pdfium.getValue(startPtr, 'i32');
    const end = this.pdfiumModule.pdfium.getValue(endPtr, 'i32');

    this.memoryManager.free(startPtr);
    this.memoryManager.free(endPtr);

    return { start, end };
  }

  /**
   * Write the `/LE` array (start/end line-ending styles) for a LINE / POLYLINE annot.
   * @param annotationPtr - pointer to an `FPDF_ANNOTATION`
   * @param start - start line ending style
   * @param end - end line ending style
   * @returns `true` on success
   */
  private setLineEndings(
    annotationPtr: number,
    start: PdfAnnotationLineEnding,
    end: PdfAnnotationLineEnding,
  ): boolean {
    return !!this.pdfiumModule.EPDFAnnot_SetLineEndings(annotationPtr, start, end);
  }

  /**
   * Get the start and end points of a LINE / POLYLINE annot.
   * @param doc - pdf document object
   * @param annotationPtr - pointer to an `FPDF_ANNOTATION`
   * @param page - logical page info object (`PdfPageObject`)
   * @returns `{ start, end }` or `undefined` when PDFium can't read them
   */
  private getLinePoints(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
  ): LinePoints | undefined {
    const startPtr = this.memoryManager.malloc(8); // FS_POINTF (x,y floats)
    const endPtr = this.memoryManager.malloc(8);

    const ok = this.pdfiumModule.FPDFAnnot_GetLine(annotationPtr, startPtr, endPtr);
    if (!ok) {
      this.memoryManager.free(startPtr);
      this.memoryManager.free(endPtr);
      return undefined;
    }

    const pdf = this.pdfiumModule.pdfium;

    const sx = pdf.getValue(startPtr + 0, 'float');
    const sy = pdf.getValue(startPtr + 4, 'float');
    const ex = pdf.getValue(endPtr + 0, 'float');
    const ey = pdf.getValue(endPtr + 4, 'float');

    this.memoryManager.free(startPtr);
    this.memoryManager.free(endPtr);

    // page -> device using the new helper (handles rotation/scale consistently)
    const start = this.convertPagePointToDevicePoint(doc, page, { x: sx, y: sy });
    const end = this.convertPagePointToDevicePoint(doc, page, { x: ex, y: ey });

    return { start, end };
  }

  /**
   * Set the two end‑points of a **Line** annotation
   * by writing a new /L array `[ x1 y1 x2 y2 ]`.
   * @param doc - pdf document object
   * @param page - logical page info object (`PdfPageObject`)
   * @param annotPtr - pointer to the annotation whose line points are needed
   * @param start - start point
   * @param end - end point
   * @returns true on success
   */
  private setLinePoints(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotPtr: number,
    start: Position,
    end: Position,
  ): boolean {
    const p1 = this.convertDevicePointToPagePoint(doc, page, start);
    const p2 = this.convertDevicePointToPagePoint(doc, page, end);

    if (!p1 || !p2) return false;

    // pack as two FS_POINTF (x,y floats)
    const buf = this.memoryManager.malloc(16);
    const pdf = this.pdfiumModule.pdfium;
    pdf.setValue(buf + 0, p1.x, 'float');
    pdf.setValue(buf + 4, p1.y, 'float');
    pdf.setValue(buf + 8, p2.x, 'float');
    pdf.setValue(buf + 12, p2.y, 'float');

    const ok = this.pdfiumModule.EPDFAnnot_SetLine(annotPtr, buf, buf + 8);
    this.memoryManager.free(buf);
    return !!ok;
  }

  /**
   * Read `/QuadPoints` from any annotation and convert each quadrilateral to
   * device-space coordinates.
   *
   * The four points are returned in natural reading order:
   *   `p1 → p2` (top edge) and `p4 → p3` (bottom edge).
   * This preserves the true shape for rotated / skewed text, whereas callers
   * that only need axis-aligned boxes can collapse each quad themselves.
   *
   * @param doc           - pdf document object
   * @param page          - logical page info object (`PdfPageObject`)
   * @param annotationPtr - pointer to the annotation whose quads are needed
   * @returns Array of `Rect` objects (`[]` if the annotation has no quads)
   *
   * @private
   */
  private getQuadPointsAnno(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
  ): Rect[] {
    const quadCount = this.pdfiumModule.FPDFAnnot_CountAttachmentPoints(annotationPtr);
    if (quadCount === 0) return [];

    const FS_QUADPOINTSF_SIZE = 8 * 4; // eight floats, 32 bytes
    const quads: Quad[] = [];

    for (let qi = 0; qi < quadCount; qi++) {
      const quadPtr = this.memoryManager.malloc(FS_QUADPOINTSF_SIZE);

      const ok = this.pdfiumModule.FPDFAnnot_GetAttachmentPoints(annotationPtr, qi, quadPtr);

      if (ok) {
        // read the eight floats
        const xs: number[] = [];
        const ys: number[] = [];
        for (let i = 0; i < 4; i++) {
          const base = quadPtr + i * 8; // 8 bytes per point (x+y)
          xs.push(this.pdfiumModule.pdfium.getValue(base, 'float'));
          ys.push(this.pdfiumModule.pdfium.getValue(base + 4, 'float'));
        }

        // convert to device-space
        const p1 = this.convertPagePointToDevicePoint(doc, page, { x: xs[0], y: ys[0] });
        const p2 = this.convertPagePointToDevicePoint(doc, page, { x: xs[1], y: ys[1] });
        const p3 = this.convertPagePointToDevicePoint(doc, page, { x: xs[2], y: ys[2] });
        const p4 = this.convertPagePointToDevicePoint(doc, page, { x: xs[3], y: ys[3] });

        quads.push({ p1, p2, p3, p4 });
      }

      this.memoryManager.free(quadPtr);
    }

    return quads.map(quadToRect);
  }

  /**
   * Set the quadrilaterals for a **Highlight / Underline / StrikeOut / Squiggly** markup annotation.
   *
   * @param doc           - pdf document object
   * @param page          - logical page info object (`PdfPageObject`)
   * @param annotationPtr - pointer to the annotation whose quads are needed
   * @param rects         - array of `Rect` objects (`[]` if the annotation has no quads)
   * @returns `true` if the operation was successful
   *
   * @private
   */
  private syncQuadPointsAnno(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotPtr: number,
    rects: Rect[],
  ): boolean {
    const FS_QUADPOINTSF_SIZE = 8 * 4; // eight floats, 32 bytes
    const pdf = this.pdfiumModule.pdfium;
    const count = this.pdfiumModule.FPDFAnnot_CountAttachmentPoints(annotPtr);
    const buf = this.memoryManager.malloc(FS_QUADPOINTSF_SIZE);

    /** write one quad into `buf` in annotation space */
    const writeQuad = (r: Rect) => {
      const q = rectToQuad(r); // TL, TR, BR, BL
      const p1 = this.convertDevicePointToPagePoint(doc, page, q.p1);
      const p2 = this.convertDevicePointToPagePoint(doc, page, q.p2);
      const p3 = this.convertDevicePointToPagePoint(doc, page, q.p3); // BR
      const p4 = this.convertDevicePointToPagePoint(doc, page, q.p4); // BL

      // PDF QuadPoints order: BL, BR, TL, TR (bottom-left, bottom-right, top-left, top-right)
      pdf.setValue(buf + 0, p1.x, 'float'); // BL (bottom-left)
      pdf.setValue(buf + 4, p1.y, 'float');

      pdf.setValue(buf + 8, p2.x, 'float'); // BR (bottom-right)
      pdf.setValue(buf + 12, p2.y, 'float');

      pdf.setValue(buf + 16, p4.x, 'float'); // TL (top-left)
      pdf.setValue(buf + 20, p4.y, 'float');

      pdf.setValue(buf + 24, p3.x, 'float'); // TR (top-right)
      pdf.setValue(buf + 28, p3.y, 'float');
    };

    /* ----------------------------------------------------------------------- */
    /* 1. overwrite the quads that already exist                               */
    const min = Math.min(count, rects.length);
    for (let i = 0; i < min; i++) {
      writeQuad(rects[i]);
      if (!this.pdfiumModule.FPDFAnnot_SetAttachmentPoints(annotPtr, i, buf)) {
        this.memoryManager.free(buf);
        return false;
      }
    }

    /* 2. append new quads if rects.length > count                             */
    for (let i = count; i < rects.length; i++) {
      writeQuad(rects[i]);
      if (!this.pdfiumModule.FPDFAnnot_AppendAttachmentPoints(annotPtr, buf)) {
        this.memoryManager.free(buf);
        return false;
      }
    }

    this.memoryManager.free(buf);
    return true;
  }

  /**
   * Redact text that intersects ANY of the provided **quads** (device-space).
   * Returns `true` if the page changed. Always regenerates the page stream.
   */
  public redactTextInRects(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    rects: Rect[],
    options?: PdfRedactTextOptions,
  ): Task<boolean, PdfErrorReason> {
    const { recurseForms = true, drawBlackBoxes = false } = options ?? {};

    this.logger.debug(
      'PDFiumEngine',
      'Engine',
      'redactTextInQuads',
      doc.id,
      page.index,
      rects.length,
    );
    const label = 'RedactTextInQuads';
    this.logger.perf('PDFiumEngine', 'Engine', label, 'Begin', `${doc.id}-${page.index}`);

    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf('PDFiumEngine', 'Engine', label, 'End', `${doc.id}-${page.index}`);
      return PdfTaskHelper.reject<boolean>({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    // sanitize inputs
    const clean = (rects ?? []).filter(
      (r) =>
        r &&
        Number.isFinite(r.origin?.x) &&
        Number.isFinite(r.origin?.y) &&
        Number.isFinite(r.size?.width) &&
        Number.isFinite(r.size?.height) &&
        r.size.width > 0 &&
        r.size.height > 0,
    );

    if (clean.length === 0) {
      this.logger.perf('PDFiumEngine', 'Engine', label, 'End', `${doc.id}-${page.index}`);
      return PdfTaskHelper.resolve<boolean>(false);
    }

    const pageCtx = ctx.acquirePage(page.index);

    // pack buffer → native call
    const { ptr, count } = this.allocFSQuadsBufferFromRects(doc, page, clean);
    let ok = false;
    try {
      // If your wrapper exposes FPDFText_RedactInQuads, call that instead.
      ok = !!this.pdfiumModule.EPDFText_RedactInQuads(
        pageCtx.pagePtr,
        ptr,
        count,
        recurseForms ? true : false,
        false,
      );
    } finally {
      this.memoryManager.free(ptr);
    }

    if (ok) {
      ok = !!this.pdfiumModule.FPDFPage_GenerateContent(pageCtx.pagePtr);
    }

    pageCtx.disposeImmediate();
    this.logger.perf('PDFiumEngine', 'Engine', label, 'End', `${doc.id}-${page.index}`);

    return PdfTaskHelper.resolve<boolean>(!!ok);
  }

  /**
   * Apply a single redaction annotation, permanently removing content underneath
   * and flattening the RO (Redact Overlay) appearance stream if present.
   * The annotation is removed after successful application.
   *
   * @param doc - document object
   * @param page - page object
   * @param annotation - the redact annotation to apply
   * @returns true if successful
   */
  public applyRedaction(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
  ): PdfTask<boolean> {
    this.logger.debug(
      LOG_SOURCE,
      LOG_CATEGORY,
      'applyRedaction',
      doc.id,
      page.index,
      annotation.id,
    );
    const label = 'ApplyRedaction';
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, label, 'Begin', `${doc.id}-${page.index}`);

    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, label, 'End', `${doc.id}-${page.index}`);
      return PdfTaskHelper.reject<boolean>({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const pageCtx = ctx.acquirePage(page.index);
    const annotPtr = this.getAnnotationByName(pageCtx.pagePtr, annotation.id);
    if (!annotPtr) {
      pageCtx.release();
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, label, 'End', `${doc.id}-${page.index}`);
      return PdfTaskHelper.reject<boolean>({
        code: PdfErrorCode.NotFound,
        message: 'annotation not found',
      });
    }

    // Apply the redaction (removes content, flattens RO, removes annotation)
    const ok = this.pdfiumModule.EPDFAnnot_ApplyRedaction(pageCtx.pagePtr, annotPtr);
    this.pdfiumModule.FPDFPage_CloseAnnot(annotPtr);

    if (ok) {
      // Regenerate page content
      this.pdfiumModule.FPDFPage_GenerateContent(pageCtx.pagePtr);
    }

    pageCtx.disposeImmediate();
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, label, 'End', `${doc.id}-${page.index}`);

    return PdfTaskHelper.resolve<boolean>(!!ok);
  }

  /**
   * Apply all redaction annotations on a page, permanently removing content
   * underneath each one and flattening RO streams if present.
   * All redact annotations are removed after successful application.
   *
   * @param doc - document object
   * @param page - page object
   * @returns true if any redactions were applied
   */
  public applyAllRedactions(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<boolean> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'applyAllRedactions', doc.id, page.index);
    const label = 'ApplyAllRedactions';
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, label, 'Begin', `${doc.id}-${page.index}`);

    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, label, 'End', `${doc.id}-${page.index}`);
      return PdfTaskHelper.reject<boolean>({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const pageCtx = ctx.acquirePage(page.index);

    // Apply all redactions at once (content removal + RO flattening + annotation removal)
    const ok = this.pdfiumModule.EPDFPage_ApplyRedactions(pageCtx.pagePtr);

    if (ok) {
      // Regenerate page content
      this.pdfiumModule.FPDFPage_GenerateContent(pageCtx.pagePtr);
    }

    pageCtx.disposeImmediate();
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, label, 'End', `${doc.id}-${page.index}`);

    return PdfTaskHelper.resolve<boolean>(!!ok);
  }

  /**
   * Flatten an annotation's appearance (AP/N) to page content.
   * The annotation's visual appearance becomes part of the page itself.
   * The annotation is automatically removed after flattening.
   *
   * @param doc - document object
   * @param page - page object
   * @param annotation - the annotation to flatten
   * @returns true if successful
   */
  public flattenAnnotation(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
  ): PdfTask<boolean> {
    this.logger.debug(
      LOG_SOURCE,
      LOG_CATEGORY,
      'flattenAnnotation',
      doc.id,
      page.index,
      annotation.id,
    );
    const label = 'FlattenAnnotation';
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, label, 'Begin', `${doc.id}-${page.index}`);

    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, label, 'End', `${doc.id}-${page.index}`);
      return PdfTaskHelper.reject<boolean>({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const pageCtx = ctx.acquirePage(page.index);
    const annotPtr = this.getAnnotationByName(pageCtx.pagePtr, annotation.id);
    if (!annotPtr) {
      pageCtx.release();
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, label, 'End', `${doc.id}-${page.index}`);
      return PdfTaskHelper.reject<boolean>({
        code: PdfErrorCode.NotFound,
        message: 'annotation not found',
      });
    }

    // Flatten the annotation's appearance to page content and remove it
    const ok = this.pdfiumModule.EPDFAnnot_Flatten(pageCtx.pagePtr, annotPtr);
    this.pdfiumModule.FPDFPage_CloseAnnot(annotPtr);

    if (ok) {
      // Regenerate page content
      this.pdfiumModule.FPDFPage_GenerateContent(pageCtx.pagePtr);
    }

    pageCtx.disposeImmediate();
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, label, 'End', `${doc.id}-${page.index}`);

    return PdfTaskHelper.resolve<boolean>(!!ok);
  }

  /** Pack device-space Rects into an FS_QUADPOINTSF[] buffer (page space). */
  private allocFSQuadsBufferFromRects(doc: PdfDocumentObject, page: PdfPageObject, rects: Rect[]) {
    const STRIDE = 32; // 8 floats × 4 bytes
    const count = rects.length;
    const ptr = this.memoryManager.malloc(STRIDE * count);
    const pdf = this.pdfiumModule.pdfium;

    for (let i = 0; i < count; i++) {
      const r = rects[i];
      const q = rectToQuad(r); // TL, TR, BR, BL (device-space)

      // Convert into PAGE USER SPACE (native expects page coords)
      const p1 = this.convertDevicePointToPagePoint(doc, page, q.p1); // TL
      const p2 = this.convertDevicePointToPagePoint(doc, page, q.p2); // TR
      const p3 = this.convertDevicePointToPagePoint(doc, page, q.p3); // BR
      const p4 = this.convertDevicePointToPagePoint(doc, page, q.p4); // BL

      const base = ptr + i * STRIDE;

      // Keep the exact mapping you used in syncQuadPointsAnno:
      // PDF QuadPoints order comment says BL,BR,TL,TR – and you wrote:
      pdf.setValue(base + 0, p1.x, 'float');
      pdf.setValue(base + 4, p1.y, 'float');
      pdf.setValue(base + 8, p2.x, 'float');
      pdf.setValue(base + 12, p2.y, 'float');
      pdf.setValue(base + 16, p4.x, 'float');
      pdf.setValue(base + 20, p4.y, 'float');
      pdf.setValue(base + 24, p3.x, 'float');
      pdf.setValue(base + 28, p3.y, 'float');
    }

    return { ptr, count };
  }

  /**
   * Read ink list from annotation
   * @param doc - pdf document object
   * @param page  - logical page info object (`PdfPageObject`)
   * @param pagePtr - pointer to the page
   * @param annotationPtr - pointer to the annotation whose ink list is needed
   * @returns ink list
   */
  private getInkList(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
  ): PdfInkListObject[] {
    const inkList: PdfInkListObject[] = [];
    const pathCount = this.pdfiumModule.FPDFAnnot_GetInkListCount(annotationPtr);
    if (pathCount <= 0) return inkList;

    const pdf = this.pdfiumModule.pdfium;
    const POINT_STRIDE = 8; // FS_POINTF: 2 floats (x,y) => 8 bytes

    for (let i = 0; i < pathCount; i++) {
      const points: Position[] = [];

      const n = this.pdfiumModule.FPDFAnnot_GetInkListPath(annotationPtr, i, 0, 0);
      if (n > 0) {
        const buf = this.memoryManager.malloc(n * POINT_STRIDE);

        // load FS_POINTF array (page-space)
        this.pdfiumModule.FPDFAnnot_GetInkListPath(annotationPtr, i, buf, n);

        // convert each point to device-space using your helper
        for (let j = 0; j < n; j++) {
          const base = buf + j * POINT_STRIDE;
          const px = pdf.getValue(base + 0, 'float');
          const py = pdf.getValue(base + 4, 'float');
          const d = this.convertPagePointToDevicePoint(doc, page, { x: px, y: py });
          points.push({ x: d.x, y: d.y });
        }

        this.memoryManager.free(buf);
      }

      inkList.push({ points });
    }

    return inkList;
  }

  /**
   * Add ink list to annotation
   * @param doc - pdf document object
   * @param page  - logical page info object (`PdfPageObject`)
   * @param pagePtr - pointer to the page
   * @param annotationPtr - pointer to the annotation whose ink list is needed
   * @param inkList - ink list array of `PdfInkListObject`
   * @returns `true` if the operation was successful
   */
  private setInkList(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
    inkList: PdfInkListObject[],
  ): boolean {
    const pdf = this.pdfiumModule.pdfium;
    const POINT_STRIDE = 8; // FS_POINTF: float x, float y

    for (const stroke of inkList) {
      const n = stroke.points.length;
      if (n === 0) continue;

      const buf = this.memoryManager.malloc(n * POINT_STRIDE);

      // device -> page for each vertex
      for (let i = 0; i < n; i++) {
        const pDev = stroke.points[i];
        const pPage = this.convertDevicePointToPagePoint(doc, page, pDev);

        pdf.setValue(buf + i * POINT_STRIDE + 0, pPage.x, 'float');
        pdf.setValue(buf + i * POINT_STRIDE + 4, pPage.y, 'float');
      }

      const idx = this.pdfiumModule.FPDFAnnot_AddInkStroke(annotationPtr, buf, n);
      this.memoryManager.free(buf);

      if (idx === -1) {
        return false;
      }
    }

    return true;
  }

  /**
   * Read pdf text annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf text annotation
   *
   * @private
   */
  private readPdfTextAnno(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfTextAnnoObject | undefined {
    const annoRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(doc, page, annoRect);

    // Type-specific properties
    const state = this.getAnnotString(annotationPtr, 'State') as PdfAnnotationState;
    const stateModel = this.getAnnotString(annotationPtr, 'StateModel') as PdfAnnotationStateModel;
    const color = this.getAnnotationColor(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const icon = this.getAnnotationIcon(annotationPtr);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.TEXT,
      rect,
      color: color ?? '#FFFF00',
      opacity,
      state,
      stateModel,
      icon,
      ...this.readBaseAnnotationProperties(doc, page, annotationPtr),
    };
  }

  /**
   * Read pdf freetext annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf freetext annotation
   *
   * @private
   */
  private readPdfFreeTextAnno(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfFreeTextAnnoObject | undefined {
    const annoRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(doc, page, annoRect);

    // Type-specific properties
    const defaultStyle = this.getAnnotString(annotationPtr, 'DS');
    const da = this.getAnnotationDefaultAppearance(annotationPtr);
    const bgColor = this.getAnnotationColor(annotationPtr);
    const textAlign = this.getAnnotationTextAlignment(annotationPtr);
    const verticalAlign = this.getAnnotationVerticalAlignment(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const richContent = this.getAnnotRichContent(annotationPtr);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.FREETEXT,
      rect,
      fontFamily: da?.fontFamily ?? PdfStandardFont.Unknown,
      fontSize: da?.fontSize ?? 12,
      fontColor: da?.fontColor ?? '#000000',
      verticalAlign,
      color: bgColor, // fill color (matches shape convention)
      backgroundColor: bgColor, // deprecated alias
      opacity,
      textAlign,
      defaultStyle,
      richContent,
      ...this.readBaseAnnotationProperties(doc, page, annotationPtr),
    };
  }

  /**
   * Read pdf link annotation from pdf document
   * @param page  - pdf page infor
   * @param docPtr - pointer to pdf document object
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf link annotation
   *
   * @private
   */
  private readPdfLinkAnno(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    docPtr: number,
    annotationPtr: number,
    index: string,
  ): PdfLinkAnnoObject | undefined {
    const linkPtr = this.pdfiumModule.FPDFAnnot_GetLink(annotationPtr);
    if (!linkPtr) {
      return;
    }

    const annoRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(doc, page, annoRect);

    // Type-specific properties
    // Read border style and width
    const { style: strokeStyle, width: strokeWidth } = this.getBorderStyle(annotationPtr);

    // Read stroke color
    const strokeColor = this.getAnnotationColor(annotationPtr, PdfAnnotationColorType.Color);

    // Read dash pattern if dashed
    let strokeDashArray: number[] | undefined;
    if (strokeStyle === PdfAnnotationBorderStyle.DASHED) {
      const { ok, pattern } = this.getBorderDashPattern(annotationPtr);
      if (ok) {
        strokeDashArray = pattern;
      }
    }

    const target = this.readPdfLinkAnnoTarget(
      docPtr,
      () => {
        return this.pdfiumModule.FPDFLink_GetAction(linkPtr);
      },
      () => {
        return this.pdfiumModule.FPDFLink_GetDest(docPtr, linkPtr);
      },
    );

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.LINK,
      rect,
      target,
      strokeColor,
      strokeWidth,
      strokeStyle,
      strokeDashArray,
      ...this.readBaseAnnotationProperties(doc, page, annotationPtr),
    };
  }

  /**
   * Read pdf widget annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param formHandle - form handle
   * @param index  - index of annotation in the pdf page
   * @returns pdf widget annotation
   *
   * @private
   */
  private readPdfWidgetAnno(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
    formHandle: number,
    index: string,
  ): PdfWidgetAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(doc, page, pageRect);

    // Type-specific properties
    const field = this.readPdfWidgetAnnoField(formHandle, annotationPtr);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.WIDGET,
      rect,
      field,
      ...this.readBaseAnnotationProperties(doc, page, annotationPtr),
    };
  }

  /**
   * Read pdf file attachment annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf file attachment annotation
   *
   * @private
   */
  private readPdfFileAttachmentAnno(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfFileAttachmentAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(doc, page, pageRect);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.FILEATTACHMENT,
      rect,
      ...this.readBaseAnnotationProperties(doc, page, annotationPtr),
    };
  }

  /**
   * Read pdf ink annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf ink annotation
   *
   * @private
   */
  private readPdfInkAnno(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfInkAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(doc, page, pageRect);

    // Type-specific properties
    const strokeColor = this.getAnnotationColor(annotationPtr) ?? '#FF0000';
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const { width: strokeWidth } = this.getBorderStyle(annotationPtr);
    const inkList = this.getInkList(doc, page, annotationPtr);
    const blendMode = this.pdfiumModule.EPDFAnnot_GetBlendMode(annotationPtr);
    const intent = this.getAnnotIntent(annotationPtr);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.INK,
      rect,
      ...(intent && { intent }),
      blendMode,
      strokeColor,
      color: strokeColor, // deprecated alias
      opacity,
      strokeWidth: strokeWidth === 0 ? 1 : strokeWidth,
      inkList,
      ...this.readBaseAnnotationProperties(doc, page, annotationPtr),
    };
  }

  /**
   * Read pdf polygon annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf polygon annotation
   *
   * @private
   */
  private readPdfPolygonAnno(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfPolygonAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(doc, page, pageRect);

    // Type-specific properties
    const vertices = this.readPdfAnnoVertices(doc, page, annotationPtr);
    const strokeColor = this.getAnnotationColor(annotationPtr);
    const interiorColor = this.getAnnotationColor(
      annotationPtr,
      PdfAnnotationColorType.InteriorColor,
    );
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const { style: strokeStyle, width: strokeWidth } = this.getBorderStyle(annotationPtr);

    let strokeDashArray: number[] | undefined;
    if (strokeStyle === PdfAnnotationBorderStyle.DASHED) {
      const { ok, pattern } = this.getBorderDashPattern(annotationPtr);
      if (ok) {
        strokeDashArray = pattern;
      }
    }

    // Remove redundant closing vertex for polygons
    if (vertices.length > 1) {
      const first = vertices[0];
      const last = vertices[vertices.length - 1];
      if (first.x === last.x && first.y === last.y) {
        vertices.pop();
      }
    }

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.POLYGON,
      rect,
      strokeColor: strokeColor ?? '#FF0000',
      color: interiorColor ?? 'transparent',
      opacity,
      strokeWidth: strokeWidth === 0 ? 1 : strokeWidth,
      strokeStyle,
      strokeDashArray,
      vertices,
      ...this.readBaseAnnotationProperties(doc, page, annotationPtr),
    };
  }

  /**
   * Read pdf polyline annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf polyline annotation
   *
   * @private
   */
  private readPdfPolylineAnno(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfPolylineAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(doc, page, pageRect);

    // Type-specific properties
    const vertices = this.readPdfAnnoVertices(doc, page, annotationPtr);
    const strokeColor = this.getAnnotationColor(annotationPtr);
    const interiorColor = this.getAnnotationColor(
      annotationPtr,
      PdfAnnotationColorType.InteriorColor,
    );
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const { style: strokeStyle, width: strokeWidth } = this.getBorderStyle(annotationPtr);

    let strokeDashArray: number[] | undefined;
    if (strokeStyle === PdfAnnotationBorderStyle.DASHED) {
      const { ok, pattern } = this.getBorderDashPattern(annotationPtr);
      if (ok) {
        strokeDashArray = pattern;
      }
    }
    const lineEndings = this.getLineEndings(annotationPtr);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.POLYLINE,
      rect,
      strokeColor: strokeColor ?? '#FF0000',
      color: interiorColor ?? 'transparent',
      opacity,
      strokeWidth: strokeWidth === 0 ? 1 : strokeWidth,
      strokeStyle,
      strokeDashArray,
      lineEndings,
      vertices,
      ...this.readBaseAnnotationProperties(doc, page, annotationPtr),
    };
  }

  /**
   * Read pdf line annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf line annotation
   *
   * @private
   */
  private readPdfLineAnno(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfLineAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(doc, page, pageRect);

    // Type-specific properties
    const linePoints = this.getLinePoints(doc, page, annotationPtr);
    const lineEndings = this.getLineEndings(annotationPtr);
    const strokeColor = this.getAnnotationColor(annotationPtr);
    const interiorColor = this.getAnnotationColor(
      annotationPtr,
      PdfAnnotationColorType.InteriorColor,
    );
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const { style: strokeStyle, width: strokeWidth } = this.getBorderStyle(annotationPtr);

    let strokeDashArray: number[] | undefined;
    if (strokeStyle === PdfAnnotationBorderStyle.DASHED) {
      const { ok, pattern } = this.getBorderDashPattern(annotationPtr);
      if (ok) {
        strokeDashArray = pattern;
      }
    }

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.LINE,
      rect,
      strokeWidth: strokeWidth === 0 ? 1 : strokeWidth,
      strokeStyle,
      strokeDashArray,
      strokeColor: strokeColor ?? '#FF0000',
      color: interiorColor ?? 'transparent',
      opacity,
      linePoints: linePoints || { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
      lineEndings: lineEndings || {
        start: PdfAnnotationLineEnding.None,
        end: PdfAnnotationLineEnding.None,
      },
      ...this.readBaseAnnotationProperties(doc, page, annotationPtr),
    };
  }

  /**
   * Read pdf highlight annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf highlight annotation
   *
   * @private
   */
  private readPdfHighlightAnno(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfHighlightAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(doc, page, pageRect);

    // Type-specific properties
    const segmentRects = this.getQuadPointsAnno(doc, page, annotationPtr);
    const strokeColor = this.getAnnotationColor(annotationPtr) ?? '#FFFF00';
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const blendMode = this.pdfiumModule.EPDFAnnot_GetBlendMode(annotationPtr);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.HIGHLIGHT,
      rect,
      blendMode,
      segmentRects,
      strokeColor,
      color: strokeColor, // deprecated alias
      opacity,
      ...this.readBaseAnnotationProperties(doc, page, annotationPtr),
    };
  }

  /**
   * Read pdf underline annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf underline annotation
   *
   * @private
   */
  private readPdfUnderlineAnno(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfUnderlineAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(doc, page, pageRect);

    // Type-specific properties
    const segmentRects = this.getQuadPointsAnno(doc, page, annotationPtr);
    const strokeColor = this.getAnnotationColor(annotationPtr) ?? '#FF0000';
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const blendMode = this.pdfiumModule.EPDFAnnot_GetBlendMode(annotationPtr);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.UNDERLINE,
      rect,
      blendMode,
      segmentRects,
      strokeColor,
      color: strokeColor, // deprecated alias
      opacity,
      ...this.readBaseAnnotationProperties(doc, page, annotationPtr),
    };
  }

  /**
   * Read strikeout annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf strikeout annotation
   *
   * @private
   */
  private readPdfStrikeOutAnno(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfStrikeOutAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(doc, page, pageRect);

    // Type-specific properties
    const segmentRects = this.getQuadPointsAnno(doc, page, annotationPtr);
    const strokeColor = this.getAnnotationColor(annotationPtr) ?? '#FF0000';
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const blendMode = this.pdfiumModule.EPDFAnnot_GetBlendMode(annotationPtr);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.STRIKEOUT,
      rect,
      blendMode,
      segmentRects,
      strokeColor,
      color: strokeColor, // deprecated alias
      opacity,
      ...this.readBaseAnnotationProperties(doc, page, annotationPtr),
    };
  }

  /**
   * Read pdf squiggly annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf squiggly annotation
   *
   * @private
   */
  private readPdfSquigglyAnno(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfSquigglyAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(doc, page, pageRect);

    // Type-specific properties
    const segmentRects = this.getQuadPointsAnno(doc, page, annotationPtr);
    const strokeColor = this.getAnnotationColor(annotationPtr) ?? '#FF0000';
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const blendMode = this.pdfiumModule.EPDFAnnot_GetBlendMode(annotationPtr);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.SQUIGGLY,
      rect,
      blendMode,
      segmentRects,
      strokeColor,
      color: strokeColor, // deprecated alias
      opacity,
      ...this.readBaseAnnotationProperties(doc, page, annotationPtr),
    };
  }

  /**
   * Read pdf caret annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf caret annotation
   *
   * @private
   */
  private readPdfCaretAnno(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfCaretAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(doc, page, pageRect);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.CARET,
      rect,
      ...this.readBaseAnnotationProperties(doc, page, annotationPtr),
    };
  }

  /**
   * Read pdf redact annotation
   * @param page  - pdf page info
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf redact annotation
   *
   * @private
   */
  private readPdfRedactAnno(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfRedactAnnoObject {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(doc, page, pageRect);

    // QuadPoints for redaction areas
    const segmentRects = this.getQuadPointsAnno(doc, page, annotationPtr);

    // Colors: IC = interior/preview, OC = overlay, C = stroke
    const color = this.getAnnotationColor(annotationPtr, PdfAnnotationColorType.InteriorColor);
    const overlayColor = this.getAnnotationColor(
      annotationPtr,
      PdfAnnotationColorType.OverlayColor,
    );
    const strokeColor = this.getAnnotationColor(annotationPtr, PdfAnnotationColorType.Color);
    const opacity = this.getAnnotationOpacity(annotationPtr);

    // Overlay text properties
    const overlayText = this.getOverlayText(annotationPtr);
    const overlayTextRepeat = this.getOverlayTextRepeat(annotationPtr);

    // Font properties from DA
    const da = this.getAnnotationDefaultAppearance(annotationPtr);
    const textAlign = this.getAnnotationTextAlignment(annotationPtr);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.REDACT,
      rect,
      segmentRects,
      color,
      overlayColor,
      strokeColor,
      opacity,
      overlayText,
      overlayTextRepeat,
      fontFamily: da?.fontFamily,
      fontSize: da?.fontSize,
      fontColor: da?.fontColor,
      textAlign,
      ...this.readBaseAnnotationProperties(doc, page, annotationPtr),
    };
  }

  /**
   * Read pdf stamp annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf stamp annotation
   *
   * @private
   */
  private readPdfStampAnno(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfStampAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(doc, page, pageRect);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.STAMP,
      rect,
      ...this.readBaseAnnotationProperties(doc, page, annotationPtr),
    };
  }

  /**
   * Read pdf object in pdf page
   * @param pageObjectPtr  - pointer to pdf object in page
   * @returns pdf object in page
   *
   * @private
   */
  private readPdfPageObject(pageObjectPtr: number) {
    const type = this.pdfiumModule.FPDFPageObj_GetType(pageObjectPtr) as PdfPageObjectType;
    switch (type) {
      case PdfPageObjectType.PATH:
        return this.readPathObject(pageObjectPtr);
      case PdfPageObjectType.IMAGE:
        return this.readImageObject(pageObjectPtr);
      case PdfPageObjectType.FORM:
        return this.readFormObject(pageObjectPtr);
    }
  }

  /**
   * Read pdf path object
   * @param pathObjectPtr  - pointer to pdf path object in page
   * @returns pdf path object
   *
   * @private
   */
  private readPathObject(pathObjectPtr: number): PdfPathObject {
    const segmentCount = this.pdfiumModule.FPDFPath_CountSegments(pathObjectPtr);

    const leftPtr = this.memoryManager.malloc(4);
    const bottomPtr = this.memoryManager.malloc(4);
    const rightPtr = this.memoryManager.malloc(4);
    const topPtr = this.memoryManager.malloc(4);
    this.pdfiumModule.FPDFPageObj_GetBounds(pathObjectPtr, leftPtr, bottomPtr, rightPtr, topPtr);
    const left = this.pdfiumModule.pdfium.getValue(leftPtr, 'float');
    const bottom = this.pdfiumModule.pdfium.getValue(bottomPtr, 'float');
    const right = this.pdfiumModule.pdfium.getValue(rightPtr, 'float');
    const top = this.pdfiumModule.pdfium.getValue(topPtr, 'float');
    const bounds = { left, bottom, right, top };
    this.memoryManager.free(leftPtr);
    this.memoryManager.free(bottomPtr);
    this.memoryManager.free(rightPtr);
    this.memoryManager.free(topPtr);
    const segments: PdfSegmentObject[] = [];
    for (let i = 0; i < segmentCount; i++) {
      const segment = this.readPdfSegment(pathObjectPtr, i);
      segments.push(segment);
    }

    const matrix = this.readPdfPageObjectTransformMatrix(pathObjectPtr);

    return {
      type: PdfPageObjectType.PATH,
      bounds,
      segments,
      matrix,
    };
  }

  /**
   * Read segment of pdf path object
   * @param annotationObjectPtr - pointer to pdf path object
   * @param segmentIndex - index of segment
   * @returns pdf segment in pdf path
   *
   * @private
   */
  private readPdfSegment(annotationObjectPtr: number, segmentIndex: number): PdfSegmentObject {
    const segmentPtr = this.pdfiumModule.FPDFPath_GetPathSegment(annotationObjectPtr, segmentIndex);
    const segmentType = this.pdfiumModule.FPDFPathSegment_GetType(segmentPtr);
    const isClosed = this.pdfiumModule.FPDFPathSegment_GetClose(segmentPtr);
    const pointXPtr = this.memoryManager.malloc(4);
    const pointYPtr = this.memoryManager.malloc(4);
    this.pdfiumModule.FPDFPathSegment_GetPoint(segmentPtr, pointXPtr, pointYPtr);
    const pointX = this.pdfiumModule.pdfium.getValue(pointXPtr, 'float');
    const pointY = this.pdfiumModule.pdfium.getValue(pointYPtr, 'float');
    this.memoryManager.free(pointXPtr);
    this.memoryManager.free(pointYPtr);

    return {
      type: segmentType,
      point: { x: pointX, y: pointY },
      isClosed,
    };
  }

  /**
   * Read pdf image object from pdf document
   * @param pageObjectPtr  - pointer to pdf image object in page
   * @returns pdf image object
   *
   * @private
   */
  private readImageObject(imageObjectPtr: number): PdfImageObject {
    const bitmapPtr = this.pdfiumModule.FPDFImageObj_GetBitmap(imageObjectPtr);
    const bitmapBufferPtr = this.pdfiumModule.FPDFBitmap_GetBuffer(bitmapPtr);
    const bitmapWidth = this.pdfiumModule.FPDFBitmap_GetWidth(bitmapPtr);
    const bitmapHeight = this.pdfiumModule.FPDFBitmap_GetHeight(bitmapPtr);
    const format = this.pdfiumModule.FPDFBitmap_GetFormat(bitmapPtr) as BitmapFormat;

    const pixelCount = bitmapWidth * bitmapHeight;
    const bytesPerPixel = 4;
    const array = new Uint8ClampedArray(pixelCount * bytesPerPixel);
    for (let i = 0; i < pixelCount; i++) {
      switch (format) {
        case BitmapFormat.Bitmap_BGR:
          {
            const blue = this.pdfiumModule.pdfium.getValue(bitmapBufferPtr + i * 3, 'i8');
            const green = this.pdfiumModule.pdfium.getValue(bitmapBufferPtr + i * 3 + 1, 'i8');
            const red = this.pdfiumModule.pdfium.getValue(bitmapBufferPtr + i * 3 + 2, 'i8');
            array[i * bytesPerPixel] = red;
            array[i * bytesPerPixel + 1] = green;
            array[i * bytesPerPixel + 2] = blue;
            array[i * bytesPerPixel + 3] = 100;
          }
          break;
      }
    }

    // Return plain object (ImageDataLike) instead of browser-specific ImageData
    const imageDataLike: ImageDataLike = {
      data: array,
      width: bitmapWidth,
      height: bitmapHeight,
    };
    const matrix = this.readPdfPageObjectTransformMatrix(imageObjectPtr);

    return {
      type: PdfPageObjectType.IMAGE,
      imageData: imageDataLike,
      matrix,
    };
  }

  /**
   * Read form object from pdf document
   * @param formObjectPtr  - pointer to pdf form object in page
   * @returns pdf form object
   *
   * @private
   */
  private readFormObject(formObjectPtr: number): PdfFormObject {
    const objectCount = this.pdfiumModule.FPDFFormObj_CountObjects(formObjectPtr);
    const objects: (PdfFormObject | PdfImageObject | PdfPathObject)[] = [];
    for (let i = 0; i < objectCount; i++) {
      const pageObjectPtr = this.pdfiumModule.FPDFFormObj_GetObject(formObjectPtr, i);
      const pageObj = this.readPdfPageObject(pageObjectPtr);
      if (pageObj) {
        objects.push(pageObj);
      }
    }
    const matrix = this.readPdfPageObjectTransformMatrix(formObjectPtr);

    return {
      type: PdfPageObjectType.FORM,
      objects,
      matrix,
    };
  }

  /**
   * Read pdf object in pdf page
   * @param pageObjectPtr  - pointer to pdf object in page
   * @returns pdf object in page
   *
   * @private
   */
  private readPdfPageObjectTransformMatrix(pageObjectPtr: number): PdfTransformMatrix {
    const matrixPtr = this.memoryManager.malloc(4 * 6);
    if (this.pdfiumModule.FPDFPageObj_GetMatrix(pageObjectPtr, matrixPtr)) {
      const a = this.pdfiumModule.pdfium.getValue(matrixPtr, 'float');
      const b = this.pdfiumModule.pdfium.getValue(matrixPtr + 4, 'float');
      const c = this.pdfiumModule.pdfium.getValue(matrixPtr + 8, 'float');
      const d = this.pdfiumModule.pdfium.getValue(matrixPtr + 12, 'float');
      const e = this.pdfiumModule.pdfium.getValue(matrixPtr + 16, 'float');
      const f = this.pdfiumModule.pdfium.getValue(matrixPtr + 20, 'float');
      this.memoryManager.free(matrixPtr);

      return { a, b, c, d, e, f };
    }

    this.memoryManager.free(matrixPtr);

    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }

  /**
   * Read contents of a stamp annotation
   * @param annotationPtr - pointer to pdf annotation
   * @returns contents of the stamp annotation
   *
   * @private
   */
  private readStampAnnotationContents(annotationPtr: number): PdfStampAnnoObjectContents {
    const contents: PdfStampAnnoObjectContents = [];

    const objectCount = this.pdfiumModule.FPDFAnnot_GetObjectCount(annotationPtr);
    for (let i = 0; i < objectCount; i++) {
      const annotationObjectPtr = this.pdfiumModule.FPDFAnnot_GetObject(annotationPtr, i);

      const pageObj = this.readPdfPageObject(annotationObjectPtr);
      if (pageObj) {
        contents.push(pageObj);
      }
    }

    return contents;
  }

  /**
   * Return the stroke-width declared in the annotation’s /Border or /BS entry.
   * Falls back to 1 pt when nothing is defined.
   *
   * @param annotationPtr - pointer to pdf annotation
   * @returns stroke-width
   *
   * @private
   */
  private getStrokeWidth(annotationPtr: number): number {
    // FPDFAnnot_GetBorder(annot, &hRadius, &vRadius, &borderWidth)
    const hPtr = this.memoryManager.malloc(4);
    const vPtr = this.memoryManager.malloc(4);
    const wPtr = this.memoryManager.malloc(4);

    const ok = this.pdfiumModule.FPDFAnnot_GetBorder(annotationPtr, hPtr, vPtr, wPtr);
    const width = ok ? this.pdfiumModule.pdfium.getValue(wPtr, 'float') : 1; // default 1 pt

    this.memoryManager.free(hPtr);
    this.memoryManager.free(vPtr);
    this.memoryManager.free(wPtr);

    return width;
  }

  /**
   * Fetches the `/F` flag bit-field from an annotation.
   *
   * @param annotationPtr pointer to an `FPDF_ANNOTATION`
   * @returns `{ raw, flags }`
   *          • `raw`   – the 32-bit integer returned by PDFium
   *          • `flags` – object with individual booleans
   */
  private getAnnotationFlags(annotationPtr: number): PdfAnnotationFlagName[] {
    const rawFlags = this.pdfiumModule.FPDFAnnot_GetFlags(annotationPtr); // number

    return flagsToNames(rawFlags);
  }

  private setAnnotationFlags(annotationPtr: number, flags: PdfAnnotationFlagName[]): boolean {
    const rawFlags = namesToFlags(flags);
    return this.pdfiumModule.FPDFAnnot_SetFlags(annotationPtr, rawFlags);
  }

  /**
   * Read circle annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf circle annotation
   *
   * @private
   */
  private readPdfCircleAnno(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfCircleAnnoObject {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(doc, page, pageRect);

    // Type-specific properties
    const interiorColor = this.getAnnotationColor(
      annotationPtr,
      PdfAnnotationColorType.InteriorColor,
    );
    const strokeColor = this.getAnnotationColor(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const { style: strokeStyle, width: strokeWidth } = this.getBorderStyle(annotationPtr);

    let strokeDashArray: number[] | undefined;
    if (strokeStyle === PdfAnnotationBorderStyle.DASHED) {
      const { ok, pattern } = this.getBorderDashPattern(annotationPtr);
      if (ok) {
        strokeDashArray = pattern;
      }
    }

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.CIRCLE,
      rect,
      color: interiorColor ?? 'transparent',
      opacity,
      strokeWidth,
      strokeColor: strokeColor ?? '#FF0000',
      strokeStyle,
      ...(strokeDashArray !== undefined && { strokeDashArray }),
      ...this.readBaseAnnotationProperties(doc, page, annotationPtr),
    };
  }

  /**
   * Read square annotation
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf square annotation
   *
   * @private
   */
  private readPdfSquareAnno(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfSquareAnnoObject {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(doc, page, pageRect);

    // Type-specific properties
    const interiorColor = this.getAnnotationColor(
      annotationPtr,
      PdfAnnotationColorType.InteriorColor,
    );
    const strokeColor = this.getAnnotationColor(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const { style: strokeStyle, width: strokeWidth } = this.getBorderStyle(annotationPtr);

    let strokeDashArray: number[] | undefined;
    if (strokeStyle === PdfAnnotationBorderStyle.DASHED) {
      const { ok, pattern } = this.getBorderDashPattern(annotationPtr);
      if (ok) {
        strokeDashArray = pattern;
      }
    }

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.SQUARE,
      rect,
      color: interiorColor ?? 'transparent',
      opacity,
      strokeColor: strokeColor ?? '#FF0000',
      strokeWidth,
      strokeStyle,
      ...(strokeDashArray !== undefined && { strokeDashArray }),
      ...this.readBaseAnnotationProperties(doc, page, annotationPtr),
    };
  }

  /**
   * Read basic info of unsupported pdf annotation
   * @param page  - pdf page infor
   * @param type - type of annotation
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf annotation
   *
   * @private
   */
  private readPdfAnno(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    type: PdfUnsupportedAnnoObject['type'],
    annotationPtr: number,
    index: string,
  ): PdfUnsupportedAnnoObject {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(doc, page, pageRect);

    return {
      pageIndex: page.index,
      id: index,
      type,
      rect,
      ...this.readBaseAnnotationProperties(doc, page, annotationPtr),
    };
  }

  /**
   * Resolve `/IRT` → parent-annotation index on the same page.
   *
   * @param pagePtr        - pointer to FPDF_PAGE
   * @param annotationPtr  - pointer to FPDF_ANNOTATION
   * @returns index (`0…count-1`) or `undefined` when the annotation is *not* a reply
   *
   * @private
   */
  private getInReplyToId(annotationPtr: number): string | undefined {
    const parentPtr = this.pdfiumModule.FPDFAnnot_GetLinkedAnnot(annotationPtr, 'IRT');
    if (!parentPtr) return;

    return this.getAnnotString(parentPtr, 'NM');
  }

  /**
   * Set the in reply to id of the annotation
   *
   * @param annotationPtr - pointer to an `FPDF_ANNOTATION`
   * @param id - the id of the parent annotation
   * @returns `true` on success
   */
  private setInReplyToId(pagePtr: number, annotationPtr: number, id?: string): boolean {
    // If no id provided, clear the IRT key
    if (!id) {
      return this.pdfiumModule.EPDFAnnot_SetLinkedAnnot(annotationPtr, 'IRT', 0);
    }

    // Otherwise, find parent and set the link
    const parentPtr = this.getAnnotationByName(pagePtr, id);
    if (!parentPtr) return false;

    return this.pdfiumModule.EPDFAnnot_SetLinkedAnnot(annotationPtr, 'IRT', parentPtr);
  }

  /**
   * Rotate a point around a center by the given angle in degrees.
   * Used to rotate vertices for PDF storage.
   */
  private rotatePointForSave(point: Position, center: Position, angleDegrees: number): Position {
    const rad = (angleDegrees * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
    };
  }

  /**
   * Prepare an annotation for saving to PDF.
   * For vertex types (ink, line, polygon, polyline) with rotation,
   * physically rotates the vertices by +rotation so that other PDF viewers
   * see the correct visual result. Our viewer reverse-rotates on load.
   */
  private prepareAnnotationForSave(annotation: PdfAnnotationObject): PdfAnnotationObject {
    const rotation = annotation.rotation;
    const unrotatedRect = annotation.unrotatedRect;

    // If no rotation or no unrotatedRect, return as-is
    if (!rotation || rotation === 0 || !unrotatedRect) {
      return annotation;
    }

    // Compute the center of the unrotated rect (same as AABB center)
    const center: Position = {
      x: unrotatedRect.origin.x + unrotatedRect.size.width / 2,
      y: unrotatedRect.origin.y + unrotatedRect.size.height / 2,
    };

    switch (annotation.type) {
      case PdfAnnotationSubtype.INK: {
        const ink = annotation as PdfInkAnnoObject;
        const rotatedInkList = ink.inkList.map((stroke) => ({
          points: stroke.points.map((p) => this.rotatePointForSave(p, center, rotation)),
        }));
        return { ...ink, inkList: rotatedInkList };
      }

      case PdfAnnotationSubtype.LINE: {
        const line = annotation as PdfLineAnnoObject;
        return {
          ...line,
          linePoints: {
            start: this.rotatePointForSave(line.linePoints.start, center, rotation),
            end: this.rotatePointForSave(line.linePoints.end, center, rotation),
          },
        };
      }

      case PdfAnnotationSubtype.POLYGON: {
        const poly = annotation as PdfPolygonAnnoObject;
        return {
          ...poly,
          vertices: poly.vertices.map((v) => this.rotatePointForSave(v, center, rotation)),
        };
      }

      case PdfAnnotationSubtype.POLYLINE: {
        const polyline = annotation as PdfPolylineAnnoObject;
        return {
          ...polyline,
          vertices: polyline.vertices.map((v) => this.rotatePointForSave(v, center, rotation)),
        };
      }

      default:
        // Non-vertex types (square, circle, freetext, etc.) - no vertex rotation needed
        return annotation;
    }
  }

  /**
   * Apply all base annotation properties from PdfAnnotationObjectBase.
   * The setInReplyToId and setReplyType functions handle clearing when undefined.
   *
   * @param pagePtr - pointer to page object
   * @param annotationPtr - pointer to annotation object
   * @param annotation - the annotation object containing properties to apply
   * @returns `true` on success
   */
  private applyBaseAnnotationProperties(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    annotation: PdfAnnotationObject,
  ): boolean {
    // Author (T)
    if (!this.setAnnotString(annotationPtr, 'T', annotation.author || '')) {
      return false;
    }

    // Contents
    if (!this.setAnnotString(annotationPtr, 'Contents', annotation.contents ?? '')) {
      return false;
    }

    // Modified date (M)
    if (annotation.modified) {
      if (!this.setAnnotationDate(annotationPtr, 'M', annotation.modified)) {
        return false;
      }
    }

    // Creation date
    if (annotation.created) {
      if (!this.setAnnotationDate(annotationPtr, 'CreationDate', annotation.created)) {
        return false;
      }
    }

    // Flags
    if (annotation.flags) {
      if (!this.setAnnotationFlags(annotationPtr, annotation.flags)) {
        return false;
      }
    }

    // Handle customer-facing custom data (EPDFCustom) -- rotation metadata is
    // stored separately via EPDFRotate / EPDFUnrotatedRect, not in EPDFCustom.
    const existingCustom = this.getAnnotCustom(annotationPtr) ?? {};
    const customData = {
      ...existingCustom,
      ...(annotation.custom ?? {}),
    };

    // Remove legacy rotation fields from custom data if present
    delete customData.unrotatedRect;
    delete customData.rotation;

    const hasCustomData = Object.keys(customData).length > 0;
    if (hasCustomData) {
      if (!this.setAnnotCustom(annotationPtr, customData)) {
        return false;
      }
    } else if (Object.keys(existingCustom).length > 0) {
      // Existing custom data was cleared out - remove EPDFCustom entry
      if (!this.setAnnotCustom(annotationPtr, null)) {
        return false;
      }
    }

    // Set EmbedPDF extended rotation (stored as /EPDFRotate, not /Rotate)
    // Convert UI clockwise angle to PDF counter-clockwise convention
    if (annotation.rotation !== undefined) {
      const pdfRotation = annotation.rotation ? (360 - annotation.rotation) % 360 : 0;
      this.setAnnotExtendedRotation(annotationPtr, pdfRotation);
    }

    // Set EmbedPDF unrotated rect (stored as /EPDFUnrotatedRect array)
    if (annotation.unrotatedRect) {
      this.setAnnotUnrotatedRect(doc, page, annotationPtr, annotation.unrotatedRect);
    } else if (annotation.rotation && annotation.rotation !== 0) {
      // If rotation is set but no unrotatedRect provided, store current rect as unrotated
      this.setAnnotUnrotatedRect(doc, page, annotationPtr, annotation.rect);
    }

    // IRT (In Reply To) - setter handles clearing when undefined
    if (!this.setInReplyToId(pagePtr, annotationPtr, annotation.inReplyToId)) {
      return false;
    }

    // Reply Type - setter handles clearing when undefined
    if (!this.setReplyType(annotationPtr, annotation.replyType)) {
      return false;
    }

    return true;
  }

  /**
   * Read all base annotation properties from PdfAnnotationObjectBase.
   * Returns an object that can be spread into the annotation return value.
   *
   * @param doc - pdf document object
   * @param page - pdf page object
   * @param annotationPtr - pointer to annotation object
   * @returns object with base annotation properties
   */
  private readBaseAnnotationProperties(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
  ): {
    author: string | undefined;
    contents: string;
    modified: Date | undefined;
    created: Date | undefined;
    flags: PdfAnnotationFlagName[];
    custom: unknown;
    inReplyToId?: string;
    replyType?: PdfAnnotationReplyType;
  } {
    const author = this.getAnnotString(annotationPtr, 'T');
    const contents = this.getAnnotString(annotationPtr, 'Contents') || '';
    const modified = this.getAnnotationDate(annotationPtr, 'M');
    const created = this.getAnnotationDate(annotationPtr, 'CreationDate');
    const flags = this.getAnnotationFlags(annotationPtr);
    const custom = this.getAnnotCustom(annotationPtr);
    const inReplyToId = this.getInReplyToId(annotationPtr);
    const replyType = this.getReplyType(annotationPtr);

    // Read EmbedPDF extended rotation and convert from PDF CCW to UI CW convention
    const pdfRotation = this.getAnnotExtendedRotation(annotationPtr);
    const rotation = pdfRotation !== 0 ? (360 - pdfRotation) % 360 : 0;

    // Read EmbedPDF unrotated rect (raw page coords) and convert to device space
    const rawUnrotatedRect = this.readAnnotUnrotatedRect(annotationPtr);
    const unrotatedRect = rawUnrotatedRect
      ? this.convertPageRectToDeviceRect(doc, page, rawUnrotatedRect)
      : undefined;

    return {
      author,
      contents,
      modified,
      created,
      flags,
      custom,
      // Only include IRT if present
      ...(inReplyToId && { inReplyToId }),
      // Only include RT if present and not the default (Reply)
      ...(replyType && replyType !== PdfAnnotationReplyType.Reply && { replyType }),
      ...(rotation !== 0 && { rotation }),
      ...(unrotatedRect !== undefined && { unrotatedRect }),
    };
  }

  /**
   * Fetch a string value (`/T`, `/M`, `/State`, …) from an annotation.
   *
   * @returns decoded UTF-8 string or `undefined` when the key is absent
   *
   * @private
   */
  private getAnnotString(annotationPtr: number, key: string): string | undefined {
    const len = this.pdfiumModule.FPDFAnnot_GetStringValue(annotationPtr, key, 0, 0);
    if (len === 0) return;

    const bytes = (len + 1) * 2;
    const ptr = this.memoryManager.malloc(bytes);

    this.pdfiumModule.FPDFAnnot_GetStringValue(annotationPtr, key, ptr, bytes);
    const value = this.pdfiumModule.pdfium.UTF16ToString(ptr);
    this.memoryManager.free(ptr);

    return value || undefined;
  }

  /**
   * Get a string value (`/T`, `/M`, `/State`, …) from an attachment.
   *
   * @returns decoded UTF-8 string or `undefined` when the key is absent
   *
   * @private
   */
  private getAttachmentString(attachmentPtr: number, key: string): string | undefined {
    const len = this.pdfiumModule.FPDFAttachment_GetStringValue(attachmentPtr, key, 0, 0);
    if (len === 0) return;

    const bytes = (len + 1) * 2;
    const ptr = this.memoryManager.malloc(bytes);

    this.pdfiumModule.FPDFAttachment_GetStringValue(attachmentPtr, key, ptr, bytes);
    const value = this.pdfiumModule.pdfium.UTF16ToString(ptr);
    this.memoryManager.free(ptr);

    return value || undefined;
  }

  /**
   * Get a number value (`/Size`) from an attachment.
   *
   * @returns number or `null` when the key is absent
   *
   * @private
   */
  private getAttachmentNumber(attachmentPtr: number, key: string): number | undefined {
    const outPtr = this.memoryManager.malloc(4); // int32
    try {
      const ok = this.pdfiumModule.EPDFAttachment_GetIntegerValue(
        attachmentPtr,
        key, // FPDF_BYTESTRING → ASCII JS string is fine in your glue
        outPtr,
      );
      if (!ok) return undefined;
      // Treat as unsigned to avoid negative values if >2GB (rare on wasm, but harmless)
      return this.pdfiumModule.pdfium.getValue(outPtr, 'i32') >>> 0;
    } finally {
      this.memoryManager.free(outPtr);
    }
  }

  /**
   * Get custom data of the annotation
   * @param annotationPtr - pointer to pdf annotation
   * @returns custom data of the annotation
   *
   * @private
   */
  private getAnnotCustom(annotationPtr: number): any {
    const custom = this.getAnnotString(annotationPtr, 'EPDFCustom');
    if (!custom) return;

    try {
      return JSON.parse(custom);
    } catch (error) {
      console.warn('Failed to parse annotation custom data as JSON:', error);
      console.warn('Invalid JSON string:', custom);
      return undefined;
    }
  }

  /**
   * Sets custom data for an annotation by safely stringifying and storing JSON
   * @private
   */
  private setAnnotCustom(annotationPtr: number, data: any): boolean {
    if (data === undefined || data === null) {
      // Clear the custom data by setting empty string
      return this.setAnnotString(annotationPtr, 'EPDFCustom', '');
    }

    try {
      const jsonString = JSON.stringify(data);
      return this.setAnnotString(annotationPtr, 'EPDFCustom', jsonString);
    } catch (error) {
      console.warn('Failed to stringify annotation custom data as JSON:', error);
      console.warn('Invalid data object:', data);
      return false;
    }
  }

  /**
   * Fetches the /IT (Intent) name from an annotation as a UTF-8 JS string.
   *
   * Mirrors getAnnotString(): calls EPDFAnnot_GetIntent twice (length probe + copy).
   * Returns `undefined` if no intent present.
   */
  private getAnnotIntent(annotationPtr: number): string | undefined {
    const len = this.pdfiumModule.EPDFAnnot_GetIntent(annotationPtr, 0, 0);
    if (len === 0) return;

    const codeUnits = len + 1;
    const bytes = codeUnits * 2;
    const ptr = this.memoryManager.malloc(bytes);

    this.pdfiumModule.EPDFAnnot_GetIntent(annotationPtr, ptr, bytes);
    const value = this.pdfiumModule.pdfium.UTF16ToString(ptr);

    this.memoryManager.free(ptr);

    return value && value !== 'undefined' ? value : undefined;
  }

  /**
   * Write the `/IT` (Intent) name into an annotation dictionary.
   *
   * Mirrors EPDFAnnot_SetIntent in PDFium (expects a UTF‑8 FPDF_BYTESTRING).
   *
   * @param annotationPtr Pointer returned by FPDFPage_GetAnnot
   * @param intent        Name without leading slash, e.g. `"PolygonCloud"`
   *                      A leading “/” will be stripped for convenience.
   * @returns             true on success, false otherwise
   */
  private setAnnotIntent(annotationPtr: number, intent: string): boolean {
    return this.pdfiumModule.EPDFAnnot_SetIntent(annotationPtr, intent);
  }

  /**
   * Returns the rich‑content string stored in the annotation’s `/RC` entry.
   *
   * Works like `getAnnotIntent()`: first probe for length, then copy.
   * `undefined` when the annotation has no rich content.
   */
  private getAnnotRichContent(annotationPtr: number): string | undefined {
    // First call → number of UTF‑16 code units (excluding NUL)
    const len = this.pdfiumModule.EPDFAnnot_GetRichContent(annotationPtr, 0, 0);
    if (len === 0) return;

    // +1 for the implicit NUL added by PDFium → bytes = 2 × code units
    const codeUnits = len + 1;
    const bytes = codeUnits * 2;
    const ptr = this.memoryManager.malloc(bytes);

    this.pdfiumModule.EPDFAnnot_GetRichContent(annotationPtr, ptr, bytes);
    const value = this.pdfiumModule.pdfium.UTF16ToString(ptr);

    this.memoryManager.free(ptr);

    return value || undefined;
  }

  /**
   * Get annotation by name
   * @param pagePtr - pointer to pdf page object
   * @param name - name of annotation
   * @returns pointer to pdf annotation
   *
   * @private
   */
  private getAnnotationByName(pagePtr: number, name: string): number | undefined {
    return this.withWString(name, (wNamePtr) => {
      return this.pdfiumModule.EPDFPage_GetAnnotByName(pagePtr, wNamePtr);
    });
  }

  /**
   * Remove annotation by name
   * @param pagePtr - pointer to pdf page object
   * @param name - name of annotation
   * @returns true on success
   *
   * @private
   */
  private removeAnnotationByName(pagePtr: number, name: string): boolean {
    return this.withWString(name, (wNamePtr) => {
      return this.pdfiumModule.EPDFPage_RemoveAnnotByName(pagePtr, wNamePtr);
    });
  }

  /**
   * Set a string value (`/T`, `/M`, `/State`, …) to an annotation.
   *
   * @returns `true` if the operation was successful
   *
   * @private
   */
  private setAnnotString(annotationPtr: number, key: string, value: string): boolean {
    return this.withWString(value, (wValPtr) => {
      return this.pdfiumModule.FPDFAnnot_SetStringValue(annotationPtr, key, wValPtr);
    });
  }

  /**
   * Set a string value (`/T`, `/M`, `/State`, …) to an attachment.
   *
   * @returns `true` if the operation was successful
   *
   * @private
   */
  private setAttachmentString(attachmentPtr: number, key: string, value: string): boolean {
    return this.withWString(value, (wValPtr) => {
      // FPDFAttachment_SetStringValue writes into /Params dictionary
      return this.pdfiumModule.FPDFAttachment_SetStringValue(attachmentPtr, key, wValPtr);
    });
  }

  /**
   * Read vertices of pdf annotation
   * @param doc - pdf document object
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @returns vertices of pdf annotation
   *
   * @private
   */
  private readPdfAnnoVertices(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationPtr: number,
  ): Position[] {
    const vertices: Position[] = [];
    const count = this.pdfiumModule.FPDFAnnot_GetVertices(annotationPtr, 0, 0);
    const pointMemorySize = 8;
    const pointsPtr = this.memoryManager.malloc(count * pointMemorySize);
    this.pdfiumModule.FPDFAnnot_GetVertices(annotationPtr, pointsPtr, count);
    for (let i = 0; i < count; i++) {
      const pointX = this.pdfiumModule.pdfium.getValue(pointsPtr + i * pointMemorySize, 'float');
      const pointY = this.pdfiumModule.pdfium.getValue(
        pointsPtr + i * pointMemorySize + 4,
        'float',
      );

      const { x, y } = this.convertPagePointToDevicePoint(doc, page, {
        x: pointX,
        y: pointY,
      });
      const last = vertices[vertices.length - 1];
      if (!last || last.x !== x || last.y !== y) {
        vertices.push({ x, y });
      }
    }
    this.memoryManager.free(pointsPtr);

    return vertices;
  }

  /**
   * Sync the vertices of a polygon or polyline annotation.
   *
   * @param doc - pdf document object
   * @param page  - pdf page infor
   * @param annotPtr - pointer to pdf annotation
   * @param vertices - the vertices to be set
   * @returns true on success
   *
   * @private
   */
  private setPdfAnnoVertices(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotPtr: number,
    vertices: Position[],
  ): boolean {
    const pdf = this.pdfiumModule.pdfium;
    const FS_POINTF_SIZE = 8;

    const buf = this.memoryManager.malloc(FS_POINTF_SIZE * vertices.length);
    vertices.forEach((v, i) => {
      const pagePt = this.convertDevicePointToPagePoint(doc, page, v);
      pdf.setValue(buf + i * FS_POINTF_SIZE + 0, pagePt.x, 'float');
      pdf.setValue(buf + i * FS_POINTF_SIZE + 4, pagePt.y, 'float');
    });

    const ok = this.pdfiumModule.EPDFAnnot_SetVertices(annotPtr, buf, vertices.length);
    this.memoryManager.free(buf);
    return ok;
  }

  /**
   * Read the target of pdf bookmark
   * @param docPtr - pointer to pdf document object
   * @param getActionPtr - callback function to retrive the pointer of action
   * @param getDestinationPtr - callback function to retrive the pointer of destination
   * @returns target of pdf bookmark
   *
   * @private
   */
  private readPdfBookmarkTarget(
    docPtr: number,
    getActionPtr: () => number,
    getDestinationPtr: () => number,
  ): PdfLinkTarget | undefined {
    const actionPtr = getActionPtr();
    if (actionPtr) {
      const action = this.readPdfAction(docPtr, actionPtr);

      return {
        type: 'action',
        action,
      };
    } else {
      const destinationPtr = getDestinationPtr();
      if (destinationPtr) {
        const destination = this.readPdfDestination(docPtr, destinationPtr);

        return {
          type: 'destination',
          destination,
        };
      }
    }
  }

  /**
   * Read field of pdf widget annotation
   * @param formHandle - form handle
   * @param annotationPtr - pointer to pdf annotation
   * @returns field of pdf widget annotation
   *
   * @private
   */
  private readPdfWidgetAnnoField(formHandle: number, annotationPtr: number): PdfWidgetAnnoField {
    const flag = this.pdfiumModule.FPDFAnnot_GetFormFieldFlags(
      formHandle,
      annotationPtr,
    ) as PDF_FORM_FIELD_FLAG;

    const type = this.pdfiumModule.FPDFAnnot_GetFormFieldType(
      formHandle,
      annotationPtr,
    ) as PDF_FORM_FIELD_TYPE;

    const name = readString(
      this.pdfiumModule.pdfium,
      (buffer: number, bufferLength) => {
        return this.pdfiumModule.FPDFAnnot_GetFormFieldName(
          formHandle,
          annotationPtr,
          buffer,
          bufferLength,
        );
      },
      this.pdfiumModule.pdfium.UTF16ToString,
    );

    const alternateName = readString(
      this.pdfiumModule.pdfium,
      (buffer: number, bufferLength) => {
        return this.pdfiumModule.FPDFAnnot_GetFormFieldAlternateName(
          formHandle,
          annotationPtr,
          buffer,
          bufferLength,
        );
      },
      this.pdfiumModule.pdfium.UTF16ToString,
    );

    const value = readString(
      this.pdfiumModule.pdfium,
      (buffer: number, bufferLength) => {
        return this.pdfiumModule.FPDFAnnot_GetFormFieldValue(
          formHandle,
          annotationPtr,
          buffer,
          bufferLength,
        );
      },
      this.pdfiumModule.pdfium.UTF16ToString,
    );

    const options: PdfWidgetAnnoOption[] = [];
    if (type === PDF_FORM_FIELD_TYPE.COMBOBOX || type === PDF_FORM_FIELD_TYPE.LISTBOX) {
      const count = this.pdfiumModule.FPDFAnnot_GetOptionCount(formHandle, annotationPtr);
      for (let i = 0; i < count; i++) {
        const label = readString(
          this.pdfiumModule.pdfium,
          (buffer: number, bufferLength) => {
            return this.pdfiumModule.FPDFAnnot_GetOptionLabel(
              formHandle,
              annotationPtr,
              i,
              buffer,
              bufferLength,
            );
          },
          this.pdfiumModule.pdfium.UTF16ToString,
        );
        const isSelected = this.pdfiumModule.FPDFAnnot_IsOptionSelected(
          formHandle,
          annotationPtr,
          i,
        );
        options.push({
          label,
          isSelected,
        });
      }
    }

    let isChecked = false;
    if (type === PDF_FORM_FIELD_TYPE.CHECKBOX || type === PDF_FORM_FIELD_TYPE.RADIOBUTTON) {
      isChecked = this.pdfiumModule.FPDFAnnot_IsChecked(formHandle, annotationPtr);
    }

    return {
      flag,
      type,
      name,
      alternateName,
      value,
      isChecked,
      options,
    };
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.renderAnnotation}
   *
   * @public
   */
  renderPageAnnotationRaw(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
    options?: PdfRenderPageAnnotationOptions,
  ): PdfTask<ImageDataLike> {
    const {
      scaleFactor = 1,
      rotation = Rotation.Degree0,
      dpr = 1,
      mode = AppearanceMode.Normal,
    } = options ?? {};

    this.logger.debug(
      LOG_SOURCE,
      LOG_CATEGORY,
      'renderPageAnnotation',
      doc,
      page,
      annotation,
      options,
    );
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `RenderPageAnnotation`,
      'Begin',
      `${doc.id}-${page.index}-${annotation.id}`,
    );

    const task = new Task<ImageDataLike, PdfErrorReason>();
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        `RenderPageAnnotation`,
        'End',
        `${doc.id}-${page.index}-${annotation.id}`,
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    // 1) native handles
    const pageCtx = ctx.acquirePage(page.index);
    const annotPtr = this.getAnnotationByName(pageCtx.pagePtr, annotation.id);
    if (!annotPtr) {
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        `RenderPageAnnotation`,
        'End',
        `${doc.id}-${page.index}-${annotation.id}`,
      );
      pageCtx.release();
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'annotation not found' });
    }

    // 2) device size (rotation-aware) → integer pixels
    const finalScale = Math.max(0.01, scaleFactor * dpr);

    // When the caller opts in and an unrotatedRect is available, use it for
    // bitmap dimensions and the unrotated WASM render path (CSS handles rotation).
    const unrotated = !!options?.unrotated && !!annotation.unrotatedRect;
    const renderRect = unrotated ? annotation.unrotatedRect! : annotation.rect;

    const rect = toIntRect(renderRect);
    const devRect = toIntRect(transformRect(page.size, rect, rotation, finalScale));

    const wDev = Math.max(1, devRect.size.width);
    const hDev = Math.max(1, devRect.size.height);
    const stride = wDev * 4;
    const bytes = stride * hDev;

    // 3) bitmap backing store in WASM
    const heapPtr = this.memoryManager.malloc(bytes);
    const bitmapPtr = this.pdfiumModule.FPDFBitmap_CreateEx(
      wDev,
      hDev,
      BitmapFormat.Bitmap_BGRA,
      heapPtr,
      stride,
    );
    this.pdfiumModule.FPDFBitmap_FillRect(bitmapPtr, 0, 0, wDev, hDev, 0x00000000);

    // 4) user matrix (no Y-flip; includes -origin translate)
    const M = buildUserToDeviceMatrix(
      rect, // {origin:{L,B}, size:{W,H}}
      rotation,
      wDev,
      hDev,
    );
    const mPtr = this.memoryManager.malloc(6 * 4);
    const mView = new Float32Array(this.pdfiumModule.pdfium.HEAPF32.buffer, mPtr, 6);
    mView.set([M.a, M.b, M.c, M.d, M.e, M.f]);

    // 5) render
    const FLAGS = RenderFlag.REVERSE_BYTE_ORDER;
    let ok = false;
    try {
      if (unrotated) {
        // Use the unrotated rendering path: ignores AP Matrix, uses
        // EPDFUnrotatedRect for MatchRect — no annotation state mutation.
        ok = !!this.pdfiumModule.EPDF_RenderAnnotBitmapUnrotated(
          bitmapPtr,
          pageCtx.pagePtr,
          annotPtr,
          mode,
          mPtr,
          FLAGS,
        );
      } else {
        ok = !!this.pdfiumModule.EPDF_RenderAnnotBitmap(
          bitmapPtr,
          pageCtx.pagePtr,
          annotPtr,
          mode,
          mPtr,
          FLAGS,
        );
      }
    } finally {
      this.memoryManager.free(mPtr);
      this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr); // frees wrapper, not our heapPtr
      this.pdfiumModule.FPDFPage_CloseAnnot(annotPtr);
      pageCtx.release();
    }

    if (!ok) {
      this.memoryManager.free(heapPtr);
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        `RenderPageAnnotation`,
        'End',
        `${doc.id}-${page.index}-${annotation.id}`,
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Unknown,
        message: 'EPDF_RenderAnnotBitmap failed',
      });
    }

    const data = this.pdfiumModule.pdfium.HEAPU8.subarray(heapPtr, heapPtr + bytes);
    // Return plain object (ImageDataLike) instead of browser-specific ImageData
    const imageDataLike: ImageDataLike = {
      data: new Uint8ClampedArray(data),
      width: wDev,
      height: hDev,
    };
    task.resolve(imageDataLike);
    this.memoryManager.free(heapPtr);
    return task;
  }

  private renderRectEncoded(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    rect: Rect,
    options?: PdfRenderPageOptions,
  ): PdfTask<ImageDataLike> {
    const task = new Task<ImageDataLike, PdfErrorReason>();
    const rotation: Rotation = options?.rotation ?? Rotation.Degree0;

    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    // ---- 1) decide device size (scale × dpr, swap for 90/270)
    const scale = Math.max(0.01, options?.scaleFactor ?? 1);
    const dpr = Math.max(1, options?.dpr ?? 1);
    const finalScale = scale * dpr;

    const baseW = rect.size.width;
    const baseH = rect.size.height;
    const swap = (rotation & 1) === 1; // 90 or 270

    const wDev = Math.max(1, Math.round((swap ? baseH : baseW) * finalScale));
    const hDev = Math.max(1, Math.round((swap ? baseW : baseH) * finalScale));
    const stride = wDev * 4;
    const bytes = stride * hDev;

    const pageCtx = ctx.acquirePage(page.index);
    const shouldRenderForms = options?.withForms ?? false;
    const formHandle = shouldRenderForms ? pageCtx.getFormHandle() : undefined;

    // ---- 2) allocate a BGRA bitmap in WASM
    const heapPtr = this.memoryManager.malloc(bytes);
    const bitmapPtr = this.pdfiumModule.FPDFBitmap_CreateEx(
      wDev,
      hDev,
      BitmapFormat.Bitmap_BGRA,
      heapPtr,
      stride,
    );
    // white background like page renderers typically do
    this.pdfiumModule.FPDFBitmap_FillRect(bitmapPtr, 0, 0, wDev, hDev, 0xffffffff);

    const M = buildUserToDeviceMatrix(rect, rotation, wDev, hDev);

    const mPtr = this.memoryManager.malloc(6 * 4); // FS_MATRIX
    const mView = new Float32Array(this.pdfiumModule.pdfium.HEAPF32.buffer, mPtr, 6);
    mView.set([M.a, M.b, M.c, M.d, M.e, M.f]);

    // Clip to the whole bitmap (device space)
    const clipPtr = this.memoryManager.malloc(4 * 4); // FS_RECTF {left,bottom,right,top}
    const clipView = new Float32Array(this.pdfiumModule.pdfium.HEAPF32.buffer, clipPtr, 4);
    clipView.set([0, 0, wDev, hDev]);

    // Rendering flags: swap byte order to present RGBA to JS; include LCD_TEXT and ANNOT if asked
    let flags = RenderFlag.REVERSE_BYTE_ORDER;
    if (options?.withAnnotations ?? false) flags |= RenderFlag.ANNOT;

    try {
      this.pdfiumModule.FPDF_RenderPageBitmapWithMatrix(
        bitmapPtr,
        pageCtx.pagePtr,
        mPtr,
        clipPtr,
        flags,
      );

      if (formHandle !== undefined) {
        const formParams = computeFormDrawParams(M, rect, page.size, rotation);
        const { startX, startY, formsWidth, formsHeight, scaleX, scaleY } = formParams;

        // Draw form elements using the same effective transform as the page bitmap.
        this.pdfiumModule.FPDF_FFLDraw(
          formHandle,
          bitmapPtr,
          pageCtx.pagePtr,
          startX,
          startY,
          formsWidth,
          formsHeight,
          rotation,
          flags,
        );
      }
    } finally {
      pageCtx.release();
      this.memoryManager.free(mPtr);
      this.memoryManager.free(clipPtr);
    }

    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `RenderRectEncodedData`,
      'Begin',
      `${doc.id}-${page.index}`,
    );
    const data = this.pdfiumModule.pdfium.HEAPU8.subarray(heapPtr, heapPtr + bytes);
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `RenderRectEncodedData`,
      'End',
      `${doc.id}-${page.index}`,
    );

    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `RenderRectEncodedImageData`,
      'Begin',
      `${doc.id}-${page.index}`,
    );
    // Return plain object (ImageDataLike) instead of browser-specific ImageData
    // This ensures compatibility with Node.js and other non-browser environments
    const imageDataLike: ImageDataLike = {
      data: new Uint8ClampedArray(data),
      width: wDev,
      height: hDev,
    };
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `RenderRectEncodedImageData`,
      'End',
      `${doc.id}-${page.index}`,
    );
    task.resolve(imageDataLike);

    this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr);
    this.memoryManager.free(heapPtr);

    return task;
  }

  /**
   * Read the target of pdf link annotation
   * @param docPtr - pointer to pdf document object
   * @param getActionPtr - callback function to retrive the pointer of action
   * @param getDestinationPtr - callback function to retrive the pointer of destination
   * @returns target of link
   *
   * @private
   */
  private readPdfLinkAnnoTarget(
    docPtr: number,
    getActionPtr: () => number,
    getDestinationPtr: () => number,
  ): PdfLinkTarget | undefined {
    const destinationPtr = getDestinationPtr();
    if (destinationPtr) {
      const destination = this.readPdfDestination(docPtr, destinationPtr);

      return {
        type: 'destination',
        destination,
      };
    } else {
      const actionPtr = getActionPtr();
      if (actionPtr) {
        const action = this.readPdfAction(docPtr, actionPtr);

        return {
          type: 'action',
          action,
        };
      }
    }
  }

  private createLocalDestPtr(docPtr: number, dest: PdfDestinationObject): number {
    // Load page for local destinations.
    const pagePtr = this.pdfiumModule.FPDF_LoadPage(docPtr, dest.pageIndex);
    if (!pagePtr) return 0;

    try {
      if (dest.zoom.mode === PdfZoomMode.XYZ) {
        const { x, y, zoom } = dest.zoom.params;
        // We treat provided x/y/zoom as “specified”.
        return this.pdfiumModule.EPDFDest_CreateXYZ(
          pagePtr,
          /*has_left*/ true,
          x,
          /*has_top*/ true,
          y,
          /*has_zoom*/ true,
          zoom,
        );
      }

      // Map non-XYZ “view modes” to PDFDEST_VIEW_* and params.
      let viewEnum: PdfZoomMode;
      let params: number[] = [];

      switch (dest.zoom.mode) {
        case PdfZoomMode.FitPage:
          viewEnum = PdfZoomMode.FitPage; // no params
          break;
        case PdfZoomMode.FitHorizontal:
          // FitH needs top; use view[0] if provided, else 0
          viewEnum = PdfZoomMode.FitHorizontal;
          params = [dest.view?.[0] ?? 0];
          break;
        case PdfZoomMode.FitVertical:
          // FitV needs left; use view[0] if provided, else 0
          viewEnum = PdfZoomMode.FitVertical;
          params = [dest.view?.[0] ?? 0];
          break;
        case PdfZoomMode.FitRectangle:
          // FitR needs left, bottom, right, top (pad with zeros).
          {
            const v = dest.view ?? [];
            params = [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0];
            viewEnum = PdfZoomMode.FitRectangle;
          }
          break;
        case PdfZoomMode.Unknown:
        default:
          // Unknown cannot be encoded as a valid explicit destination.
          return 0;
      }

      return this.withFloatArray(params, (ptr, count) =>
        this.pdfiumModule.EPDFDest_CreateView(pagePtr, viewEnum, ptr, count),
      );
    } finally {
      this.pdfiumModule.FPDF_ClosePage(pagePtr);
    }
  }

  private applyBookmarkTarget(docPtr: number, bmPtr: number, target: PdfLinkTarget): boolean {
    if (target.type === 'destination') {
      const destPtr = this.createLocalDestPtr(docPtr, target.destination);
      if (!destPtr) return false;
      const ok = this.pdfiumModule.EPDFBookmark_SetDest(docPtr, bmPtr, destPtr);
      return !!ok;
    }

    // target.type === 'action'
    const action = target.action;
    switch (action.type) {
      case PdfActionType.Goto: {
        const destPtr = this.createLocalDestPtr(docPtr, action.destination);
        if (!destPtr) return false;
        const actPtr = this.pdfiumModule.EPDFAction_CreateGoTo(docPtr, destPtr);
        if (!actPtr) return false;
        return !!this.pdfiumModule.EPDFBookmark_SetAction(docPtr, bmPtr, actPtr);
      }

      case PdfActionType.URI: {
        const actPtr = this.pdfiumModule.EPDFAction_CreateURI(docPtr, action.uri);
        if (!actPtr) return false;
        return !!this.pdfiumModule.EPDFBookmark_SetAction(docPtr, bmPtr, actPtr);
      }

      case PdfActionType.LaunchAppOrOpenFile: {
        const actPtr = this.withWString(action.path, (wptr) =>
          this.pdfiumModule.EPDFAction_CreateLaunch(docPtr, wptr),
        );
        if (!actPtr) return false;
        return !!this.pdfiumModule.EPDFBookmark_SetAction(docPtr, bmPtr, actPtr);
      }

      case PdfActionType.RemoteGoto:
        // We need a file path to build a GoToR action. Your Action shape
        // doesn't carry a path, so we'll reject for now.
        return false;

      case PdfActionType.Unsupported:
      default:
        return false;
    }
  }

  /**
   * Apply a link target (action or destination) to a link annotation
   * @param docPtr - pointer to pdf document
   * @param annotationPtr - pointer to the link annotation
   * @param target - the link target to apply
   * @returns true if successful
   *
   * @private
   */
  private applyLinkTarget(docPtr: number, annotationPtr: number, target: PdfLinkTarget): boolean {
    if (target.type === 'destination') {
      const destPtr = this.createLocalDestPtr(docPtr, target.destination);
      if (!destPtr) return false;
      const actPtr = this.pdfiumModule.EPDFAction_CreateGoTo(docPtr, destPtr);
      if (!actPtr) return false;
      return !!this.pdfiumModule.EPDFAnnot_SetAction(annotationPtr, actPtr);
    }

    // target.type === 'action'
    const action = target.action;
    switch (action.type) {
      case PdfActionType.Goto: {
        const destPtr = this.createLocalDestPtr(docPtr, action.destination);
        if (!destPtr) return false;
        const actPtr = this.pdfiumModule.EPDFAction_CreateGoTo(docPtr, destPtr);
        if (!actPtr) return false;
        return !!this.pdfiumModule.EPDFAnnot_SetAction(annotationPtr, actPtr);
      }

      case PdfActionType.URI: {
        const actPtr = this.pdfiumModule.EPDFAction_CreateURI(docPtr, action.uri);
        if (!actPtr) return false;
        return !!this.pdfiumModule.EPDFAnnot_SetAction(annotationPtr, actPtr);
      }

      case PdfActionType.LaunchAppOrOpenFile: {
        const actPtr = this.withWString(action.path, (wptr) =>
          this.pdfiumModule.EPDFAction_CreateLaunch(docPtr, wptr),
        );
        if (!actPtr) return false;
        return !!this.pdfiumModule.EPDFAnnot_SetAction(annotationPtr, actPtr);
      }

      case PdfActionType.RemoteGoto:
      case PdfActionType.Unsupported:
      default:
        return false;
    }
  }

  /**
   * Read pdf action from pdf document
   * @param docPtr - pointer to pdf document object
   * @param actionPtr - pointer to pdf action object
   * @returns pdf action object
   *
   * @private
   */
  private readPdfAction(docPtr: number, actionPtr: number): PdfActionObject {
    const actionType = this.pdfiumModule.FPDFAction_GetType(actionPtr) as PdfActionType;
    let action: PdfActionObject;
    switch (actionType) {
      case PdfActionType.Unsupported:
        action = {
          type: PdfActionType.Unsupported,
        };
        break;
      case PdfActionType.Goto:
        {
          const destinationPtr = this.pdfiumModule.FPDFAction_GetDest(docPtr, actionPtr);
          if (destinationPtr) {
            const destination = this.readPdfDestination(docPtr, destinationPtr);

            action = {
              type: PdfActionType.Goto,
              destination,
            };
          } else {
            action = {
              type: PdfActionType.Unsupported,
            };
          }
        }
        break;
      case PdfActionType.RemoteGoto:
        {
          // In case of remote goto action,
          // the application should first use FPDFAction_GetFilePath
          // to get file path, then load that particular document,
          // and use its document handle to call this
          action = {
            type: PdfActionType.Unsupported,
          };
        }
        break;
      case PdfActionType.URI:
        {
          const uri = readString(
            this.pdfiumModule.pdfium,
            (buffer, bufferLength) => {
              return this.pdfiumModule.FPDFAction_GetURIPath(
                docPtr,
                actionPtr,
                buffer,
                bufferLength,
              );
            },
            this.pdfiumModule.pdfium.UTF8ToString,
          );

          action = {
            type: PdfActionType.URI,
            uri,
          };
        }
        break;
      case PdfActionType.LaunchAppOrOpenFile:
        {
          const path = readString(
            this.pdfiumModule.pdfium,
            (buffer, bufferLength) => {
              return this.pdfiumModule.FPDFAction_GetFilePath(actionPtr, buffer, bufferLength);
            },
            this.pdfiumModule.pdfium.UTF8ToString,
          );
          action = {
            type: PdfActionType.LaunchAppOrOpenFile,
            path,
          };
        }
        break;
    }

    return action;
  }

  /**
   * Read pdf destination object
   * @param docPtr - pointer to pdf document object
   * @param destinationPtr - pointer to pdf destination
   * @returns pdf destination object
   *
   * @private
   */
  private readPdfDestination(docPtr: number, destinationPtr: number): PdfDestinationObject {
    const pageIndex = this.pdfiumModule.FPDFDest_GetDestPageIndex(docPtr, destinationPtr);
    // Every params is a float value
    const maxParmamsCount = 4;
    const paramsCountPtr = this.memoryManager.malloc(maxParmamsCount);
    const paramsPtr = this.memoryManager.malloc(maxParmamsCount * 4);
    const zoomMode = this.pdfiumModule.FPDFDest_GetView(
      destinationPtr,
      paramsCountPtr,
      paramsPtr,
    ) as PdfZoomMode;
    const paramsCount = this.pdfiumModule.pdfium.getValue(paramsCountPtr, 'i32');
    const view: number[] = [];
    for (let i = 0; i < paramsCount; i++) {
      const paramPtr = paramsPtr + i * 4;
      view.push(this.pdfiumModule.pdfium.getValue(paramPtr, 'float'));
    }
    this.memoryManager.free(paramsCountPtr);
    this.memoryManager.free(paramsPtr);

    if (zoomMode === PdfZoomMode.XYZ) {
      const hasXPtr = this.memoryManager.malloc(1);
      const hasYPtr = this.memoryManager.malloc(1);
      const hasZPtr = this.memoryManager.malloc(1);
      const xPtr = this.memoryManager.malloc(4);
      const yPtr = this.memoryManager.malloc(4);
      const zPtr = this.memoryManager.malloc(4);

      const isSucceed = this.pdfiumModule.FPDFDest_GetLocationInPage(
        destinationPtr,
        hasXPtr,
        hasYPtr,
        hasZPtr,
        xPtr,
        yPtr,
        zPtr,
      );
      if (isSucceed) {
        const hasX = this.pdfiumModule.pdfium.getValue(hasXPtr, 'i8');
        const hasY = this.pdfiumModule.pdfium.getValue(hasYPtr, 'i8');
        const hasZ = this.pdfiumModule.pdfium.getValue(hasZPtr, 'i8');

        const x = hasX ? this.pdfiumModule.pdfium.getValue(xPtr, 'float') : 0;
        const y = hasY ? this.pdfiumModule.pdfium.getValue(yPtr, 'float') : 0;
        const zoom = hasZ ? this.pdfiumModule.pdfium.getValue(zPtr, 'float') : 0;

        this.memoryManager.free(hasXPtr);
        this.memoryManager.free(hasYPtr);
        this.memoryManager.free(hasZPtr);
        this.memoryManager.free(xPtr);
        this.memoryManager.free(yPtr);
        this.memoryManager.free(zPtr);

        return {
          pageIndex,
          zoom: {
            mode: zoomMode,
            params: {
              x,
              y,
              zoom,
            },
          },
          view,
        };
      }

      this.memoryManager.free(hasXPtr);
      this.memoryManager.free(hasYPtr);
      this.memoryManager.free(hasZPtr);
      this.memoryManager.free(xPtr);
      this.memoryManager.free(yPtr);
      this.memoryManager.free(zPtr);

      return {
        pageIndex,
        zoom: {
          mode: zoomMode,
          params: {
            x: 0,
            y: 0,
            zoom: 0,
          },
        },
        view,
      };
    }

    return {
      pageIndex,
      zoom: {
        mode: zoomMode,
      },
      view,
    };
  }

  /**
   * Read attachmet from pdf document
   * @param docPtr - pointer to pdf document object
   * @param index - index of attachment
   * @returns attachment content
   *
   * @private
   */
  private readPdfAttachment(docPtr: number, index: number): PdfAttachmentObject {
    const attachmentPtr = this.pdfiumModule.FPDFDoc_GetAttachment(docPtr, index);
    const name = readString(
      this.pdfiumModule.pdfium,
      (buffer, bufferLength) => {
        return this.pdfiumModule.FPDFAttachment_GetName(attachmentPtr, buffer, bufferLength);
      },
      this.pdfiumModule.pdfium.UTF16ToString,
    );
    const description = readString(
      this.pdfiumModule.pdfium,
      (buffer, bufferLength) => {
        return this.pdfiumModule.EPDFAttachment_GetDescription(attachmentPtr, buffer, bufferLength);
      },
      this.pdfiumModule.pdfium.UTF16ToString,
    );
    const mimeType = readString(
      this.pdfiumModule.pdfium,
      (buffer, bufferLength) => {
        return this.pdfiumModule.FPDFAttachment_GetSubtype(attachmentPtr, buffer, bufferLength);
      },
      this.pdfiumModule.pdfium.UTF16ToString,
    );
    const creationDate = this.getAttachmentDate(attachmentPtr, 'CreationDate');
    const checksum = readString(
      this.pdfiumModule.pdfium,
      (buffer, bufferLength) => {
        return this.pdfiumModule.FPDFAttachment_GetStringValue(
          attachmentPtr,
          'Checksum',
          buffer,
          bufferLength,
        );
      },
      this.pdfiumModule.pdfium.UTF16ToString,
    );
    const size = this.getAttachmentNumber(attachmentPtr, 'Size');

    return {
      index,
      name,
      description,
      mimeType,
      size,
      creationDate,
      checksum,
    };
  }

  /**
   * Convert coordinate of point from device coordinate to page coordinate
   * @param doc - pdf document object
   * @param page  - pdf page infor
   * @param position - position of point
   * @returns converted position
   *
   * @private
   */
  private convertDevicePointToPagePoint(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    position: Position,
  ): Position {
    const DW = page.size.width;
    const DH = page.size.height;
    // When normalizeRotation is enabled, PDFium treats pages as 0° rotation,
    // so we must also use 0° for coordinate transformations
    const r = doc.normalizedRotation ? 0 : page.rotation & 3;

    if (r === 0) {
      // 0°
      return { x: position.x, y: DH - position.y };
    }
    if (r === 1) {
      // 90° CW
      // x_d = sx*y, y_d = sy*x  =>  x = y_d/sy, y = x_d/sx
      return { x: position.y, y: position.x };
    }
    if (r === 2) {
      // 180°
      return { x: DW - position.x, y: position.y };
    }
    {
      // 270° CW
      // x_d = DW - sx*y, y_d = DH - sy*x
      return { x: DH - position.y, y: DW - position.x };
    }
  }

  /**
   * Convert coordinate of point from page coordinate to device coordinate
   * @param doc - pdf document object
   * @param page  - pdf page infor
   * @param position - position of point
   * @returns converted position
   *
   * @private
   */
  private convertPagePointToDevicePoint(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    position: Position,
  ): Position {
    const DW = page.size.width;
    const DH = page.size.height;
    // When normalizeRotation is enabled, PDFium treats pages as 0° rotation,
    // so we must also use 0° for coordinate transformations
    const r = doc.normalizedRotation ? 0 : page.rotation & 3;

    if (r === 0) {
      // 0°
      return { x: position.x, y: DH - position.y };
    }
    if (r === 1) {
      // 90° CW
      return { x: position.y, y: position.x };
    }
    if (r === 2) {
      // 180°
      return { x: DW - position.x, y: position.y };
    }
    {
      // 270° CW
      return { x: DW - position.y, y: DH - position.x };
    }
  }

  /**
   * Convert coordinate of rectangle from page coordinate to device coordinate
   * @param doc - pdf document object
   * @param page  - pdf page infor
   * @param pagePtr - pointer to pdf page object
   * @param pageRect - rectangle that needs to be converted
   * @returns converted rectangle
   *
   * @private
   */
  private convertPageRectToDeviceRect(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    pageRect: {
      left: number;
      top: number;
      right: number;
      bottom: number;
    },
  ): Rect {
    const { x, y } = this.convertPagePointToDevicePoint(doc, page, {
      x: pageRect.left,
      y: pageRect.top,
    });
    const rect = {
      origin: {
        x,
        y,
      },
      size: {
        width: Math.abs(pageRect.right - pageRect.left),
        height: Math.abs(pageRect.top - pageRect.bottom),
      },
    };

    return rect;
  }

  /**
   * Read the appearance stream of annotation
   * @param annotationPtr - pointer to pdf annotation
   * @param mode - appearance mode
   * @returns appearance stream
   *
   * @private
   */
  private readPageAnnoAppearanceStreams(annotationPtr: number) {
    return {
      normal: this.readPageAnnoAppearanceStream(annotationPtr, AppearanceMode.Normal),
      rollover: this.readPageAnnoAppearanceStream(annotationPtr, AppearanceMode.Rollover),
      down: this.readPageAnnoAppearanceStream(annotationPtr, AppearanceMode.Down),
    };
  }

  /**
   * Read the appearance stream of annotation
   * @param annotationPtr - pointer to pdf annotation
   * @param mode - appearance mode
   * @returns appearance stream
   *
   * @private
   */
  private readPageAnnoAppearanceStream(annotationPtr: number, mode = AppearanceMode.Normal) {
    const utf16Length = this.pdfiumModule.FPDFAnnot_GetAP(annotationPtr, mode, 0, 0);
    const bytesCount = (utf16Length + 1) * 2; // include NIL
    const bufferPtr = this.memoryManager.malloc(bytesCount);
    this.pdfiumModule.FPDFAnnot_GetAP(annotationPtr, mode, bufferPtr, bytesCount);
    const ap = this.pdfiumModule.pdfium.UTF16ToString(bufferPtr);
    this.memoryManager.free(bufferPtr);

    return ap;
  }

  /**
   * Set the appearance stream of annotation
   * @param annotationPtr - pointer to pdf annotation
   * @param mode - appearance mode
   * @param apContent - appearance stream content (null to remove)
   * @returns whether the appearance stream was set successfully
   *
   * @private
   */
  private setPageAnnoAppearanceStream(
    annotationPtr: number,
    mode: AppearanceMode = AppearanceMode.Normal,
    apContent: string,
  ): boolean {
    // UTF-16LE buffer (+2 bytes for NUL)
    const bytes = 2 * (apContent.length + 1);
    const ptr = this.memoryManager.malloc(bytes);
    try {
      this.pdfiumModule.pdfium.stringToUTF16(apContent, ptr, bytes);
      const ok = this.pdfiumModule.FPDFAnnot_SetAP(annotationPtr, mode, ptr);
      return !!ok;
    } finally {
      this.memoryManager.free(ptr);
    }
  }

  /**
   * Set the rect of specified annotation
   * @param doc - pdf document object
   * @param page - page info that the annotation is belonged to
   * @param annotationPtr - pointer to annotation object
   * @param rect - target rectangle
   * @returns whether the rect is setted
   *
   * @private
   */
  private setPageAnnoRect(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotPtr: number,
    rect: Rect,
  ): boolean {
    // Snap device edges the same way FPDF_DeviceToPage(int,int,...) did (truncate → floor for ≥0)
    const x0d = Math.floor(rect.origin.x);
    const y0d = Math.floor(rect.origin.y);
    const x1d = Math.floor(rect.origin.x + rect.size.width);
    const y1d = Math.floor(rect.origin.y + rect.size.height);

    // Map all 4 integer corners to page space (handles any /Rotate)
    const TL = this.convertDevicePointToPagePoint(doc, page, { x: x0d, y: y0d });
    const TR = this.convertDevicePointToPagePoint(doc, page, { x: x1d, y: y0d });
    const BR = this.convertDevicePointToPagePoint(doc, page, { x: x1d, y: y1d });
    const BL = this.convertDevicePointToPagePoint(doc, page, { x: x0d, y: y1d });

    // Page-space AABB
    let left = Math.min(TL.x, TR.x, BR.x, BL.x);
    let right = Math.max(TL.x, TR.x, BR.x, BL.x);
    let bottom = Math.min(TL.y, TR.y, BR.y, BL.y);
    let top = Math.max(TL.y, TR.y, BR.y, BL.y);
    if (left > right) [left, right] = [right, left];
    if (bottom > top) [bottom, top] = [top, bottom];

    // Write FS_RECTF in memory order: L, T, R, B
    const ptr = this.memoryManager.malloc(16);
    const pdf = this.pdfiumModule.pdfium;
    pdf.setValue(ptr + 0, left, 'float'); // L
    pdf.setValue(ptr + 4, top, 'float'); // T
    pdf.setValue(ptr + 8, right, 'float'); // R
    pdf.setValue(ptr + 12, bottom, 'float'); // B

    const ok = this.pdfiumModule.FPDFAnnot_SetRect(annotPtr, ptr);
    this.memoryManager.free(ptr);
    return !!ok;
  }

  /**
   * Read the rectangle of annotation
   * @param annotationPtr - pointer to pdf annotation
   * @returns rectangle of annotation
   *
   * @private
   */
  private readPageAnnoRect(annotationPtr: number) {
    const pageRectPtr = this.memoryManager.malloc(4 * 4);
    const pageRect = {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    };
    if (this.pdfiumModule.EPDFAnnot_GetRect(annotationPtr, pageRectPtr)) {
      pageRect.left = this.pdfiumModule.pdfium.getValue(pageRectPtr, 'float');
      pageRect.top = this.pdfiumModule.pdfium.getValue(pageRectPtr + 4, 'float');
      pageRect.right = this.pdfiumModule.pdfium.getValue(pageRectPtr + 8, 'float');
      pageRect.bottom = this.pdfiumModule.pdfium.getValue(pageRectPtr + 12, 'float');
    }
    this.memoryManager.free(pageRectPtr);

    return pageRect;
  }

  /**
   * Get highlight rects for a specific character range (for search highlighting)
   * @param doc - pdf document object
   * @param page - pdf page info
   * @param pagePtr - pointer to pdf page
   * @param textPagePtr - pointer to pdf text page
   * @param startIndex - starting character index
   * @param charCount - number of characters in the range
   * @returns array of rectangles for highlighting the specified character range
   *
   * @private
   */
  private getHighlightRects(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    textPagePtr: number,
    startIndex: number,
    charCount: number,
  ): Rect[] {
    const rectsCount = this.pdfiumModule.FPDFText_CountRects(textPagePtr, startIndex, charCount);
    const highlightRects: Rect[] = [];

    // scratch doubles for the page-space rect
    const l = this.memoryManager.malloc(8);
    const t = this.memoryManager.malloc(8);
    const r = this.memoryManager.malloc(8);
    const b = this.memoryManager.malloc(8);

    for (let i = 0; i < rectsCount; i++) {
      const ok = this.pdfiumModule.FPDFText_GetRect(textPagePtr, i, l, t, r, b);
      if (!ok) continue;

      const left = this.pdfiumModule.pdfium.getValue(l, 'double');
      const top = this.pdfiumModule.pdfium.getValue(t, 'double');
      const right = this.pdfiumModule.pdfium.getValue(r, 'double');
      const bottom = this.pdfiumModule.pdfium.getValue(b, 'double');

      // transform all four corners to device space
      const p1 = this.convertPagePointToDevicePoint(doc, page, { x: left, y: top });
      const p2 = this.convertPagePointToDevicePoint(doc, page, { x: right, y: top });
      const p3 = this.convertPagePointToDevicePoint(doc, page, { x: right, y: bottom });
      const p4 = this.convertPagePointToDevicePoint(doc, page, { x: left, y: bottom });

      const xs = [p1.x, p2.x, p3.x, p4.x];
      const ys = [p1.y, p2.y, p3.y, p4.y];

      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const width = Math.max(...xs) - x;
      const height = Math.max(...ys) - y;

      // ceil so highlights fully cover glyphs at integer pixels
      highlightRects.push({
        origin: { x, y },
        size: { width: Math.ceil(width), height: Math.ceil(height) },
      });
    }

    this.memoryManager.free(l);
    this.memoryManager.free(t);
    this.memoryManager.free(r);
    this.memoryManager.free(b);

    return highlightRects;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.searchAllPages}
   *
   * Runs inside the worker.
   * Emits per-page progress: { page, results }
   *
   * @public
   */
  searchInPage(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    keyword: string,
    flags: number,
  ): PdfTask<SearchResult[]> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'searchInPage', doc, page, keyword, flags);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `SearchInPage`, 'Begin', `${doc.id}-${page.index}`);
    // Move keyword allocation inside here
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `PreparePrintDocument`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'Document is not open',
      });
    }
    const length = 2 * (keyword.length + 1);
    const keywordPtr = this.memoryManager.malloc(length);
    this.pdfiumModule.pdfium.stringToUTF16(keyword, keywordPtr, length);

    try {
      const results = this.searchAllInPage(doc, ctx, page, keywordPtr, flags);
      return PdfTaskHelper.resolve(results);
    } finally {
      this.memoryManager.free(keywordPtr);
    }
  }

  /**
   * Get annotations for multiple pages in a single batch.
   * Emits progress per page for streaming updates.
   *
   * @param doc - PDF document
   * @param pages - Array of pages to process
   * @returns Task with results keyed by page index, with per-page progress
   *
   * @public
   */
  getAnnotationsBatch(
    doc: PdfDocumentObject,
    pages: PdfPageObject[],
  ): PdfTask<Record<number, PdfAnnotationObject[]>, BatchProgress<PdfAnnotationObject[]>> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getAnnotationsBatch', doc.id, pages.length);

    const task = new Task<
      Record<number, PdfAnnotationObject[]>,
      PdfErrorReason,
      BatchProgress<PdfAnnotationObject[]>
    >();

    // Defer work to next microtask so caller can set up onProgress listener
    queueMicrotask(() => {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'GetAnnotationsBatch', 'Begin', doc.id);

      const ctx = this.cache.getContext(doc.id);
      if (!ctx) {
        task.reject({ code: PdfErrorCode.DocNotOpen, message: 'Document is not open' });
        return;
      }

      const results: Record<number, PdfAnnotationObject[]> = {};
      const total = pages.length;

      // Process all pages in a tight loop - no queue overhead!
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const annotations = this.readPageAnnotationsRaw(doc, ctx, page);
        results[page.index] = annotations;

        // Stream progress per page
        task.progress({
          pageIndex: page.index,
          result: annotations,
          completed: i + 1,
          total,
        });
      }

      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'GetAnnotationsBatch', 'End', doc.id);
      task.resolve(results);
    });

    return task;
  }

  /**
   * Search across multiple pages in a single batch.
   * Emits progress per page for streaming updates.
   *
   * @param doc - PDF document
   * @param pages - Array of pages to search
   * @param keyword - Search keyword
   * @param flags - Search flags
   * @returns Task with results keyed by page index, with per-page progress
   *
   * @public
   */
  searchBatch(
    doc: PdfDocumentObject,
    pages: PdfPageObject[],
    keyword: string,
    flags: number,
  ): PdfTask<Record<number, SearchResult[]>, BatchProgress<SearchResult[]>> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'searchBatch', doc.id, pages.length, keyword);

    const task = new Task<
      Record<number, SearchResult[]>,
      PdfErrorReason,
      BatchProgress<SearchResult[]>
    >();

    // Defer work to next microtask so caller can set up onProgress listener
    queueMicrotask(() => {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'SearchBatch', 'Begin', doc.id);

      const ctx = this.cache.getContext(doc.id);
      if (!ctx) {
        task.reject({ code: PdfErrorCode.DocNotOpen, message: 'Document is not open' });
        return;
      }

      // Allocate keyword pointer once for all pages
      const length = 2 * (keyword.length + 1);
      const keywordPtr = this.memoryManager.malloc(length);
      this.pdfiumModule.pdfium.stringToUTF16(keyword, keywordPtr, length);

      try {
        const results: Record<number, SearchResult[]> = {};
        const total = pages.length;

        // Process all pages in a tight loop - no queue overhead!
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          const pageResults = this.searchAllInPage(doc, ctx, page, keywordPtr, flags);
          results[page.index] = pageResults;

          // Stream progress per page
          task.progress({
            pageIndex: page.index,
            result: pageResults,
            completed: i + 1,
            total,
          });
        }

        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'SearchBatch', 'End', doc.id);
        task.resolve(results);
      } finally {
        this.memoryManager.free(keywordPtr);
      }
    });

    return task;
  }

  /**
   * Extract word-aligned context for a search hit.
   *
   * @param fullText      full UTF-16 page text (fetch this once per page!)
   * @param start         index of 1st char that matched
   * @param count         number of chars in the match
   * @param windowChars   minimum context chars to keep left & right
   */
  private buildContext(
    fullText: string,
    start: number,
    count: number,
    windowChars = 30,
  ): TextContext {
    const WORD_BREAK = /[\s\u00A0.,;:!?()\[\]{}<>/\\\-"'`"”\u2013\u2014]/;

    // Find the start of a word moving left
    const findWordStart = (index: number): number => {
      while (index > 0 && !WORD_BREAK.test(fullText[index - 1])) index--;
      return index;
    };

    // Find the end of a word moving right
    const findWordEnd = (index: number): number => {
      while (index < fullText.length && !WORD_BREAK.test(fullText[index])) index++;
      return index;
    };

    // Move left to build context
    let left = start;
    while (left > 0 && WORD_BREAK.test(fullText[left - 1])) left--; // Skip blanks
    let collected = 0;
    while (left > 0 && collected < windowChars) {
      left--;
      if (!WORD_BREAK.test(fullText[left])) collected++;
    }
    left = findWordStart(left);

    // Move right to build context
    let right = start + count;
    while (right < fullText.length && WORD_BREAK.test(fullText[right])) right++; // Skip blanks
    collected = 0;
    while (right < fullText.length && collected < windowChars) {
      if (!WORD_BREAK.test(fullText[right])) collected++;
      right++;
    }
    right = findWordEnd(right);

    // Compose the context
    const before = fullText.slice(left, start).replace(/\s+/g, ' ').trimStart();
    const match = fullText.slice(start, start + count);
    const after = fullText
      .slice(start + count, right)
      .replace(/\s+/g, ' ')
      .trimEnd();

    return {
      before: this.tidy(before),
      match: this.tidy(match),
      after: this.tidy(after),
      truncatedLeft: left > 0,
      truncatedRight: right < fullText.length,
    };
  }

  /**
   * Tidy the text to remove any non-printable characters and whitespace
   * @param s - text to tidy
   * @returns tidied text
   *
   * @private
   */
  private tidy(s: string): string {
    return (
      s
        /* 1️⃣  join words split by hyphen + U+FFFE + whitespace */
        .replace(/-\uFFFE\s*/g, '')

        /* 2️⃣  drop any remaining U+FFFE, soft-hyphen, zero-width chars */
        .replace(/[\uFFFE\u00AD\u200B\u2060\uFEFF]/g, '')

        /* 3️⃣  collapse whitespace so we stay on one line */
        .replace(/\s+/g, ' ')
    );
  }

  /**
   * Search for all occurrences of a keyword on a single page
   * This method efficiently loads the page only once and finds all matches
   *
   * @param docPtr - pointer to pdf document
   * @param page - pdf page object
   * @param pageIndex - index of the page
   * @param keywordPtr - pointer to the search keyword
   * @param flag - search flags
   * @returns array of search results on this page
   *
   * @private
   */
  private searchAllInPage(
    doc: PdfDocumentObject,
    ctx: DocumentContext,
    page: PdfPageObject,
    keywordPtr: number,
    flag: number,
  ): SearchResult[] {
    return ctx.borrowPage(page.index, (pageCtx) => {
      const textPagePtr = pageCtx.getTextPage();

      // Load the full text of the page once
      const total = this.pdfiumModule.FPDFText_CountChars(textPagePtr);
      const bufPtr = this.memoryManager.malloc(2 * (total + 1));
      this.pdfiumModule.FPDFText_GetText(textPagePtr, 0, total, bufPtr);
      const fullText = this.pdfiumModule.pdfium.UTF16ToString(bufPtr);
      this.memoryManager.free(bufPtr);

      const pageResults: SearchResult[] = [];

      // Initialize search handle once for the page
      const searchHandle = this.pdfiumModule.FPDFText_FindStart(
        textPagePtr,
        keywordPtr,
        flag,
        0, // Start from the beginning of the page
      );

      // Call FindNext repeatedly to get all matches on the page
      while (this.pdfiumModule.FPDFText_FindNext(searchHandle)) {
        const charIndex = this.pdfiumModule.FPDFText_GetSchResultIndex(searchHandle);
        const charCount = this.pdfiumModule.FPDFText_GetSchCount(searchHandle);

        const rects = this.getHighlightRects(doc, page, textPagePtr, charIndex, charCount);

        const context = this.buildContext(fullText, charIndex, charCount);

        pageResults.push({
          pageIndex: page.index,
          charIndex,
          charCount,
          rects,
          context,
        });
      }

      // Close the search handle only once after finding all results
      this.pdfiumModule.FPDFText_FindClose(searchHandle);
      return pageResults;
    });
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.preparePrintDocument}
   *
   * Prepares a PDF document for printing with specified options.
   * Creates a new document with selected pages and optionally removes annotations
   * for optimal printing performance.
   *
   * @public
   */
  preparePrintDocument(doc: PdfDocumentObject, options?: PdfPrintOptions): PdfTask<ArrayBuffer> {
    const { includeAnnotations = true, pageRange = null } = options ?? {};

    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'preparePrintDocument', doc, options);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `PreparePrintDocument`, 'Begin', doc.id);

    // Verify document is open
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `PreparePrintDocument`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'Document is not open',
      });
    }

    // Create new document for printing
    const printDocPtr = this.pdfiumModule.FPDF_CreateNewDocument();
    if (!printDocPtr) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `PreparePrintDocument`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantCreateNewDoc,
        message: 'Cannot create print document',
      });
    }

    try {
      // Validate and sanitize page range
      const sanitizedPageRange = this.sanitizePageRange(pageRange, doc.pageCount);

      // Import pages from source document
      // pageRange null means import all pages
      if (
        !this.pdfiumModule.FPDF_ImportPages(
          printDocPtr,
          ctx.docPtr,
          sanitizedPageRange ?? '',
          0, // Insert at beginning
        )
      ) {
        this.pdfiumModule.FPDF_CloseDocument(printDocPtr);
        this.logger.error(LOG_SOURCE, LOG_CATEGORY, 'Failed to import pages for printing');
        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `PreparePrintDocument`, 'End', doc.id);

        return PdfTaskHelper.reject({
          code: PdfErrorCode.CantImportPages,
          message: 'Failed to import pages for printing',
        });
      }

      // Remove annotations if requested
      if (!includeAnnotations) {
        const removalResult = this.removeAnnotationsFromPrintDocument(printDocPtr);

        if (!removalResult.success) {
          this.pdfiumModule.FPDF_CloseDocument(printDocPtr);
          this.logger.error(
            LOG_SOURCE,
            LOG_CATEGORY,
            `Failed to remove annotations: ${removalResult.error}`,
          );
          this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `PreparePrintDocument`, 'End', doc.id);

          return PdfTaskHelper.reject({
            code: PdfErrorCode.Unknown,
            message: `Failed to prepare print document: ${removalResult.error}`,
          });
        }

        this.logger.debug(
          LOG_SOURCE,
          LOG_CATEGORY,
          `Removed ${removalResult.annotationsRemoved} annotations from ${removalResult.pagesProcessed} pages`,
        );
      }

      // Save the prepared document to buffer
      const buffer = this.saveDocument(printDocPtr);

      // Clean up
      this.pdfiumModule.FPDF_CloseDocument(printDocPtr);

      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `PreparePrintDocument`, 'End', doc.id);
      return PdfTaskHelper.resolve(buffer);
    } catch (error) {
      // Ensure cleanup on any error
      if (printDocPtr) {
        this.pdfiumModule.FPDF_CloseDocument(printDocPtr);
      }

      this.logger.error(LOG_SOURCE, LOG_CATEGORY, 'preparePrintDocument failed', error);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `PreparePrintDocument`, 'End', doc.id);

      return PdfTaskHelper.reject({
        code: PdfErrorCode.Unknown,
        message: error instanceof Error ? error.message : 'Failed to prepare print document',
      });
    }
  }

  /**
   * Removes all annotations from a print document using fast raw annotation functions.
   * This method is optimized for performance by avoiding full page loading.
   *
   * @param printDocPtr - Pointer to the print document
   * @returns Result object with success status and statistics
   *
   * @private
   */
  private removeAnnotationsFromPrintDocument(printDocPtr: number): {
    success: boolean;
    annotationsRemoved: number;
    pagesProcessed: number;
    error?: string;
  } {
    let totalAnnotationsRemoved = 0;
    let pagesProcessed = 0;

    try {
      const pageCount = this.pdfiumModule.FPDF_GetPageCount(printDocPtr);

      // Process each page
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        // Get annotation count using the fast raw function
        const annotCount = this.pdfiumModule.EPDFPage_GetAnnotCountRaw(printDocPtr, pageIndex);

        if (annotCount <= 0) {
          pagesProcessed++;
          continue;
        }

        // Remove annotations in reverse order to maintain indices
        // This is important because removing an annotation shifts the indices of subsequent ones
        let annotationsRemovedFromPage = 0;

        for (let annotIndex = annotCount - 1; annotIndex >= 0; annotIndex--) {
          // Use the fast raw removal function
          const removed = this.pdfiumModule.EPDFPage_RemoveAnnotRaw(
            printDocPtr,
            pageIndex,
            annotIndex,
          );

          if (removed) {
            annotationsRemovedFromPage++;
            totalAnnotationsRemoved++;
          } else {
            this.logger.warn(
              LOG_SOURCE,
              LOG_CATEGORY,
              `Failed to remove annotation ${annotIndex} from page ${pageIndex}`,
            );
          }
        }

        // Generate content for the page if annotations were removed
        if (annotationsRemovedFromPage > 0) {
          // We need to regenerate the page content after removing annotations
          const pagePtr = this.pdfiumModule.FPDF_LoadPage(printDocPtr, pageIndex);
          if (pagePtr) {
            this.pdfiumModule.FPDFPage_GenerateContent(pagePtr);
            this.pdfiumModule.FPDF_ClosePage(pagePtr);
          }
        }

        pagesProcessed++;
      }

      return {
        success: true,
        annotationsRemoved: totalAnnotationsRemoved,
        pagesProcessed: pagesProcessed,
      };
    } catch (error) {
      return {
        success: false,
        annotationsRemoved: totalAnnotationsRemoved,
        pagesProcessed: pagesProcessed,
        error: error instanceof Error ? error.message : 'Unknown error during annotation removal',
      };
    }
  }

  /**
   * Sanitizes and validates a page range string.
   * Ensures page numbers are within valid bounds and properly formatted.
   *
   * @param pageRange - Page range string (e.g., "1,3,5-7") or null for all pages
   * @param totalPages - Total number of pages in the document
   * @returns Sanitized page range string or null for all pages
   *
   * @private
   */
  private sanitizePageRange(
    pageRange: string | null | undefined,
    totalPages: number,
  ): string | null {
    // Null or empty means all pages
    if (!pageRange || pageRange.trim() === '') {
      return null;
    }

    try {
      const sanitized: number[] = [];
      const parts = pageRange.split(',');

      for (const part of parts) {
        const trimmed = part.trim();

        if (trimmed.includes('-')) {
          // Handle range (e.g., "5-7")
          const [startStr, endStr] = trimmed.split('-').map((s) => s.trim());
          const start = parseInt(startStr, 10);
          const end = parseInt(endStr, 10);

          if (isNaN(start) || isNaN(end)) {
            this.logger.warn(LOG_SOURCE, LOG_CATEGORY, `Invalid range: ${trimmed}`);
            continue;
          }

          // Clamp to valid bounds (1-based page numbers)
          const validStart = Math.max(1, Math.min(start, totalPages));
          const validEnd = Math.max(1, Math.min(end, totalPages));

          // Add all pages in range
          for (let i = validStart; i <= validEnd; i++) {
            if (!sanitized.includes(i)) {
              sanitized.push(i);
            }
          }
        } else {
          // Handle single page number
          const pageNum = parseInt(trimmed, 10);

          if (isNaN(pageNum)) {
            this.logger.warn(LOG_SOURCE, LOG_CATEGORY, `Invalid page number: ${trimmed}`);
            continue;
          }

          // Clamp to valid bounds
          const validPageNum = Math.max(1, Math.min(pageNum, totalPages));

          if (!sanitized.includes(validPageNum)) {
            sanitized.push(validPageNum);
          }
        }
      }

      // If no valid pages found, return null (all pages)
      if (sanitized.length === 0) {
        this.logger.warn(LOG_SOURCE, LOG_CATEGORY, 'No valid pages in range, using all pages');
        return null;
      }

      // Sort and convert back to range string
      sanitized.sort((a, b) => a - b);

      // Optimize consecutive pages into ranges
      const optimized: string[] = [];
      let rangeStart = sanitized[0];
      let rangeEnd = sanitized[0];

      for (let i = 1; i < sanitized.length; i++) {
        if (sanitized[i] === rangeEnd + 1) {
          rangeEnd = sanitized[i];
        } else {
          // End current range
          if (rangeStart === rangeEnd) {
            optimized.push(rangeStart.toString());
          } else if (rangeEnd - rangeStart === 1) {
            optimized.push(rangeStart.toString());
            optimized.push(rangeEnd.toString());
          } else {
            optimized.push(`${rangeStart}-${rangeEnd}`);
          }

          // Start new range
          rangeStart = sanitized[i];
          rangeEnd = sanitized[i];
        }
      }

      // Add final range
      if (rangeStart === rangeEnd) {
        optimized.push(rangeStart.toString());
      } else if (rangeEnd - rangeStart === 1) {
        optimized.push(rangeStart.toString());
        optimized.push(rangeEnd.toString());
      } else {
        optimized.push(`${rangeStart}-${rangeEnd}`);
      }

      const result = optimized.join(',');

      this.logger.debug(
        LOG_SOURCE,
        LOG_CATEGORY,
        `Sanitized page range: "${pageRange}" -> "${result}"`,
      );

      return result;
    } catch (error) {
      this.logger.error(LOG_SOURCE, LOG_CATEGORY, `Error sanitizing page range: ${error}`);
      return null; // Fallback to all pages
    }
  }
}
