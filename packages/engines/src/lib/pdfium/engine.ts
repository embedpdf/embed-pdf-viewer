import {
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
  SearchTarget,
  MatchFlag,
  PdfDestinationObject,
  PdfBookmarkObject,
  PdfDocumentObject,
  PdfEngine,
  PdfPageObject,
  PdfActionType,
  Rotation,
  PDF_FORM_FIELD_FLAG,
  PDF_FORM_FIELD_TYPE,
  PdfWidgetAnnoOption,
  PdfFileAttachmentAnnoObject,
  Rect,
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
  PdfFileLoader,
  transformRect,
  SearchAllPagesResult,
  PdfOpenDocumentUrlOptions,
  PdfOpenDocumentBufferOptions,
  PdfFileUrl,
  Task,
  PdfErrorReason,
  TextContext,
  PdfGlyphObject,
  PdfPageGeometry,
  PdfRun,
  toIntRect,
  Quad,
  PdfAnnotationState,
  PdfAnnotationStateModel,
  quadToRect,
  ImageConversionTypes,
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
  ignore,
  isUuidV4,
  uuidV4,
  PdfAnnotationIcon,
  PdfPageSearchProgress,
  PdfSearchAllPagesOptions,
  PdfRenderPageAnnotationOptions,
  PdfRedactTextOptions,
  PdfFlattenPageOptions,
  PdfRenderThumbnailOptions,
  PdfRenderPageOptions,
  PdfAnnotationsProgress,
  ConvertToBlobOptions,
  buildUserToDeviceMatrix,
  PdfMetadataObject,
  PdfPrintOptions,
  PdfTrappedStatus,
  PdfStampFit,
  PdfAddAttachmentParams,
} from '@embedpdf/models';
import { isValidCustomKey, readArrayBuffer, readString } from './helper';
import { WrappedPdfiumModule } from '@embedpdf/pdfium';
import { DocumentContext, PageContext, PdfCache } from './cache';
import { ImageDataConverter, LazyImageData } from '../converters/types';
import { MemoryManager } from './core/memory-manager';
import { WasmPointer } from './types/branded';

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
 * Context used for searching
 */
export interface SearchContext {
  /**
   * search target
   */
  target: SearchTarget;
  /**
   * current page index
   */
  currPageIndex: number;
  /**
   * index of text in the current pdf page,  -1 means reach the end
   */
  startIndex: number;
}

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

interface PdfiumEngineOptions<T> {
  logger?: Logger;
  imageDataConverter?: ImageDataConverter<T>;
}

export class OffscreenCanvasError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OffscreenCanvasError';
  }
}

export const browserImageDataToBlobConverter: ImageDataConverter<Blob> = (
  getImageData: LazyImageData,
  imageType: ImageConversionTypes = 'image/webp',
  quality?: number,
): Promise<Blob> => {
  // Check if we're in a browser environment
  if (typeof OffscreenCanvas === 'undefined') {
    return Promise.reject(
      new OffscreenCanvasError(
        'OffscreenCanvas is not available in this environment. ' +
          'This converter is intended for browser use only. ' +
          'Falling back to WASM-based image encoding.',
      ),
    );
  }

  const pdfImage = getImageData();
  const imageData = new ImageData(pdfImage.data, pdfImage.width, pdfImage.height);
  const off = new OffscreenCanvas(imageData.width, imageData.height);
  off.getContext('2d')!.putImageData(imageData, 0, 0);
  return off.convertToBlob({ type: imageType, quality });
};

/**
 * Pdf engine that based on pdfium wasm
 */
export class PdfiumEngine<T = Blob> implements PdfEngine<T> {
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
   * function to convert ImageData to Blob
   */
  private readonly imageDataConverter: ImageDataConverter<T>;

  /**
   * Create an instance of PdfiumEngine
   * @param wasmModule - pdfium wasm module
   * @param logger - logger instance
   * @param imageDataToBlobConverter - function to convert ImageData to Blob
   */
  constructor(
    private pdfiumModule: WrappedPdfiumModule,
    options: PdfiumEngineOptions<T> = {},
  ) {
    const {
      logger = new NoopLogger(),
      imageDataConverter = browserImageDataToBlobConverter as ImageDataConverter<T>,
    } = options;

    this.cache = new PdfCache(this.pdfiumModule);
    this.logger = logger;
    this.imageDataConverter = imageDataConverter;
    this.memoryManager = new MemoryManager(this.pdfiumModule, this.logger);

    if (this.logger.isEnabled('debug')) {
      this.memoryLeakCheckInterval = setInterval(() => {
        this.memoryManager.checkLeaks();
      }, 10000) as unknown as number;
    }
  }
  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.initialize}
   *
   * @public
   */
  initialize() {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'initialize');
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `Initialize`, 'Begin', 'General');
    this.pdfiumModule.PDFiumExt_Init();
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `Initialize`, 'End', 'General');
    return PdfTaskHelper.resolve(true);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.destroy}
   *
   * @public
   */
  destroy() {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'destroy');
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `Destroy`, 'Begin', 'General');
    this.pdfiumModule.FPDF_DestroyLibrary();
    if (this.memoryLeakCheckInterval) {
      clearInterval(this.memoryLeakCheckInterval);
      this.memoryLeakCheckInterval = null;
    }
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `Destroy`, 'End', 'General');
    return PdfTaskHelper.resolve(true);
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
   * {@inheritDoc @embedpdf/models!PdfEngine.openDocumentUrl}
   *
   * @public
   */
  public openDocumentUrl(file: PdfFileUrl, options?: PdfOpenDocumentUrlOptions) {
    const mode = options?.mode ?? 'auto';
    const password = options?.password ?? '';

    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'openDocumentUrl called', file.url, mode);

    // We'll create a task to wrap asynchronous steps
    const task = PdfTaskHelper.create<PdfDocumentObject>();

    // Start an async procedure
    (async () => {
      try {
        const fetchFullTask = await this.fetchFullAndOpen(file, password);
        fetchFullTask.wait(
          (doc) => task.resolve(doc),
          (err) => task.reject(err.reason),
        );
      } catch (err) {
        this.logger.error(LOG_SOURCE, LOG_CATEGORY, 'openDocumentUrl error', err);
        task.reject({
          code: PdfErrorCode.Unknown,
          message: String(err),
        });
      }
    })();

    return task;
  }

  /**
   * Check if the server supports range requests:
   * Sends a HEAD request and sees if 'Accept-Ranges: bytes'.
   */
  private async checkRangeSupport(
    url: string,
  ): Promise<{ supportsRanges: boolean; fileLength: number; content: ArrayBuffer | null }> {
    try {
      this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'checkRangeSupport', url);

      // First try HEAD request
      const headResponse = await fetch(url, { method: 'HEAD' });
      const fileLength = headResponse.headers.get('Content-Length');
      const acceptRanges = headResponse.headers.get('Accept-Ranges');

      // If server explicitly supports ranges, we're done
      if (acceptRanges === 'bytes') {
        return {
          supportsRanges: true,
          fileLength: parseInt(fileLength ?? '0'),
          content: null,
        };
      }

      // Test actual range request support
      const testResponse = await fetch(url, {
        headers: { Range: 'bytes=0-1' },
      });

      // If we get 200 instead of 206, server doesn't support ranges
      // Return the full content since we'll need it anyway
      if (testResponse.status === 200) {
        const content = await testResponse.arrayBuffer();
        return {
          supportsRanges: false,
          fileLength: parseInt(fileLength ?? '0'),
          content: content,
        };
      }

      // 206 Partial Content indicates range support
      return {
        supportsRanges: testResponse.status === 206,
        fileLength: parseInt(fileLength ?? '0'),
        content: null,
      };
    } catch (e) {
      this.logger.error(LOG_SOURCE, LOG_CATEGORY, 'checkRangeSupport failed', e);
      throw new Error('Failed to check range support: ' + e);
    }
  }

  /**
   * Fully fetch the file (using fetch) into an ArrayBuffer,
   * then call openDocumentFromBuffer.
   */
  private async fetchFullAndOpen(file: PdfFileUrl, password: string) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'fetchFullAndOpen', file.url);

    // 1. fetch entire PDF as array buffer
    const response = await fetch(file.url);
    if (!response.ok) {
      throw new Error(`Could not fetch PDF: ${response.statusText}`);
    }
    const arrayBuf = await response.arrayBuffer();

    // 2. create a PdfFile object
    const pdfFile: PdfFile = {
      id: file.id,
      name: file.name,
      content: arrayBuf,
    };

    // 3. call openDocumentFromBuffer (the method you already have)
    //    that returns a PdfTask, but let's wrap it in a Promise
    return this.openDocumentBuffer(pdfFile, { password });
  }

  /**
   * Use your synchronous partial-loading approach:
   * - In your snippet, it's done via `openDocumentFromLoader`.
   * - We'll do a synchronous XHR read callback that pulls
   *   the desired byte ranges.
   */
  private async openDocumentWithRangeRequest(
    file: PdfFileUrl,
    password: string,
    knownFileLength?: number,
  ) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'openDocumentWithRangeRequest', file.url);

    // We first do a HEAD or a partial fetch to get the fileLength:
    const fileLength = knownFileLength ?? (await this.retrieveFileLength(file.url)).fileLength;

    // 2. define the callback function used by openDocumentFromLoader
    const callback = (offset: number, length: number) => {
      // Perform synchronous XHR:
      const xhr = new XMLHttpRequest();
      xhr.open('GET', file.url, false); // note: block in the Worker
      xhr.overrideMimeType('text/plain; charset=x-user-defined');
      xhr.setRequestHeader('Range', `bytes=${offset}-${offset + length - 1}`);
      xhr.send(null);

      if (xhr.status === 206 || xhr.status === 200) {
        return this.convertResponseToUint8Array(xhr.responseText);
      }
      throw new Error(`Range request failed with status ${xhr.status}`);
    };

    // 3. call `openDocumentFromLoader`
    return this.openDocumentFromLoader(
      {
        id: file.id,
        fileLength,
        callback,
      },
      password,
    );
  }

  /**
   * Helper to do a HEAD request or partial GET to find file length.
   */
  private async retrieveFileLength(url: string): Promise<{ fileLength: number }> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'retrieveFileLength', url);

    // We'll do a HEAD request to get Content-Length
    const resp = await fetch(url, { method: 'HEAD' });
    if (!resp.ok) {
      throw new Error(`Failed HEAD request for file length: ${resp.statusText}`);
    }
    const lenStr = resp.headers.get('Content-Length') || '0';
    const fileLength = parseInt(lenStr, 10) || 0;
    if (!fileLength) {
      throw new Error(`Content-Length not found or zero.`);
    }
    return { fileLength };
  }

  /**
   * Convert response text (x-user-defined) to a Uint8Array
   * for partial data.
   */
  private convertResponseToUint8Array(text: string): Uint8Array {
    const array = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      // & 0xff ensures we only get the lower 8 bits
      array[i] = text.charCodeAt(i) & 0xff;
    }
    return array;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.openDocument}
   *
   * @public
   */
  openDocumentBuffer(file: PdfFile, options?: PdfOpenDocumentBufferOptions) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'openDocumentBuffer', file, options);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `OpenDocumentBuffer`, 'Begin', file.id);
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
      const result = this.pdfiumModule.FPDF_GetPageSizeByIndexF(docPtr, index, sizePtr);
      if (!result) {
        const lastError = this.pdfiumModule.FPDF_GetLastError();
        this.logger.error(
          LOG_SOURCE,
          LOG_CATEGORY,
          `FPDF_GetPageSizeByIndexF failed with ${lastError}`,
        );
        this.memoryManager.free(sizePtr);
        this.pdfiumModule.FPDF_CloseDocument(docPtr);
        this.memoryManager.free(filePtr);
        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `OpenDocumentBuffer`, 'End', file.id);
        return PdfTaskHelper.reject<PdfDocumentObject>({
          code: lastError,
          message: `FPDF_GetPageSizeByIndexF failed`,
        });
      }

      const page = {
        index,
        size: {
          width: this.pdfiumModule.pdfium.getValue(sizePtr, 'float'),
          height: this.pdfiumModule.pdfium.getValue(sizePtr + 4, 'float'),
        },
      };

      pages.push(page);
    }
    this.memoryManager.free(sizePtr);

    const pdfDoc: PdfDocumentObject = {
      id: file.id,
      name: file.name,
      pageCount,
      pages,
    };

    this.cache.setDocument(file.id, filePtr, docPtr);

    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `OpenDocumentBuffer`, 'End', file.id);

    return PdfTaskHelper.resolve(pdfDoc);
  }

  openDocumentFromLoader(fileLoader: PdfFileLoader, password: string = '') {
    const { fileLength, callback, ...file } = fileLoader;
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'openDocumentFromLoader', file, password);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `OpenDocumentFromLoader`, 'Begin', file.id);

    const readBlock = (
      _pThis: number, // Pointer to the FPDF_FILEACCESS structure
      offset: number, // Pointer to a buffer to receive the data
      pBuf: number, // Offset position from the beginning of the file
      length: number, // Number of bytes to read
    ): number => {
      try {
        this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'readBlock', offset, length, pBuf);

        if (offset < 0 || offset >= fileLength) {
          this.logger.error(LOG_SOURCE, LOG_CATEGORY, 'Offset out of bounds:', offset);
          return 0;
        }

        // Get data chunk using the callback
        const data = callback(offset, length);

        // Copy the data to PDFium's buffer
        const dest = new Uint8Array(this.pdfiumModule.pdfium.HEAPU8.buffer, pBuf, data.length);
        dest.set(data);

        return data.length;
      } catch (error) {
        this.logger.error(LOG_SOURCE, LOG_CATEGORY, 'ReadBlock error:', error);
        return 0;
      }
    };

    const callbackPtr = this.pdfiumModule.pdfium.addFunction(readBlock, 'iiiii');

    // Create FPDF_FILEACCESS struct
    const structSize = 12;
    const fileAccessPtr = this.memoryManager.malloc(structSize);

    // Set up struct fields
    this.pdfiumModule.pdfium.setValue(fileAccessPtr, fileLength, 'i32');
    this.pdfiumModule.pdfium.setValue(fileAccessPtr + 4, callbackPtr, 'i32');
    this.pdfiumModule.pdfium.setValue(fileAccessPtr + 8, 0, 'i32');

    // Load document
    const docPtr = this.pdfiumModule.FPDF_LoadCustomDocument(fileAccessPtr, password);

    if (!docPtr) {
      const lastError = this.pdfiumModule.FPDF_GetLastError();
      this.logger.error(
        LOG_SOURCE,
        LOG_CATEGORY,
        `FPDF_LoadCustomDocument failed with ${lastError}`,
      );
      this.memoryManager.free(fileAccessPtr);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `OpenDocumentFromLoader`, 'End', file.id);

      return PdfTaskHelper.reject<PdfDocumentObject>({
        code: lastError,
        message: `FPDF_LoadCustomDocument failed`,
      });
    }

    const pageCount = this.pdfiumModule.FPDF_GetPageCount(docPtr);

    const pages: PdfPageObject[] = [];
    const sizePtr = this.memoryManager.malloc(8);
    for (let index = 0; index < pageCount; index++) {
      const result = this.pdfiumModule.FPDF_GetPageSizeByIndexF(docPtr, index, sizePtr);
      if (!result) {
        const lastError = this.pdfiumModule.FPDF_GetLastError();
        this.logger.error(
          LOG_SOURCE,
          LOG_CATEGORY,
          `FPDF_GetPageSizeByIndexF failed with ${lastError}`,
        );
        this.memoryManager.free(sizePtr);
        this.pdfiumModule.FPDF_CloseDocument(docPtr);
        this.memoryManager.free(fileAccessPtr);
        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `OpenDocumentFromLoader`, 'End', file.id);
        return PdfTaskHelper.reject<PdfDocumentObject>({
          code: lastError,
          message: `FPDF_GetPageSizeByIndexF failed`,
        });
      }

      const page = {
        index,
        size: {
          width: this.pdfiumModule.pdfium.getValue(sizePtr, 'float'),
          height: this.pdfiumModule.pdfium.getValue(sizePtr + 4, 'float'),
        },
      };

      pages.push(page);
    }
    this.memoryManager.free(sizePtr);

    const pdfDoc: PdfDocumentObject = {
      id: file.id,
      name: file.name,
      pageCount,
      pages,
    };
    this.cache.setDocument(file.id, fileAccessPtr, docPtr);

    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `OpenDocumentFromLoader`, 'End', file.id);

    return PdfTaskHelper.resolve(pdfDoc);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getMetadata}
   *
   * @public
   */
  getMetadata(doc: PdfDocumentObject): PdfTask<PdfMetadataObject, PdfErrorReason> {
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
  renderPage(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    options?: PdfRenderPageOptions,
  ): PdfTask<T> {
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
  ): PdfTask<T> {
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
   * {@inheritDoc @embedpdf/models!PdfEngine.getAllAnnotations}
   *
   * @public
   */
  getAllAnnotations(
    doc: PdfDocumentObject,
  ): PdfTask<Record<number, PdfAnnotationObject[]>, PdfAnnotationsProgress> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getAllAnnotations-with-progress', doc);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'GetAllAnnotations', 'Begin', doc.id);

    /* 1 ── create an async task wrapper ─────────────────────────────── */
    const task = PdfTaskHelper.create<
      Record<number, PdfAnnotationObject[]>,
      PdfAnnotationsProgress
    >();

    let cancelled = false;
    task.wait(ignore, (err) => {
      if (err.type === 'abort') cancelled = true;
    });

    /* 2 ── sanity-check: document must be open ──────────────────────── */
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'GetAllAnnotations', 'End', doc.id);
      task.reject({ code: PdfErrorCode.DocNotOpen, message: 'document does not open' });
      return task;
    }

    /* 3 ── chunked walk so we yield less often, but still breathe ───── */
    const CHUNK_SIZE = 100; // ← tweak here
    const out: Record<number, PdfAnnotationObject[]> = {};

    const processChunk = (startIdx: number): void => {
      if (cancelled) return;

      const endIdx = Math.min(startIdx + CHUNK_SIZE, doc.pageCount);
      for (let pageIdx = startIdx; pageIdx < endIdx && !cancelled; ++pageIdx) {
        this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'GetAllAnnotations', 'Begin', doc.id, pageIdx);

        /* read this page’s annotations */
        const annots = this.readPageAnnotationsRaw(ctx, doc.pages[pageIdx]);
        out[pageIdx] = annots;

        this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'GetAllAnnotations', 'End', doc.id, pageIdx);
        task.progress({ page: pageIdx, annotations: annots });
      }

      /* all done? */
      if (cancelled) return;
      if (endIdx >= doc.pageCount) {
        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'GetAllAnnotations', 'End', doc.id);
        task.resolve(out);
        return;
      }

      /* let the browser breathe, then continue with next chunk */
      setTimeout(() => processChunk(endIdx), 0);
    };

    /* kick-off */
    processChunk(0);
    return task;
  }

  private readAllAnnotations(
    doc: PdfDocumentObject,
    ctx: DocumentContext,
  ): Record<number, PdfAnnotationObject[]> {
    const annotationsByPage: Record<number, PdfAnnotationObject[]> = {};

    for (let i = 0; i < doc.pageCount; i++) {
      const pageAnnotations = this.readPageAnnotations(ctx, doc.pages[i]);
      annotationsByPage[i] = pageAnnotations;
    }

    return annotationsByPage;
  }

  getPageAnnoWidgets(
    doc: PdfDocumentObject,
    page: PdfPageObject,
  ): PdfTask<PdfWidgetAnnoObject[], PdfErrorReason> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getPageAnnoWidgets', doc, page);
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `GetPageAnnoWidgets`,
      'Begin',
      `${doc.id}-${page.index}`,
    );

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        `GetPageAnnoWidgets`,
        'End',
        `${doc.id}-${page.index}`,
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const annotationWidgets = this.readPageAnnoWidgets(ctx, page);

    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `GetPageAnnoWidgets`,
      'End',
      `${doc.id}-${page.index}`,
    );

    this.logger.debug(
      LOG_SOURCE,
      LOG_CATEGORY,
      `GetPageAnnoWidgets`,
      `${doc.id}-${page.index}`,
      annotationWidgets,
    );

    return PdfTaskHelper.resolve(annotationWidgets);
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

    const annotations = this.readPageAnnotations(ctx, page);

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

    if (!this.setPageAnnoRect(page, pageCtx.pagePtr, annotationPtr, annotation.rect)) {
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

    let isSucceed = false;
    switch (annotation.type) {
      case PdfAnnotationSubtype.INK:
        isSucceed = this.addInkStroke(page, pageCtx.pagePtr, annotationPtr, annotation);
        break;
      case PdfAnnotationSubtype.STAMP:
        isSucceed = this.addStampContent(
          ctx.docPtr,
          page,
          pageCtx.pagePtr,
          annotationPtr,
          annotation,
          context?.imageData,
        );
        break;
      case PdfAnnotationSubtype.TEXT:
        isSucceed = this.addTextContent(page, pageCtx.pagePtr, annotationPtr, annotation);
        break;
      case PdfAnnotationSubtype.FREETEXT:
        isSucceed = this.addFreeTextContent(page, pageCtx.pagePtr, annotationPtr, annotation);
        break;
      case PdfAnnotationSubtype.LINE:
        isSucceed = this.addLineContent(page, pageCtx.pagePtr, annotationPtr, annotation);
        break;
      case PdfAnnotationSubtype.POLYLINE:
      case PdfAnnotationSubtype.POLYGON:
        isSucceed = this.addPolyContent(page, pageCtx.pagePtr, annotationPtr, annotation);
        break;
      case PdfAnnotationSubtype.CIRCLE:
      case PdfAnnotationSubtype.SQUARE:
        isSucceed = this.addShapeContent(page, pageCtx.pagePtr, annotationPtr, annotation);
        break;
      case PdfAnnotationSubtype.UNDERLINE:
      case PdfAnnotationSubtype.STRIKEOUT:
      case PdfAnnotationSubtype.SQUIGGLY:
      case PdfAnnotationSubtype.HIGHLIGHT:
        isSucceed = this.addTextMarkupContent(page, pageCtx.pagePtr, annotationPtr, annotation);
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
    if (!this.setPageAnnoRect(page, pageCtx.pagePtr, annotPtr, annotation.rect)) {
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

    /* 2 ── wipe previous payload and rebuild fresh one ─────────────────────── */
    let ok = false;
    switch (annotation.type) {
      /* ── Ink ─────────────────────────────────────────────────────────────── */
      case PdfAnnotationSubtype.INK: {
        /* clear every existing stroke first */
        if (!this.pdfiumModule.FPDFAnnot_RemoveInkList(annotPtr)) break;
        ok = this.addInkStroke(page, pageCtx.pagePtr, annotPtr, annotation);
        break;
      }

      /* ── Stamp ───────────────────────────────────────────────────────────── */
      case PdfAnnotationSubtype.STAMP: {
        ok = this.addStampContent(ctx.docPtr, page, pageCtx.pagePtr, annotPtr, annotation);
        break;
      }

      case PdfAnnotationSubtype.TEXT: {
        ok = this.addTextContent(page, pageCtx.pagePtr, annotPtr, annotation);
        break;
      }

      /* ── Free text ────────────────────────────────────────────────────────── */
      case PdfAnnotationSubtype.FREETEXT: {
        ok = this.addFreeTextContent(page, pageCtx.pagePtr, annotPtr, annotation);
        break;
      }

      /* ── Shape ───────────────────────────────────────────────────────────── */
      case PdfAnnotationSubtype.CIRCLE:
      case PdfAnnotationSubtype.SQUARE: {
        ok = this.addShapeContent(page, pageCtx.pagePtr, annotPtr, annotation);
        break;
      }

      /* ── Line ─────────────────────────────────────────────────────────────── */
      case PdfAnnotationSubtype.LINE: {
        ok = this.addLineContent(page, pageCtx.pagePtr, annotPtr, annotation);
        break;
      }

      /* ── Polygon / Polyline ───────────────────────────────────────────────── */
      case PdfAnnotationSubtype.POLYGON:
      case PdfAnnotationSubtype.POLYLINE: {
        ok = this.addPolyContent(page, pageCtx.pagePtr, annotPtr, annotation);
        break;
      }

      /* ── Text-markup family ──────────────────────────────────────────────── */
      case PdfAnnotationSubtype.HIGHLIGHT:
      case PdfAnnotationSubtype.UNDERLINE:
      case PdfAnnotationSubtype.STRIKEOUT:
      case PdfAnnotationSubtype.SQUIGGLY: {
        /* replace quad-points / colour / strings in one go */
        ok = this.addTextMarkupContent(page, pageCtx.pagePtr, annotPtr, annotation);
        break;
      }

      /* ── Unsupported edits – fall through to error ───────────────────────── */
      default:
        ok = false;
    }

    /* 3 ── regenerate appearance if payload was changed ───────────────────── */
    if (ok) {
      if (annotation.blendMode !== undefined) {
        this.pdfiumModule.EPDFAnnot_GenerateAppearanceWithBlend(annotPtr, annotation.blendMode);
      } else {
        this.pdfiumModule.EPDFAnnot_GenerateAppearance(annotPtr);
      }
      this.pdfiumModule.FPDFPage_GenerateContent(pageCtx.pagePtr);
    }

    /* 4 ── tidy-up native handles ──────────────────────────────────────────── */
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
  renderThumbnail(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    options?: PdfRenderThumbnailOptions,
  ): PdfTask<T> {
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

    const result = this.renderPage(doc, page, {
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

    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `CloseDocument`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

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
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    annotation: PdfTextAnnoObject,
  ) {
    if (!this.setAnnotString(annotationPtr, 'Contents', annotation.contents ?? '')) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, 'T', annotation.author || '')) {
      return false;
    }
    if (annotation.modified && !this.setAnnotationDate(annotationPtr, 'M', annotation.modified)) {
      return false;
    }
    if (
      annotation.created &&
      !this.setAnnotationDate(annotationPtr, 'CreationDate', annotation.created)
    ) {
      return false;
    }
    if (
      annotation.inReplyToId &&
      !this.setInReplyToId(pagePtr, annotationPtr, annotation.inReplyToId)
    ) {
      return false;
    }
    if (!this.setAnnotationIcon(annotationPtr, annotation.icon || PdfAnnotationIcon.Comment)) {
      return false;
    }
    if (
      !this.setAnnotationFlags(annotationPtr, annotation.flags || ['print', 'noZoom', 'noRotate'])
    ) {
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
    return true;
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
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    annotation: PdfFreeTextAnnoObject,
  ) {
    if (
      annotation.created &&
      !this.setAnnotationDate(annotationPtr, 'CreationDate', annotation.created)
    ) {
      return false;
    }
    if (annotation.flags && !this.setAnnotationFlags(annotationPtr, annotation.flags)) {
      return false;
    }
    if (annotation.modified && !this.setAnnotationDate(annotationPtr, 'M', annotation.modified)) {
      return false;
    }
    if (!this.setBorderStyle(annotationPtr, PdfAnnotationBorderStyle.SOLID, 0)) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, 'Contents', annotation.contents ?? '')) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, 'T', annotation.author || '')) {
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
    if (!annotation.backgroundColor || annotation.backgroundColor === 'transparent') {
      if (!this.pdfiumModule.EPDFAnnot_ClearColor(annotationPtr, PdfAnnotationColorType.Color)) {
        return false;
      }
    } else if (
      !this.setAnnotationColor(
        annotationPtr,
        annotation.backgroundColor ?? '#FFFFFF',
        PdfAnnotationColorType.Color,
      )
    ) {
      return false;
    }
    return true;
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
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    annotation: PdfInkAnnoObject,
  ) {
    if (
      annotation.created &&
      !this.setAnnotationDate(annotationPtr, 'CreationDate', annotation.created)
    ) {
      return false;
    }
    if (annotation.flags && !this.setAnnotationFlags(annotationPtr, annotation.flags)) {
      return false;
    }
    if (annotation.modified && !this.setAnnotationDate(annotationPtr, 'M', annotation.modified)) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, 'Contents', annotation.contents ?? '')) {
      return false;
    }
    if (
      !this.setBorderStyle(annotationPtr, PdfAnnotationBorderStyle.SOLID, annotation.strokeWidth)
    ) {
      return false;
    }
    if (!this.setInkList(page, annotationPtr, annotation.inkList)) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, 'T', annotation.author || '')) {
      return false;
    }
    if (!this.setAnnotationOpacity(annotationPtr, annotation.opacity ?? 1)) {
      return false;
    }
    if (
      !this.setAnnotationColor(
        annotationPtr,
        annotation.color ?? '#FFFF00',
        PdfAnnotationColorType.Color,
      )
    ) {
      return false;
    }

    return true;
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
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    annotation: PdfLineAnnoObject,
  ) {
    if (
      annotation.created &&
      !this.setAnnotationDate(annotationPtr, 'CreationDate', annotation.created)
    ) {
      return false;
    }
    if (annotation.flags && !this.setAnnotationFlags(annotationPtr, annotation.flags)) {
      return false;
    }
    if (annotation.modified && !this.setAnnotationDate(annotationPtr, 'M', annotation.modified)) {
      return false;
    }
    if (
      !this.setLinePoints(
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
    if (!this.setAnnotString(annotationPtr, 'Contents', annotation.contents ?? '')) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, 'T', annotation.author || '')) {
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
    return true;
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
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    annotation: PdfPolygonAnnoObject | PdfPolylineAnnoObject,
  ) {
    if (
      annotation.created &&
      !this.setAnnotationDate(annotationPtr, 'CreationDate', annotation.created)
    ) {
      return false;
    }
    if (annotation.modified && !this.setAnnotationDate(annotationPtr, 'M', annotation.modified)) {
      return false;
    }
    if (annotation.flags && !this.setAnnotationFlags(annotationPtr, annotation.flags)) {
      return false;
    }
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
    if (!this.setPdfAnnoVertices(page, annotationPtr, annotation.vertices)) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, 'Contents', annotation.contents ?? '')) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, 'T', annotation.author || '')) {
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

    return true;
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
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    annotation: PdfCircleAnnoObject | PdfSquareAnnoObject,
  ) {
    if (
      annotation.created &&
      !this.setAnnotationDate(annotationPtr, 'CreationDate', annotation.created)
    ) {
      return false;
    }
    if (annotation.modified && !this.setAnnotationDate(annotationPtr, 'M', annotation.modified)) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, 'Contents', annotation.contents ?? '')) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, 'T', annotation.author || '')) {
      return false;
    }
    if (!this.setBorderStyle(annotationPtr, annotation.strokeStyle, annotation.strokeWidth)) {
      return false;
    }
    if (!this.setBorderDashPattern(annotationPtr, annotation.strokeDashArray ?? [])) {
      return false;
    }
    if (!this.setAnnotationFlags(annotationPtr, annotation.flags)) {
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

    return true;
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
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    annotation:
      | PdfHighlightAnnoObject
      | PdfUnderlineAnnoObject
      | PdfStrikeOutAnnoObject
      | PdfSquigglyAnnoObject,
  ) {
    if (
      annotation.created &&
      !this.setAnnotationDate(annotationPtr, 'CreationDate', annotation.created)
    ) {
      return false;
    }
    if (annotation.custom && !this.setAnnotCustom(annotationPtr, annotation.custom)) {
      return false;
    }
    if (annotation.flags && !this.setAnnotationFlags(annotationPtr, annotation.flags)) {
      return false;
    }
    if (annotation.modified && !this.setAnnotationDate(annotationPtr, 'M', annotation.modified)) {
      return false;
    }
    if (!this.syncQuadPointsAnno(page, annotationPtr, annotation.segmentRects)) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, 'Contents', annotation.contents ?? '')) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, 'T', annotation.author || '')) {
      return false;
    }
    if (!this.setAnnotationOpacity(annotationPtr, annotation.opacity ?? 1)) {
      return false;
    }
    if (
      !this.setAnnotationColor(
        annotationPtr,
        annotation.color ?? '#FFFF00',
        PdfAnnotationColorType.Color,
      )
    ) {
      return false;
    }

    return true;
  }

  /**
   * Add contents to stamp annotation
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
    docPtr: number,
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    annotation: PdfStampAnnoObject,
    imageData?: ImageData,
  ) {
    if (
      annotation.created &&
      !this.setAnnotationDate(annotationPtr, 'CreationDate', annotation.created)
    ) {
      return false;
    }
    if (annotation.flags && !this.setAnnotationFlags(annotationPtr, annotation.flags)) {
      return false;
    }
    if (annotation.modified && !this.setAnnotationDate(annotationPtr, 'M', annotation.modified)) {
      return false;
    }
    if (annotation.icon && !this.setAnnotationIcon(annotationPtr, annotation.icon)) {
      return false;
    }
    if (annotation.subject && !this.setAnnotString(annotationPtr, 'Subj', annotation.subject)) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, 'Contents', annotation.contents ?? '')) {
      return false;
    }
    if (imageData) {
      for (let i = this.pdfiumModule.FPDFAnnot_GetObjectCount(annotationPtr) - 1; i >= 0; i--) {
        this.pdfiumModule.FPDFAnnot_RemoveObject(annotationPtr, i);
      }

      if (!this.addImageObject(docPtr, page, pagePtr, annotationPtr, annotation.rect, imageData)) {
        return false;
      }
    }
    if (!this.pdfiumModule.EPDFAnnot_UpdateAppearanceToRect(annotationPtr, PdfStampFit.Cover)) {
      return false;
    }

    return true;
  }

  /**
   * Add image object to annotation
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

    const pagePos = this.convertDevicePointToPagePoint(page, {
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

    let x = 0,
      y = 0,
      width = 0,
      height = 0,
      isSpace = false;

    // ── 1) raw glyph bbox in                      page-user-space
    if (this.pdfiumModule.FPDFText_GetLooseCharBox(textPagePtr, charIndex, rectPtr)) {
      const left = this.pdfiumModule.pdfium.getValue(rectPtr, 'float');
      const top = this.pdfiumModule.pdfium.getValue(rectPtr + 4, 'float');
      const right = this.pdfiumModule.pdfium.getValue(rectPtr + 8, 'float');
      const bottom = this.pdfiumModule.pdfium.getValue(rectPtr + 12, 'float');

      if (left === right || top === bottom) {
        [rectPtr, dx1Ptr, dy1Ptr, dx2Ptr, dy2Ptr].forEach((p) => this.memoryManager.free(p));

        return {
          origin: { x: 0, y: 0 },
          size: { width: 0, height: 0 },
          isEmpty: true,
        };
      }

      // ── 2) map 2 opposite corners to            device-space
      this.pdfiumModule.FPDF_PageToDevice(
        pagePtr,
        0,
        0,
        page.size.width,
        page.size.height,
        /*rotate=*/ 0,
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
        /*rotate=*/ 0,
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

      // ── 3) extra flags ───────────────────────────────────────
      const uc = this.pdfiumModule.FPDFText_GetUnicode(textPagePtr, charIndex);
      isSpace = uc === 32;
    }

    // ── free tmps ───────────────────────────────────────────────
    [rectPtr, dx1Ptr, dy1Ptr, dx2Ptr, dy2Ptr].forEach((p) => this.memoryManager.free(p));

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
   * @param ctx - document context
   * @param page - page info
   * @returns annotations on the pdf page
   *
   * @private
   */
  private readPageAnnotations(ctx: DocumentContext, page: PdfPageObject) {
    return ctx.borrowPage(page.index, (pageCtx) => {
      const annotationCount = this.pdfiumModule.FPDFPage_GetAnnotCount(pageCtx.pagePtr);

      const annotations: PdfAnnotationObject[] = [];
      for (let i = 0; i < annotationCount; i++) {
        pageCtx.withAnnotation(i, (annotPtr) => {
          const anno = this.readPageAnnotation(ctx.docPtr, page, annotPtr, pageCtx);
          if (anno) annotations.push(anno);
        });
      }
      return annotations;
    });
  }

  /**
   *
   *
   * @param ctx - document context
   * @param page - page info
   * @returns form fields on the pdf page
   *
   * @private
   */
  private readPageAnnoWidgets(ctx: DocumentContext, page: PdfPageObject): PdfWidgetAnnoObject[] {
    return ctx.borrowPage(page.index, (pageCtx) => {
      const annotationCount = this.pdfiumModule.FPDFPage_GetAnnotCount(pageCtx.pagePtr);

      const annotations: PdfWidgetAnnoObject[] = [];
      for (let i = 0; i < annotationCount; i++) {
        pageCtx.withAnnotation(i, (annotPtr) => {
          const anno = this.readPageAnnoWidget(page, annotPtr, pageCtx);
          if (anno) annotations.push(anno);
        });
      }
      return annotations;
    });
  }

  /**
   * Read page annotations
   *
   * @param ctx - document context
   * @param page - page info
   * @returns annotations on the pdf page
   *
   * @private
   */
  private readPageAnnotationsRaw(ctx: DocumentContext, page: PdfPageObject): PdfAnnotationObject[] {
    const count = this.pdfiumModule.EPDFPage_GetAnnotCountRaw(ctx.docPtr, page.index);
    if (count <= 0) return [];

    const out: PdfAnnotationObject[] = [];

    for (let i = 0; i < count; ++i) {
      const annotPtr = this.pdfiumModule.EPDFPage_GetAnnotRaw(ctx.docPtr, page.index, i);
      if (!annotPtr) continue;

      try {
        const anno = this.readPageAnnotation(ctx.docPtr, page, annotPtr);
        if (anno) out.push(anno);
      } finally {
        this.pdfiumModule.FPDFPage_CloseAnnot(annotPtr);
      }
    }
    return out;
  }

  /**
   * Read page form field
   *
   * @param ctx - document context
   * @param page - page info
   * @param annotationPtr - pointer to pdf annotation
   * @param pageCtx - page context
   * @returns form field
   *
   * @private
   */
  private readPageAnnoWidget(
    page: PdfPageObject,
    annotationPtr: number,
    pageCtx: PageContext,
  ): PdfWidgetAnnoObject | undefined {
    let index = this.getAnnotString(annotationPtr, 'NM');
    if (!index || !isUuidV4(index)) {
      index = uuidV4();
      this.setAnnotString(annotationPtr, 'NM', index);
    }
    const subType = this.pdfiumModule.FPDFAnnot_GetSubtype(
      annotationPtr,
    ) as PdfAnnotationObject['type'];

    if (subType !== PdfAnnotationSubtype.WIDGET) return;

    return this.readPdfWidgetAnno(page, annotationPtr, pageCtx.getFormHandle(), index);
  }

  /**
   * Read pdf annotation from pdf document
   *
   * @param docPtr - pointer to pdf document
   * @param page - page info
   * @param annotationPtr - pointer to pdf annotation
   * @param pageCtx - page context
   * @returns pdf annotation
   *
   * @private
   */
  private readPageAnnotation(
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
          annotation = this.readPdfTextAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.FREETEXT:
        {
          annotation = this.readPdfFreeTextAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.LINK:
        {
          annotation = this.readPdfLinkAnno(page, docPtr, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.WIDGET:
        if (pageCtx) {
          return this.readPdfWidgetAnno(page, annotationPtr, pageCtx.getFormHandle(), index);
        }
      case PdfAnnotationSubtype.FILEATTACHMENT:
        {
          annotation = this.readPdfFileAttachmentAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.INK:
        {
          annotation = this.readPdfInkAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.POLYGON:
        {
          annotation = this.readPdfPolygonAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.POLYLINE:
        {
          annotation = this.readPdfPolylineAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.LINE:
        {
          annotation = this.readPdfLineAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.HIGHLIGHT:
        annotation = this.readPdfHighlightAnno(page, annotationPtr, index);
        break;
      case PdfAnnotationSubtype.STAMP:
        {
          annotation = this.readPdfStampAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.SQUARE:
        {
          annotation = this.readPdfSquareAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.CIRCLE:
        {
          annotation = this.readPdfCircleAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.UNDERLINE:
        {
          annotation = this.readPdfUnderlineAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.SQUIGGLY:
        {
          annotation = this.readPdfSquigglyAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.STRIKEOUT:
        {
          annotation = this.readPdfStrikeOutAnno(page, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.CARET:
        {
          annotation = this.readPdfCaretAnno(page, annotationPtr, index);
        }
        break;
      default:
        {
          annotation = this.readPdfAnno(page, subType, annotationPtr, index);
        }
        break;
    }

    return annotation;
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
    const { red, green, blue } = webColorToPdfColor(color); // 0-255 ints

    return !!this.pdfiumModule.EPDFAnnot_SetDefaultAppearance(
      annotationPtr,
      font,
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
   * @param annotationPtr - pointer to an `FPDF_ANNOTATION`
   * @param page - logical page info object (`PdfPageObject`)
   * @returns `{ start, end }` or `undefined` when PDFium can't read them
   */
  private getLinePoints(annotationPtr: number, page: PdfPageObject): LinePoints | undefined {
    const startPointPtr = this.memoryManager.malloc(8);
    const endPointPtr = this.memoryManager.malloc(8);

    this.pdfiumModule.FPDFAnnot_GetLine(annotationPtr, startPointPtr, endPointPtr);

    const startPointX = this.pdfiumModule.pdfium.getValue(startPointPtr, 'float');
    const startPointY = this.pdfiumModule.pdfium.getValue(startPointPtr + 4, 'float');
    const start = this.convertPagePointToDevicePoint(page, {
      x: startPointX,
      y: startPointY,
    });

    const endPointX = this.pdfiumModule.pdfium.getValue(endPointPtr, 'float');
    const endPointY = this.pdfiumModule.pdfium.getValue(endPointPtr + 4, 'float');
    const end = this.convertPagePointToDevicePoint(page, {
      x: endPointX,
      y: endPointY,
    });

    this.memoryManager.free(startPointPtr);
    this.memoryManager.free(endPointPtr);

    return { start, end };
  }

  /**
   * Set the two end‑points of a **Line** annotation
   * by writing a new /L array `[ x1 y1 x2 y2 ]`.
   * @param page - logical page info object (`PdfPageObject`)
   * @param annotPtr - pointer to the annotation whose line points are needed
   * @param start - start point
   * @param end - end point
   * @returns true on success
   */
  private setLinePoints(
    page: PdfPageObject,
    annotPtr: number,
    start: Position,
    end: Position,
  ): boolean {
    const buf = this.memoryManager.malloc(16); // 2 × (float x, float y)

    // --- convert to page coordinates -----------------------------------------
    const p1 = this.convertDevicePointToPagePoint(page, start);
    const p2 = this.convertDevicePointToPagePoint(page, end);

    // --- pack into WASM memory -----------------------------------------------
    this.pdfiumModule.pdfium.setValue(buf + 0, p1.x, 'float');
    this.pdfiumModule.pdfium.setValue(buf + 4, p1.y, 'float');
    this.pdfiumModule.pdfium.setValue(buf + 8, p2.x, 'float');
    this.pdfiumModule.pdfium.setValue(buf + 12, p2.y, 'float');

    // --- call the native API --------------------------------------------------
    const ok = this.pdfiumModule.EPDFAnnot_SetLine(annotPtr, buf, buf + 8);

    this.memoryManager.free(buf);
    return ok;
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
   * @param page          - logical page info object (`PdfPageObject`)
   * @param annotationPtr - pointer to the annotation whose quads are needed
   * @returns Array of `Rect` objects (`[]` if the annotation has no quads)
   *
   * @private
   */
  private getQuadPointsAnno(page: PdfPageObject, annotationPtr: number): Rect[] {
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
        const p1 = this.convertPagePointToDevicePoint(page, { x: xs[0], y: ys[0] });
        const p2 = this.convertPagePointToDevicePoint(page, { x: xs[1], y: ys[1] });
        const p3 = this.convertPagePointToDevicePoint(page, { x: xs[2], y: ys[2] });
        const p4 = this.convertPagePointToDevicePoint(page, { x: xs[3], y: ys[3] });

        quads.push({ p1, p2, p3, p4 });
      }

      this.memoryManager.free(quadPtr);
    }

    return quads.map(quadToRect);
  }

  /**
   * Set the quadrilaterals for a **Highlight / Underline / StrikeOut / Squiggly** markup annotation.
   *
   * @param page          - logical page info object (`PdfPageObject`)
   * @param annotationPtr - pointer to the annotation whose quads are needed
   * @param rects         - array of `Rect` objects (`[]` if the annotation has no quads)
   * @returns `true` if the operation was successful
   *
   * @private
   */
  private syncQuadPointsAnno(page: PdfPageObject, annotPtr: number, rects: Rect[]): boolean {
    const FS_QUADPOINTSF_SIZE = 8 * 4; // eight floats, 32 bytes
    const pdf = this.pdfiumModule.pdfium;
    const count = this.pdfiumModule.FPDFAnnot_CountAttachmentPoints(annotPtr);
    const buf = this.memoryManager.malloc(FS_QUADPOINTSF_SIZE);

    /** write one quad into `buf` in annotation space */
    const writeQuad = (r: Rect) => {
      const q = rectToQuad(r); // TL, TR, BR, BL
      const p1 = this.convertDevicePointToPagePoint(page, q.p1);
      const p2 = this.convertDevicePointToPagePoint(page, q.p2);
      const p3 = this.convertDevicePointToPagePoint(page, q.p3); // BR
      const p4 = this.convertDevicePointToPagePoint(page, q.p4); // BL

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
    const { ptr, count } = this.allocFSQuadsBufferFromRects(page, clean);
    let ok = false;
    try {
      // If your wrapper exposes FPDFText_RedactInQuads, call that instead.
      ok = !!this.pdfiumModule.EPDFText_RedactInQuads(
        pageCtx.pagePtr,
        ptr,
        count,
        recurseForms ? true : false,
        drawBlackBoxes ? true : false,
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

  /** Pack device-space Rects into an FS_QUADPOINTSF[] buffer (page space). */
  private allocFSQuadsBufferFromRects(page: PdfPageObject, rects: Rect[]) {
    const STRIDE = 32; // 8 floats × 4 bytes
    const count = rects.length;
    const ptr = this.memoryManager.malloc(STRIDE * count);
    const pdf = this.pdfiumModule.pdfium;

    for (let i = 0; i < count; i++) {
      const r = rects[i];
      const q = rectToQuad(r); // TL, TR, BR, BL (device-space)

      // Convert into PAGE USER SPACE (native expects page coords)
      const p1 = this.convertDevicePointToPagePoint(page, q.p1); // TL
      const p2 = this.convertDevicePointToPagePoint(page, q.p2); // TR
      const p3 = this.convertDevicePointToPagePoint(page, q.p3); // BR
      const p4 = this.convertDevicePointToPagePoint(page, q.p4); // BL

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
   * @param page  - logical page info object (`PdfPageObject`)
   * @param annotationPtr - pointer to the annotation whose ink list is needed
   * @returns ink list
   */
  private getInkList(page: PdfPageObject, annotationPtr: number): PdfInkListObject[] {
    const inkList: PdfInkListObject[] = [];

    const count = this.pdfiumModule.FPDFAnnot_GetInkListCount(annotationPtr);
    for (let i = 0; i < count; i++) {
      const points: Position[] = [];
      const pointsCount = this.pdfiumModule.FPDFAnnot_GetInkListPath(annotationPtr, i, 0, 0);
      if (pointsCount > 0) {
        const pointMemorySize = 8;
        const pointsPtr = this.memoryManager.malloc(pointsCount * pointMemorySize);
        this.pdfiumModule.FPDFAnnot_GetInkListPath(annotationPtr, i, pointsPtr, pointsCount);

        for (let j = 0; j < pointsCount; j++) {
          const pointX = this.pdfiumModule.pdfium.getValue(pointsPtr + j * 8, 'float');
          const pointY = this.pdfiumModule.pdfium.getValue(pointsPtr + j * 8 + 4, 'float');
          const { x, y } = this.convertPagePointToDevicePoint(page, {
            x: pointX,
            y: pointY,
          });
          points.push({ x, y });
        }

        this.memoryManager.free(pointsPtr);
      }

      inkList.push({ points });
    }

    return inkList;
  }

  /**
   * Add ink list to annotation
   * @param page  - logical page info object (`PdfPageObject`)
   * @param annotationPtr - pointer to the annotation whose ink list is needed
   * @param annotation - annotation object (`PdfInkAnnoObject`)
   * @returns `true` if the operation was successful
   */
  private setInkList(
    page: PdfPageObject,
    annotationPtr: number,
    inkList: PdfInkListObject[],
  ): boolean {
    for (const inkStroke of inkList) {
      const inkPointsCount = inkStroke.points.length;
      const inkPointsPtr = this.memoryManager.malloc(inkPointsCount * 8);
      for (let i = 0; i < inkPointsCount; i++) {
        const point = inkStroke.points[i];
        const { x, y } = this.convertDevicePointToPagePoint(page, point);

        this.pdfiumModule.pdfium.setValue(inkPointsPtr + i * 8, x, 'float');
        this.pdfiumModule.pdfium.setValue(inkPointsPtr + i * 8 + 4, y, 'float');
      }

      if (
        this.pdfiumModule.FPDFAnnot_AddInkStroke(annotationPtr, inkPointsPtr, inkPointsCount) === -1
      ) {
        this.memoryManager.free(inkPointsPtr);
        return false;
      }

      this.memoryManager.free(inkPointsPtr);
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
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfTextAnnoObject | undefined {
    const custom = this.getAnnotCustom(annotationPtr);
    const annoRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, annoRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modified = this.getAnnotationDate(annotationPtr, 'M');
    const created = this.getAnnotationDate(annotationPtr, 'CreationDate');
    const contents = this.getAnnotString(annotationPtr, 'Contents') || '';
    const state = this.getAnnotString(annotationPtr, 'State') as PdfAnnotationState;
    const stateModel = this.getAnnotString(annotationPtr, 'StateModel') as PdfAnnotationStateModel;
    const color = this.getAnnotationColor(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const inReplyToId = this.getInReplyToId(annotationPtr);
    const flags = this.getAnnotationFlags(annotationPtr);
    const icon = this.getAnnotationIcon(annotationPtr);

    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.TEXT,
      flags,
      contents,
      color: color ?? '#FFFF00',
      opacity,
      rect,
      inReplyToId,
      author,
      modified,
      created,
      state,
      stateModel,
      icon,
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
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfFreeTextAnnoObject | undefined {
    const custom = this.getAnnotCustom(annotationPtr);
    const annoRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, annoRect);
    const contents = this.getAnnotString(annotationPtr, 'Contents') || '';
    const author = this.getAnnotString(annotationPtr, 'T');
    const modified = this.getAnnotationDate(annotationPtr, 'M');
    const created = this.getAnnotationDate(annotationPtr, 'CreationDate');
    const defaultStyle = this.getAnnotString(annotationPtr, 'DS');
    const da = this.getAnnotationDefaultAppearance(annotationPtr);
    const backgroundColor = this.getAnnotationColor(annotationPtr);
    const textAlign = this.getAnnotationTextAlignment(annotationPtr);
    const verticalAlign = this.getAnnotationVerticalAlignment(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const richContent = this.getAnnotRichContent(annotationPtr);
    const flags = this.getAnnotationFlags(annotationPtr);

    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.FREETEXT,
      fontFamily: da?.fontFamily ?? PdfStandardFont.Unknown,
      fontSize: da?.fontSize ?? 12,
      fontColor: da?.fontColor ?? '#000000',
      verticalAlign,
      backgroundColor,
      flags,
      opacity,
      textAlign,
      defaultStyle,
      richContent,
      contents,
      author,
      modified,
      created,
      rect,
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
    page: PdfPageObject,
    docPtr: number,
    annotationPtr: number,
    index: string,
  ): PdfLinkAnnoObject | undefined {
    const custom = this.getAnnotCustom(annotationPtr);
    const linkPtr = this.pdfiumModule.FPDFAnnot_GetLink(annotationPtr);
    if (!linkPtr) {
      return;
    }

    const annoRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, annoRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modified = this.getAnnotationDate(annotationPtr, 'M');
    const created = this.getAnnotationDate(annotationPtr, 'CreationDate');
    const flags = this.getAnnotationFlags(annotationPtr);

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
      custom,
      id: index,
      type: PdfAnnotationSubtype.LINK,
      flags,
      target,
      rect,
      author,
      modified,
      created,
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
    page: PdfPageObject,
    annotationPtr: number,
    formHandle: number,
    index: string,
  ): PdfWidgetAnnoObject | undefined {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const modified = this.getAnnotationDate(annotationPtr, 'M');
    const created = this.getAnnotationDate(annotationPtr, 'CreationDate');
    const flags = this.getAnnotationFlags(annotationPtr);
    const da = this.getAnnotationDefaultAppearance(annotationPtr);
    const field = this.readPdfWidgetAnnoField(formHandle, annotationPtr);

    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.WIDGET,
      flags,
      fontFamily: da?.fontFamily ?? PdfStandardFont.Unknown,
      fontSize: da?.fontSize ?? 12,
      fontColor: da?.fontColor ?? '#000000',
      rect,
      field,
      modified,
      created,
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
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfFileAttachmentAnnoObject | undefined {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modified = this.getAnnotationDate(annotationPtr, 'M');
    const created = this.getAnnotationDate(annotationPtr, 'CreationDate');
    const flags = this.getAnnotationFlags(annotationPtr);

    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.FILEATTACHMENT,
      flags,
      rect,
      author,
      modified,
      created,
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
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfInkAnnoObject | undefined {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modified = this.getAnnotationDate(annotationPtr, 'M');
    const created = this.getAnnotationDate(annotationPtr, 'CreationDate');
    const color = this.getAnnotationColor(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const { width: strokeWidth } = this.getBorderStyle(annotationPtr);
    const inkList = this.getInkList(page, annotationPtr);
    const blendMode = this.pdfiumModule.EPDFAnnot_GetBlendMode(annotationPtr);
    const intent = this.getAnnotIntent(annotationPtr);
    const flags = this.getAnnotationFlags(annotationPtr);
    const contents = this.getAnnotString(annotationPtr, 'Contents') || '';

    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.INK,
      ...(intent && { intent }),
      contents,
      blendMode,
      flags,
      color: color ?? '#FF0000',
      opacity,
      strokeWidth: strokeWidth === 0 ? 1 : strokeWidth,
      rect,
      inkList,
      author,
      modified,
      created,
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
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfPolygonAnnoObject | undefined {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modified = this.getAnnotationDate(annotationPtr, 'M');
    const created = this.getAnnotationDate(annotationPtr, 'CreationDate');
    const vertices = this.readPdfAnnoVertices(page, annotationPtr);
    const contents = this.getAnnotString(annotationPtr, 'Contents') || '';
    const flags = this.getAnnotationFlags(annotationPtr);
    const strokeColor = this.getAnnotationColor(annotationPtr);
    const interiorColor = this.getAnnotationColor(
      annotationPtr,
      PdfAnnotationColorType.InteriorColor,
    );
    const opacity = this.getAnnotationOpacity(annotationPtr);
    let { style: strokeStyle, width: strokeWidth } = this.getBorderStyle(annotationPtr);

    let strokeDashArray: number[] | undefined;
    if (strokeStyle === PdfAnnotationBorderStyle.DASHED) {
      const { ok, pattern } = this.getBorderDashPattern(annotationPtr);
      if (ok) {
        strokeDashArray = pattern;
      }
    }

    // ▼––– Remove redundant closing vertex for polygons ––––––––––––––––––––––
    if (vertices.length > 1) {
      const first = vertices[0];
      const last = vertices[vertices.length - 1];
      if (first.x === last.x && first.y === last.y) {
        vertices.pop();
      }
    }

    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.POLYGON,
      contents,
      flags,
      strokeColor: strokeColor ?? '#FF0000',
      color: interiorColor ?? 'transparent',
      opacity,
      strokeWidth: strokeWidth === 0 ? 1 : strokeWidth,
      strokeStyle,
      strokeDashArray,
      rect,
      vertices,
      author,
      modified,
      created,
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
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfPolylineAnnoObject | undefined {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modified = this.getAnnotationDate(annotationPtr, 'M');
    const created = this.getAnnotationDate(annotationPtr, 'CreationDate');
    const vertices = this.readPdfAnnoVertices(page, annotationPtr);
    const contents = this.getAnnotString(annotationPtr, 'Contents') || '';
    const strokeColor = this.getAnnotationColor(annotationPtr);
    const flags = this.getAnnotationFlags(annotationPtr);
    const interiorColor = this.getAnnotationColor(
      annotationPtr,
      PdfAnnotationColorType.InteriorColor,
    );
    const opacity = this.getAnnotationOpacity(annotationPtr);
    let { style: strokeStyle, width: strokeWidth } = this.getBorderStyle(annotationPtr);

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
      custom,
      id: index,
      type: PdfAnnotationSubtype.POLYLINE,
      contents,
      flags,
      strokeColor: strokeColor ?? '#FF0000',
      color: interiorColor ?? 'transparent',
      opacity,
      strokeWidth: strokeWidth === 0 ? 1 : strokeWidth,
      strokeStyle,
      strokeDashArray,
      lineEndings,
      rect,
      vertices,
      author,
      modified,
      created,
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
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfLineAnnoObject | undefined {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modified = this.getAnnotationDate(annotationPtr, 'M');
    const created = this.getAnnotationDate(annotationPtr, 'CreationDate');
    const linePoints = this.getLinePoints(annotationPtr, page);
    const lineEndings = this.getLineEndings(annotationPtr);
    const contents = this.getAnnotString(annotationPtr, 'Contents') || '';
    const strokeColor = this.getAnnotationColor(annotationPtr);
    const flags = this.getAnnotationFlags(annotationPtr);
    const interiorColor = this.getAnnotationColor(
      annotationPtr,
      PdfAnnotationColorType.InteriorColor,
    );
    const opacity = this.getAnnotationOpacity(annotationPtr);
    let { style: strokeStyle, width: strokeWidth } = this.getBorderStyle(annotationPtr);

    let strokeDashArray: number[] | undefined;
    if (strokeStyle === PdfAnnotationBorderStyle.DASHED) {
      const { ok, pattern } = this.getBorderDashPattern(annotationPtr);
      if (ok) {
        strokeDashArray = pattern;
      }
    }

    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.LINE,
      flags,
      rect,
      contents,
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
      author,
      modified,
      created,
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
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfHighlightAnnoObject | undefined {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const segmentRects = this.getQuadPointsAnno(page, annotationPtr);
    const color = this.getAnnotationColor(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const blendMode = this.pdfiumModule.EPDFAnnot_GetBlendMode(annotationPtr);

    const author = this.getAnnotString(annotationPtr, 'T');
    const modified = this.getAnnotationDate(annotationPtr, 'M');
    const created = this.getAnnotationDate(annotationPtr, 'CreationDate');
    const contents = this.getAnnotString(annotationPtr, 'Contents') || '';
    const flags = this.getAnnotationFlags(annotationPtr);

    return {
      pageIndex: page.index,
      custom,
      id: index,
      blendMode,
      type: PdfAnnotationSubtype.HIGHLIGHT,
      rect,
      flags,
      contents,
      segmentRects,
      color: color ?? '#FFFF00',
      opacity,
      author,
      modified,
      created,
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
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfUnderlineAnnoObject | undefined {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modified = this.getAnnotationDate(annotationPtr, 'M');
    const created = this.getAnnotationDate(annotationPtr, 'CreationDate');
    const segmentRects = this.getQuadPointsAnno(page, annotationPtr);
    const contents = this.getAnnotString(annotationPtr, 'Contents') || '';
    const color = this.getAnnotationColor(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const blendMode = this.pdfiumModule.EPDFAnnot_GetBlendMode(annotationPtr);
    const flags = this.getAnnotationFlags(annotationPtr);

    return {
      pageIndex: page.index,
      custom,
      id: index,
      blendMode,
      type: PdfAnnotationSubtype.UNDERLINE,
      rect,
      flags,
      contents,
      segmentRects,
      color: color ?? '#FF0000',
      opacity,
      author,
      modified,
      created,
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
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfStrikeOutAnnoObject | undefined {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modified = this.getAnnotationDate(annotationPtr, 'M');
    const created = this.getAnnotationDate(annotationPtr, 'CreationDate');
    const segmentRects = this.getQuadPointsAnno(page, annotationPtr);
    const contents = this.getAnnotString(annotationPtr, 'Contents') || '';
    const color = this.getAnnotationColor(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const blendMode = this.pdfiumModule.EPDFAnnot_GetBlendMode(annotationPtr);
    const flags = this.getAnnotationFlags(annotationPtr);

    return {
      pageIndex: page.index,
      custom,
      id: index,
      blendMode,
      type: PdfAnnotationSubtype.STRIKEOUT,
      flags,
      rect,
      contents,
      segmentRects,
      color: color ?? '#FF0000',
      opacity,
      author,
      modified,
      created,
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
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfSquigglyAnnoObject | undefined {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modified = this.getAnnotationDate(annotationPtr, 'M');
    const created = this.getAnnotationDate(annotationPtr, 'CreationDate');
    const segmentRects = this.getQuadPointsAnno(page, annotationPtr);
    const contents = this.getAnnotString(annotationPtr, 'Contents') || '';
    const color = this.getAnnotationColor(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    const blendMode = this.pdfiumModule.EPDFAnnot_GetBlendMode(annotationPtr);
    const flags = this.getAnnotationFlags(annotationPtr);

    return {
      pageIndex: page.index,
      custom,
      id: index,
      blendMode,
      type: PdfAnnotationSubtype.SQUIGGLY,
      rect,
      flags,
      contents,
      segmentRects,
      color: color ?? '#FF0000',
      opacity,
      author,
      modified,
      created,
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
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfCaretAnnoObject | undefined {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modified = this.getAnnotationDate(annotationPtr, 'M');
    const created = this.getAnnotationDate(annotationPtr, 'CreationDate');
    const flags = this.getAnnotationFlags(annotationPtr);

    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.CARET,
      rect,
      flags,
      author,
      modified,
      created,
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
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfStampAnnoObject | undefined {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modified = this.getAnnotationDate(annotationPtr, 'M');
    const created = this.getAnnotationDate(annotationPtr, 'CreationDate');
    const flags = this.getAnnotationFlags(annotationPtr);
    const contents = this.getAnnotString(annotationPtr, 'Contents') || '';

    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.STAMP,
      contents,
      rect,
      author,
      modified,
      created,
      flags,
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

    const imageData = new ImageData(array, bitmapWidth, bitmapHeight);
    const matrix = this.readPdfPageObjectTransformMatrix(imageObjectPtr);

    return {
      type: PdfPageObjectType.IMAGE,
      imageData,
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
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfCircleAnnoObject {
    const custom = this.getAnnotCustom(annotationPtr);
    const flags = this.getAnnotationFlags(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modified = this.getAnnotationDate(annotationPtr, 'M');
    const created = this.getAnnotationDate(annotationPtr, 'CreationDate');
    const contents = this.getAnnotString(annotationPtr, 'Contents') || '';
    const interiorColor = this.getAnnotationColor(
      annotationPtr,
      PdfAnnotationColorType.InteriorColor,
    );
    const strokeColor = this.getAnnotationColor(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    let { style: strokeStyle, width: strokeWidth } = this.getBorderStyle(annotationPtr);

    let strokeDashArray: number[] | undefined;
    if (strokeStyle === PdfAnnotationBorderStyle.DASHED) {
      const { ok, pattern } = this.getBorderDashPattern(annotationPtr);
      if (ok) {
        strokeDashArray = pattern;
      }
    }

    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.CIRCLE,
      flags,
      color: interiorColor ?? 'transparent',
      opacity,
      contents,
      strokeWidth,
      strokeColor: strokeColor ?? '#FF0000',
      strokeStyle,
      rect,
      author,
      modified,
      created,
      ...(strokeDashArray !== undefined && { strokeDashArray }),
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
    page: PdfPageObject,
    annotationPtr: number,
    index: string,
  ): PdfSquareAnnoObject {
    const custom = this.getAnnotCustom(annotationPtr);
    const flags = this.getAnnotationFlags(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modified = this.getAnnotationDate(annotationPtr, 'M');
    const created = this.getAnnotationDate(annotationPtr, 'CreationDate');
    const contents = this.getAnnotString(annotationPtr, 'Contents') || '';
    const interiorColor = this.getAnnotationColor(
      annotationPtr,
      PdfAnnotationColorType.InteriorColor,
    );
    const strokeColor = this.getAnnotationColor(annotationPtr);
    const opacity = this.getAnnotationOpacity(annotationPtr);
    let { style: strokeStyle, width: strokeWidth } = this.getBorderStyle(annotationPtr);

    let strokeDashArray: number[] | undefined;
    if (strokeStyle === PdfAnnotationBorderStyle.DASHED) {
      const { ok, pattern } = this.getBorderDashPattern(annotationPtr);
      if (ok) {
        strokeDashArray = pattern;
      }
    }

    return {
      pageIndex: page.index,
      custom,
      id: index,
      type: PdfAnnotationSubtype.SQUARE,
      flags,
      color: interiorColor ?? 'transparent',
      opacity,
      contents,
      strokeColor: strokeColor ?? '#FF0000',
      strokeWidth,
      strokeStyle,
      rect,
      author,
      modified,
      created,
      ...(strokeDashArray !== undefined && { strokeDashArray }),
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
    page: PdfPageObject,
    type: PdfUnsupportedAnnoObject['type'],
    annotationPtr: number,
    index: string,
  ): PdfUnsupportedAnnoObject {
    const custom = this.getAnnotCustom(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modified = this.getAnnotationDate(annotationPtr, 'M');
    const created = this.getAnnotationDate(annotationPtr, 'CreationDate');
    const flags = this.getAnnotationFlags(annotationPtr);

    return {
      pageIndex: page.index,
      custom,
      id: index,
      flags,
      type,
      rect,
      author,
      modified,
      created,
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
  private setInReplyToId(pagePtr: number, annotationPtr: number, id: string): boolean {
    const parentPtr = this.getAnnotationByName(pagePtr, id);
    if (!parentPtr) return false;

    return this.pdfiumModule.EPDFAnnot_SetLinkedAnnot(annotationPtr, 'IRT', parentPtr);
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
   * @param page  - pdf page infor
   * @param annotationPtr - pointer to pdf annotation
   * @returns vertices of pdf annotation
   *
   * @private
   */
  private readPdfAnnoVertices(page: PdfPageObject, annotationPtr: number): Position[] {
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

      const { x, y } = this.convertPagePointToDevicePoint(page, {
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
   * @param page  - pdf page infor
   * @param annotPtr - pointer to pdf annotation
   * @param vertices - the vertices to be set
   * @returns true on success
   *
   * @private
   */
  private setPdfAnnoVertices(page: PdfPageObject, annotPtr: number, vertices: Position[]): boolean {
    const pdf = this.pdfiumModule.pdfium;
    const FS_POINTF_SIZE = 8;

    const buf = this.memoryManager.malloc(FS_POINTF_SIZE * vertices.length);
    vertices.forEach((v, i) => {
      const pagePt = this.convertDevicePointToPagePoint(page, v);
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
  renderPageAnnotation(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
    options?: PdfRenderPageAnnotationOptions,
  ): PdfTask<T> {
    const {
      scaleFactor = 1,
      rotation = Rotation.Degree0,
      dpr = 1,
      mode = AppearanceMode.Normal,
      imageType = 'image/webp',
      imageQuality,
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

    const task = new Task<T, PdfErrorReason>();
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

    const rect = toIntRect(annotation.rect);
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

    // 5) render (DisplayMatrix is applied inside EPDF_RenderAnnotBitmap)
    const FLAGS = RenderFlag.REVERSE_BYTE_ORDER;
    let ok = false;
    try {
      ok = !!this.pdfiumModule.EPDF_RenderAnnotBitmap(
        bitmapPtr,
        pageCtx.pagePtr,
        annotPtr,
        mode,
        mPtr,
        FLAGS,
      );
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

    // 6) encode
    const dispose = () => this.memoryManager.free(heapPtr);

    this.imageDataConverter(
      () => {
        const rgba = new Uint8ClampedArray(
          this.pdfiumModule.pdfium.HEAPU8.subarray(heapPtr, heapPtr + bytes),
        );
        return {
          width: wDev,
          height: hDev,
          data: rgba,
        };
      },
      imageType,
      imageQuality,
    )
      .then((out) => task.resolve(out))
      .catch((e) => {
        // Check if it's an OffscreenCanvas error and we haven't copied data yet
        if (e instanceof OffscreenCanvasError) {
          // Fallback to WASM encoding without wasting the copy
          try {
            const blob = this.encodeViaWasm(
              { ptr: heapPtr, width: wDev, height: hDev, stride },
              { type: imageType, quality: imageQuality },
            );
            task.resolve(blob as T);
          } catch (wasmError) {
            task.reject({ code: PdfErrorCode.Unknown, message: String(wasmError) });
          }
        } else {
          task.reject({ code: PdfErrorCode.Unknown, message: String(e) });
        }
      })
      .finally(dispose);

    return task;
  }

  private encodeViaWasm(
    buf: { ptr: number; width: number; height: number; stride: number },
    opts: ConvertToBlobOptions,
  ): Blob {
    const pdf = this.pdfiumModule.pdfium;

    // Helper to copy out and free a payload allocated in WASM
    const blobFrom = (outPtr: WasmPointer, size: number, mime: string) => {
      const view = pdf.HEAPU8.subarray(outPtr, outPtr + size);
      const copy = new Uint8Array(view); // detach from WASM before free
      this.memoryManager.free(outPtr);
      return new Blob([copy], { type: mime });
    };

    // Map OffscreenCanvas "quality 0..1" to encoders:
    //  • WebP: 0..100 (float), default ~0.82 → 82
    //  • JPEG: 1..100 (int),   default ~0.92 → 92
    //const q = opts.quality;
    //const webpQ = q == null ? 82 : Math.round(q * 100);
    //const jpegQ = q == null ? 92 : Math.max(1, Math.round(q * 100));
    // PNG ignores quality (same as OffscreenCanvas). Use libpng default (6).
    const pngLevel = 6;

    const outPtrPtr = this.memoryManager.malloc(4);
    try {
      switch (opts.type) {
        /*
        case 'image/webp': {
          const size = this.pdfiumModule.EPDF_WebP_EncodeRGBA(
            buf.ptr,
            buf.width,
            buf.height,
            buf.stride,
            webpQ,
            outPtrPtr,
          );
          const outPtr = pdf.getValue(outPtrPtr, 'i32');
          return blobFrom(outPtr, size, 'image/webp');
        }
        case 'image/jpeg': {
          const size = this.pdfiumModule.EPDF_JPEG_EncodeRGBA(
            buf.ptr,
            buf.width,
            buf.height,
            buf.stride,
            jpegQ,
            outPtrPtr,
          );
          const outPtr = pdf.getValue(outPtrPtr, 'i32');
          return blobFrom(outPtr, size, 'image/jpeg');
        }
        */
        case 'image/png':
        default: {
          const size = this.pdfiumModule.EPDF_PNG_EncodeRGBA(
            buf.ptr,
            buf.width,
            buf.height,
            buf.stride,
            pngLevel,
            outPtrPtr,
          );
          const outPtr = pdf.getValue(outPtrPtr, 'i32');
          return blobFrom(WasmPointer(outPtr), size, 'image/png');
        }
      }
    } finally {
      this.memoryManager.free(outPtrPtr);
    }
  }

  private renderRectEncoded(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    rect: Rect,
    options?: PdfRenderPageOptions,
  ): PdfTask<T> {
    const task = new Task<T, PdfErrorReason>();

    const imageType: ImageConversionTypes = options?.imageType ?? 'image/webp';
    const quality = options?.imageQuality;
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
    let flags = RenderFlag.LCD_TEXT | RenderFlag.REVERSE_BYTE_ORDER;
    if (options?.withAnnotations ?? false) flags |= RenderFlag.ANNOT;

    const pageCtx = ctx.acquirePage(page.index);
    try {
      this.pdfiumModule.FPDF_RenderPageBitmapWithMatrix(
        bitmapPtr,
        pageCtx.pagePtr,
        mPtr,
        clipPtr,
        flags,
      );
    } finally {
      pageCtx.release();
      this.memoryManager.free(mPtr);
      this.memoryManager.free(clipPtr);
    }

    const dispose = () => {
      this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr);
      this.memoryManager.free(heapPtr);
    };

    this.imageDataConverter(
      () => {
        const rgba = new Uint8ClampedArray(
          this.pdfiumModule.pdfium.HEAPU8.subarray(heapPtr, heapPtr + bytes),
        );
        return {
          width: wDev,
          height: hDev,
          data: rgba,
        };
      },
      imageType,
      quality,
    )
      .then((out) => task.resolve(out))
      .catch((e) => {
        this.logger.error(LOG_SOURCE, LOG_CATEGORY, 'Error', e);
        // Check if it's an OffscreenCanvas error and we haven't copied data yet
        if (e instanceof OffscreenCanvasError) {
          // Fallback to WASM encoding without wasting the copy
          this.logger.info(LOG_SOURCE, LOG_CATEGORY, 'Fallback to WASM encoding');
          try {
            const blob = this.encodeViaWasm(
              { ptr: heapPtr, width: wDev, height: hDev, stride },
              { type: imageType, quality },
            );
            task.resolve(blob as T);
          } catch (wasmError) {
            task.reject({ code: PdfErrorCode.Unknown, message: String(wasmError) });
          }
        } else {
          task.reject({ code: PdfErrorCode.Unknown, message: String(e) });
        }
      })
      .finally(dispose);

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
        // doesn’t carry a path, so we’ll reject for now.
        return false;

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
   * @param page  - pdf page infor
   * @param position - position of point
   * @returns converted position
   *
   * @private
   */
  private convertDevicePointToPagePoint(page: PdfPageObject, position: Position): Position {
    const x = position.x;
    const y = page.size.height - position.y;

    return { x, y };
  }

  /**
   * Convert coordinate of point from page coordinate to device coordinate
   * @param page  - pdf page infor
   * @param position - position of point
   * @returns converted position
   *
   * @private
   */
  private convertPagePointToDevicePoint(page: PdfPageObject, position: Position): Position {
    const x = position.x;
    const y = page.size.height - position.y;

    return { x, y };
  }

  /**
   * Convert coordinate of rectangle from page coordinate to device coordinate
   * @param page  - pdf page infor
   * @param pagePtr - pointer to pdf page object
   * @param pageRect - rectangle that needs to be converted
   * @returns converted rectangle
   *
   * @private
   */
  private convertPageRectToDeviceRect(
    page: PdfPageObject,
    pageRect: {
      left: number;
      top: number;
      right: number;
      bottom: number;
    },
  ): Rect {
    const { x, y } = this.convertPagePointToDevicePoint(page, {
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
   * @param page - page info that the annotation is belonged to
   * @param pagePtr - pointer of page object
   * @param annotationPtr - pointer to annotation object
   * @param rect - target rectangle
   * @returns whether the rect is setted
   *
   * @private
   */
  setPageAnnoRect(page: PdfPageObject, pagePtr: number, annotationPtr: number, rect: Rect) {
    const pageXPtr = this.memoryManager.malloc(8);
    const pageYPtr = this.memoryManager.malloc(8);
    if (
      !this.pdfiumModule.FPDF_DeviceToPage(
        pagePtr,
        0,
        0,
        page.size.width,
        page.size.height,
        0,
        rect.origin.x,
        rect.origin.y,
        pageXPtr,
        pageYPtr,
      )
    ) {
      this.memoryManager.free(pageXPtr);
      this.memoryManager.free(pageYPtr);
      return false;
    }
    const pageX = this.pdfiumModule.pdfium.getValue(pageXPtr, 'double');
    const pageY = this.pdfiumModule.pdfium.getValue(pageYPtr, 'double');
    this.memoryManager.free(pageXPtr);
    this.memoryManager.free(pageYPtr);

    const pageRectPtr = this.memoryManager.malloc(4 * 4);
    this.pdfiumModule.pdfium.setValue(pageRectPtr, pageX, 'float');
    this.pdfiumModule.pdfium.setValue(pageRectPtr + 4, pageY, 'float');
    this.pdfiumModule.pdfium.setValue(pageRectPtr + 8, pageX + rect.size.width, 'float');
    this.pdfiumModule.pdfium.setValue(pageRectPtr + 12, pageY - rect.size.height, 'float');

    if (!this.pdfiumModule.FPDFAnnot_SetRect(annotationPtr, pageRectPtr)) {
      this.memoryManager.free(pageRectPtr);
      return false;
    }
    this.memoryManager.free(pageRectPtr);

    return true;
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
    if (this.pdfiumModule.FPDFAnnot_GetRect(annotationPtr, pageRectPtr)) {
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
    page: PdfPageObject,
    pagePtr: number,
    textPagePtr: number,
    startIndex: number,
    charCount: number,
  ): Rect[] {
    const rectsCount = this.pdfiumModule.FPDFText_CountRects(textPagePtr, startIndex, charCount);

    const highlightRects: Rect[] = [];
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

      // Convert the bottom-right coordinates to width/height
      const width = Math.ceil(Math.abs(right - left));
      const height = Math.ceil(Math.abs(top - bottom));

      highlightRects.push({
        origin: { x, y },
        size: { width, height },
      });
    }

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
  searchAllPages(
    doc: PdfDocumentObject,
    keyword: string,
    options?: PdfSearchAllPagesOptions,
  ): PdfTask<SearchAllPagesResult, PdfPageSearchProgress> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'searchAllPages', doc, keyword, options);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'SearchAllPages', 'Begin', doc.id);

    // Resolve early if doc not open
    const ctx = this.cache.getContext(doc.id);
    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'SearchAllPages', 'End', doc.id);
      return PdfTaskHelper.resolve<SearchAllPagesResult, PdfPageSearchProgress>({
        results: [],
        total: 0,
      });
    }

    // Build UTF-16 keyword buffer
    const length = 2 * (keyword.length + 1);
    const keywordPtr = this.memoryManager.malloc(length);
    this.pdfiumModule.pdfium.stringToUTF16(keyword, keywordPtr, length);

    // Fold flags
    const flag =
      options?.flags?.reduce((acc: MatchFlag, f: MatchFlag) => acc | f, MatchFlag.None) ??
      MatchFlag.None;

    // Create task with progress payload
    const task = PdfTaskHelper.create<SearchAllPagesResult, PdfPageSearchProgress>();

    let cancelled = false;
    task.wait(
      () => {},
      (err) => {
        if (err.type === 'abort') cancelled = true;
      },
    );

    const CHUNK_SIZE = 100; // tune as needed
    const allResults: SearchResult[] = [];

    const processChunk = (startIdx: number): void => {
      if (cancelled) return;

      const endIdx = Math.min(startIdx + CHUNK_SIZE, doc.pageCount);

      try {
        for (let pageIndex = startIdx; pageIndex < endIdx && !cancelled; pageIndex++) {
          // Search this page once
          const pageResults = this.searchAllInPage(ctx, doc.pages[pageIndex], keywordPtr, flag);

          // Accumulate and emit progress
          allResults.push(...pageResults);
          task.progress({ page: pageIndex, results: pageResults });
        }
      } catch (e) {
        if (!cancelled) {
          this.memoryManager.free(keywordPtr);
          this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'SearchAllPages', 'End', doc.id);
          task.reject({
            code: PdfErrorCode.Unknown,
            message: `Error searching document: ${e}`,
          });
        }
        return;
      }

      if (cancelled) return;

      if (endIdx >= doc.pageCount) {
        this.memoryManager.free(keywordPtr);
        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'SearchAllPages', 'End', doc.id);
        task.resolve({ results: allResults, total: allResults.length });
        return;
      }

      // yield to event loop
      setTimeout(() => processChunk(endIdx), 0);
    };

    // kick off
    setTimeout(() => processChunk(0), 0);

    // Ensure buffer is freed if caller aborts mid-flight
    task.wait(
      () => {},
      (err) => {
        if (err.type === 'abort') {
          try {
            this.memoryManager.free(keywordPtr);
          } catch {}
        }
      },
    );

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

        const rects = this.getHighlightRects(
          page,
          pageCtx.pagePtr,
          textPagePtr,
          charIndex,
          charCount,
        );

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
