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
  PdfRenderOptions,
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
  transformSize,
  PdfFile,
  PdfAnnotationTransformation,
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
  PdfUrlOptions,
  PdfFileUrl,
  Task,
  PdfErrorReason,
  TextContext,
  PdfGlyphObject,
  PdfPageGeometry,
  PdfRun,
  toIntRect,
  toIntSize,
  Quad,
  PdfAlphaColor,
  PdfAnnotationState,
  PdfAnnotationStateModel,
  quadToRect,
  PdfImage,
  ImageConversionTypes,
  PdfAnnotationObjectBase,
  PageTextSlice,
  stripPdfUnwantedMarkers,
  webAlphaColorToPdfAlphaColor,
  pdfAlphaColorToWebAlphaColor,
  rectToQuad,
  WebAlphaColor,
  dateToPdfDate,
  pdfDateToDate,
  PdfAnnotationColorType,
  PdfAnnotationBorderStyle,
  flagsToNames,
  PdfAnnotationFlagName,
  makeMatrix,
} from '@embedpdf/models';
import { readArrayBuffer, readString } from './helper';
import { WrappedPdfiumModule } from '@embedpdf/pdfium';
import { DocumentContext, PageContext, PdfCache } from './cache';

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

/**
 * Function type for converting ImageData to Blob
 * In browser: uses OffscreenCanvas
 * In Node.js: can use Sharp or other image processing libraries
 */
export type ImageDataConverter<T = Blob> = (
  imageData: PdfImage,
  imageType?: ImageConversionTypes,
) => Promise<T>;

export const browserImageDataToBlobConverter: ImageDataConverter<Blob> = (
  pdfImageData: PdfImage,
  imageType: ImageConversionTypes = 'image/webp',
): Promise<Blob> => {
  // Check if we're in a browser environment
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error(
      'OffscreenCanvas is not available in this environment. ' +
        'This converter is intended for browser use only. ' +
        'Please use createNodeImageDataToBlobConverter() or createNodeCanvasImageDataToBlobConverter() for Node.js.',
    );
  }

  const imageData = new ImageData(pdfImageData.data, pdfImageData.width, pdfImageData.height);
  const off = new OffscreenCanvas(imageData.width, imageData.height);
  off.getContext('2d')!.putImageData(imageData, 0, 0);
  return off.convertToBlob({ type: imageType });
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
   * Create an instance of PdfiumEngine
   * @param wasmModule - pdfium wasm module
   * @param logger - logger instance
   * @param imageDataToBlobConverter - function to convert ImageData to Blob
   */
  constructor(
    private pdfiumModule: WrappedPdfiumModule,
    private logger: Logger = new NoopLogger(),
    private imageDataConverter: ImageDataConverter<T> = browserImageDataToBlobConverter as ImageDataConverter<T>,
  ) {
    this.cache = new PdfCache(this.pdfiumModule);
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
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `Destroy`, 'End', 'General');
    return PdfTaskHelper.resolve(true);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.openDocumentUrl}
   *
   * @public
   */
  public openDocumentUrl(file: PdfFileUrl, options?: PdfUrlOptions) {
    const mode = options?.mode ?? 'auto';
    const password = options?.password ?? '';

    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'openDocumentUrl called', file.url, mode);

    // We'll create a task to wrap asynchronous steps
    const task = PdfTaskHelper.create<PdfDocumentObject>();

    // Start an async procedure
    (async () => {
      try {
        // Decide on approach
        if (mode === 'full-fetch') {
          const fetchFullTask = await this.fetchFullAndOpen(file, password);
          fetchFullTask.wait(
            (doc) => task.resolve(doc),
            (err) => task.reject(err.reason),
          );
        } else if (mode === 'range-request') {
          const openDocumentWithRangeRequestTask = await this.openDocumentWithRangeRequest(
            file,
            password,
          );
          openDocumentWithRangeRequestTask.wait(
            (doc) => task.resolve(doc),
            (err) => task.reject(err.reason),
          );
        } else {
          // mode: 'auto'
          const { supportsRanges, fileLength, content } = await this.checkRangeSupport(file.url);
          if (supportsRanges) {
            const openDocumentWithRangeRequestTask = await this.openDocumentWithRangeRequest(
              file,
              password,
              fileLength,
            );
            openDocumentWithRangeRequestTask.wait(
              (doc) => task.resolve(doc),
              (err) => task.reject(err.reason),
            );
          } else if (content) {
            // If we already have the content from the range check, use it
            const pdfFile: PdfFile = { id: file.id, content };
            this.openDocumentFromBuffer(pdfFile, password).wait(
              (doc) => task.resolve(doc),
              (err) => task.reject(err.reason),
            );
          } else {
            const fetchFullTask = await this.fetchFullAndOpen(file, password);
            fetchFullTask.wait(
              (doc) => task.resolve(doc),
              (err) => task.reject(err.reason),
            );
          }
        }
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
      content: arrayBuf,
    };

    // 3. call openDocumentFromBuffer (the method you already have)
    //    that returns a PdfTask, but let's wrap it in a Promise
    return this.openDocumentFromBuffer(pdfFile, password);
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
  openDocumentFromBuffer(file: PdfFile, password: string = '') {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'openDocumentFromBuffer', file, password);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `OpenDocumentFromBuffer`, 'Begin', file.id);
    const array = new Uint8Array(file.content);
    const length = array.length;
    const filePtr = this.malloc(length);
    this.pdfiumModule.pdfium.HEAPU8.set(array, filePtr);

    const docPtr = this.pdfiumModule.FPDF_LoadMemDocument(filePtr, length, password);

    if (!docPtr) {
      const lastError = this.pdfiumModule.FPDF_GetLastError();
      this.logger.error(LOG_SOURCE, LOG_CATEGORY, `FPDF_LoadMemDocument failed with ${lastError}`);
      this.free(filePtr);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `OpenDocumentFromBuffer`, 'End', file.id);

      return PdfTaskHelper.reject<PdfDocumentObject>({
        code: lastError,
        message: `FPDF_LoadMemDocument failed`,
      });
    }

    const pageCount = this.pdfiumModule.FPDF_GetPageCount(docPtr);

    const pages: PdfPageObject[] = [];
    const sizePtr = this.malloc(8);
    for (let index = 0; index < pageCount; index++) {
      const result = this.pdfiumModule.FPDF_GetPageSizeByIndexF(docPtr, index, sizePtr);
      if (!result) {
        const lastError = this.pdfiumModule.FPDF_GetLastError();
        this.logger.error(
          LOG_SOURCE,
          LOG_CATEGORY,
          `FPDF_GetPageSizeByIndexF failed with ${lastError}`,
        );
        this.free(sizePtr);
        this.pdfiumModule.FPDF_CloseDocument(docPtr);
        this.free(filePtr);
        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `OpenDocumentFromBuffer`, 'End', file.id);
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
    this.free(sizePtr);

    const pdfDoc = {
      id: file.id,
      pageCount,
      pages,
    };

    this.cache.setDocument(file.id, filePtr, docPtr);

    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `OpenDocumentFromBuffer`, 'End', file.id);

    return PdfTaskHelper.resolve(pdfDoc);
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.openDocumentFromLoader}
   *
   * @public
   */
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
    const fileAccessPtr = this.malloc(structSize);

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
      this.free(fileAccessPtr);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `OpenDocumentFromLoader`, 'End', file.id);

      return PdfTaskHelper.reject<PdfDocumentObject>({
        code: lastError,
        message: `FPDF_LoadCustomDocument failed`,
      });
    }

    const pageCount = this.pdfiumModule.FPDF_GetPageCount(docPtr);

    const pages: PdfPageObject[] = [];
    const sizePtr = this.malloc(8);
    for (let index = 0; index < pageCount; index++) {
      const result = this.pdfiumModule.FPDF_GetPageSizeByIndexF(docPtr, index, sizePtr);
      if (!result) {
        const lastError = this.pdfiumModule.FPDF_GetLastError();
        this.logger.error(
          LOG_SOURCE,
          LOG_CATEGORY,
          `FPDF_GetPageSizeByIndexF failed with ${lastError}`,
        );
        this.free(sizePtr);
        this.pdfiumModule.FPDF_CloseDocument(docPtr);
        this.free(fileAccessPtr);
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
    this.free(sizePtr);

    const pdfDoc = {
      id: file.id,
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
  getMetadata(doc: PdfDocumentObject) {
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

    const metadata = {
      title: this.readMetaText(ctx.docPtr, 'Title'),
      author: this.readMetaText(ctx.docPtr, 'Author'),
      subject: this.readMetaText(ctx.docPtr, 'Subject'),
      keywords: this.readMetaText(ctx.docPtr, 'Keywords'),
      producer: this.readMetaText(ctx.docPtr, 'Producer'),
      creator: this.readMetaText(ctx.docPtr, 'Creator'),
      creationDate: this.readMetaText(ctx.docPtr, 'CreationDate'),
      modificationDate: this.readMetaText(ctx.docPtr, 'ModDate'),
    };

    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `GetMetadata`, 'End', doc.id);

    return PdfTaskHelper.resolve(metadata);
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
   * {@inheritDoc @embedpdf/models!PdfEngine.renderPage}
   *
   * @public
   */
  renderPage(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    scaleFactor: number = 1,
    rotation: Rotation = Rotation.Degree0,
    dpr: number = 1,
    options: PdfRenderOptions = { withAnnotations: false },
    imageType: ImageConversionTypes = 'image/webp',
  ): PdfTask<T> {
    const task = new Task<T, PdfErrorReason>();

    this.logger.debug(
      LOG_SOURCE,
      LOG_CATEGORY,
      'renderPage',
      doc,
      page,
      scaleFactor,
      rotation,
      dpr,
      options,
    );
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `RenderPage`, 'Begin', `${doc.id}-${page.index}`);

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `RenderPage`, 'End', `${doc.id}-${page.index}`);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const imageData = this.renderPageRectToImageData(
      ctx,
      page,
      {
        origin: { x: 0, y: 0 },
        size: page.size,
      },
      scaleFactor,
      rotation,
      dpr,
      options,
    );
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `RenderPage`, 'End', `${doc.id}-${page.index}`);

    this.imageDataConverter(imageData, imageType).then((blob) => task.resolve(blob));

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
    scaleFactor: number,
    rotation: Rotation,
    dpr: number,
    rect: Rect,
    options: PdfRenderOptions,
    imageType: ImageConversionTypes = 'image/webp',
  ): PdfTask<T> {
    const task = new Task<T, PdfErrorReason>();

    this.logger.debug(
      LOG_SOURCE,
      LOG_CATEGORY,
      'renderPageRect',
      doc,
      page,
      scaleFactor,
      rotation,
      dpr,
      rect,
      options,
    );
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `RenderPageRect`,
      'Begin',
      `${doc.id}-${page.index}`,
    );

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        `RenderPageRect`,
        'End',
        `${doc.id}-${page.index}`,
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const imageData = this.renderPageRectToImageData(
      ctx,
      page,
      rect,
      scaleFactor,
      rotation,
      dpr,
      options,
    );
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `RenderPageRect`, 'End', `${doc.id}-${page.index}`);

    this.imageDataConverter(imageData, imageType).then((blob) => task.resolve(blob));

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getAllAnnotations}
   *
   * @public
   */
  getAllAnnotations(doc: PdfDocumentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getAllAnnotations', doc);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `GetAllAnnotations`, 'Begin', doc.id);

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `GetAllAnnotations`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    const annotations = this.readAllAnnotations(doc, ctx);

    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `GetAllAnnotations`, 'End', doc.id);

    return PdfTaskHelper.resolve(annotations);
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
  createPageAnnotation(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
  ): PdfTask<number> {
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
    const annotationPtr = this.pdfiumModule.FPDFPage_CreateAnnot(pageCtx.pagePtr, annotation.type);
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
          annotation.rect,
          annotation.contents,
        );
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

    const annotId = this.pdfiumModule.FPDFPage_GetAnnotIndex(pageCtx.pagePtr, annotationPtr);

    this.pdfiumModule.FPDFPage_CloseAnnot(annotationPtr);
    pageCtx.release();
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `CreatePageAnnotation`,
      'End',
      `${doc.id}-${page.index}`,
    );

    return annotId >= 0
      ? PdfTaskHelper.resolve<number>(annotId)
      : PdfTaskHelper.reject<number>({
          code: PdfErrorCode.CantCreateAnnot,
          message: 'annotation created but index could not be determined',
        });
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
    const annotPtr = this.pdfiumModule.FPDFPage_GetAnnot(pageCtx.pagePtr, annotation.id);
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
        /* drop every page-object inside the annot */
        for (let i = this.pdfiumModule.FPDFAnnot_GetObjectCount(annotPtr) - 1; i >= 0; i--) {
          this.pdfiumModule.FPDFAnnot_RemoveObject(annotPtr, i);
        }
        ok = this.addStampContent(
          ctx.docPtr,
          page,
          pageCtx.pagePtr,
          annotPtr,
          annotation.rect,
          annotation.contents,
        );
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
    result = this.pdfiumModule.FPDFPage_RemoveAnnot(pageCtx.pagePtr, annotation.id);
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
  getPageTextRects(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    scaleFactor: number,
    rotation: Rotation,
  ) {
    this.logger.debug(
      LOG_SOURCE,
      LOG_CATEGORY,
      'getPageTextRects',
      doc,
      page,
      scaleFactor,
      rotation,
    );
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
    scaleFactor: number,
    rotation: Rotation,
    dpr: number,
  ): PdfTask<T> {
    this.logger.debug(
      LOG_SOURCE,
      LOG_CATEGORY,
      'renderThumbnail',
      doc,
      page,
      scaleFactor,
      rotation,
      dpr,
    );
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

    scaleFactor = Math.max(scaleFactor, 0.5);
    const result = this.renderPage(doc, page, scaleFactor, rotation, dpr, {
      withAnnotations: true,
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
    const sizePtr = this.malloc(8);
    if (!this.pdfiumModule.FPDFAttachment_GetFile(attachmentPtr, 0, 0, sizePtr)) {
      this.free(sizePtr);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `ReadAttachmentContent`, 'End', doc.id);
      return PdfTaskHelper.reject({
        code: PdfErrorCode.CantReadAttachmentSize,
        message: 'can not read attachment size',
      });
    }
    const size = this.pdfiumModule.pdfium.getValue(sizePtr, 'i64');

    const contentPtr = this.malloc(size);
    if (!this.pdfiumModule.FPDFAttachment_GetFile(attachmentPtr, contentPtr, size, sizePtr)) {
      this.free(sizePtr);
      this.free(contentPtr);
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

    this.free(sizePtr);
    this.free(contentPtr);
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

    const annotationPtr = this.pdfiumModule.FPDFPage_GetAnnot(pageCtx.pagePtr, annotation.id);

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
          const textPtr = this.malloc(length);
          this.pdfiumModule.pdfium.stringToUTF16(value.text, textPtr, length);
          this.pdfiumModule.FORM_ReplaceSelection(formHandle, pageCtx.pagePtr, textPtr);
          this.free(textPtr);
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
    flag: PdfPageFlattenFlag,
  ): PdfTask<PdfPageFlattenResult> {
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

    const pageIndexesPtr = this.malloc(pageIndexes.length * 4);
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
      const bufferPtr = this.malloc((charCount + 1) * 2);
      this.pdfiumModule.FPDFText_GetText(textPagePtr, 0, charCount, bufferPtr);
      const text = this.pdfiumModule.pdfium.UTF16ToString(bufferPtr);
      this.free(bufferPtr);
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
          const bufPtr = this.malloc(2 * (slice.charCount + 1)); // UTF-16 + NIL
          this.pdfiumModule.FPDFText_GetText(textPagePtr, slice.charIndex, slice.charCount, bufPtr);
          out[pos] = stripPdfUnwantedMarkers(this.pdfiumModule.pdfium.UTF16ToString(bufPtr));
          this.free(bufPtr);
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

    const ptrs: { docPtr: number; filePtr: number }[] = [];
    for (const file of files.reverse()) {
      const array = new Uint8Array(file.content);
      const length = array.length;
      const filePtr = this.malloc(length);
      this.pdfiumModule.pdfium.HEAPU8.set(array, filePtr);

      const docPtr = this.pdfiumModule.FPDF_LoadMemDocument(filePtr, length, '');
      if (!docPtr) {
        const lastError = this.pdfiumModule.FPDF_GetLastError();
        this.logger.error(
          LOG_SOURCE,
          LOG_CATEGORY,
          `FPDF_LoadMemDocument failed with ${lastError}`,
        );
        this.free(filePtr);

        for (const ptr of ptrs) {
          this.pdfiumModule.FPDF_CloseDocument(ptr.docPtr);
          this.free(ptr.filePtr);
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
          this.free(ptr.filePtr);
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
      this.free(ptr.filePtr);
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
   * Memory allocation
   * @param size - size of memory space
   * @returns pointer to memory space
   *
   * @public
   */
  malloc(size: number) {
    const ptr = this.pdfiumModule.pdfium.wasmExports.malloc(size);
    for (let i = 0; i < size; i++) {
      this.pdfiumModule.pdfium.HEAP8[ptr + i] = 0;
    }

    return ptr;
  }

  /**
   * Free memory space
   * @param ptr pointer to memory space
   *
   * @public
   */
  free(ptr: number) {
    this.pdfiumModule.pdfium.wasmExports.free(ptr);
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
  addInkStroke(
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    annotation: PdfInkAnnoObject,
  ) {
    if (
      !this.setBorderStyle(annotationPtr, PdfAnnotationBorderStyle.SOLID, annotation.strokeWidth)
    ) {
      return false;
    }
    if (!this.setPageAnnoRect(page, pagePtr, annotationPtr, annotation.rect)) {
      return false;
    }
    if (!this.setInkList(page, annotationPtr, annotation.inkList)) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, 'T', annotation.author || '')) {
      return false;
    }
    if (!this.setAnnotString(annotationPtr, 'M', dateToPdfDate(annotation.modified))) {
      return false;
    }
    if (
      !this.setAnnotationColor(
        annotationPtr,
        {
          color: annotation.color ?? '#FFFF00',
          opacity: annotation.opacity ?? 1,
        },
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
    if (!this.setPageAnnoRect(page, pagePtr, annotationPtr, annotation.rect)) {
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
    if (!this.setAnnotString(annotationPtr, 'M', dateToPdfDate(annotation.modified))) {
      return false;
    }
    if (
      !this.setAnnotationColor(
        annotationPtr,
        {
          color: annotation.color ?? '#FFFF00',
          opacity: annotation.opacity ?? 1,
        },
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
    rect: Rect,
    contents: PdfStampAnnoObjectContents,
  ) {
    for (const content of contents) {
      switch (content.type) {
        case PdfPageObjectType.IMAGE:
          return this.addImageObject(
            docPtr,
            page,
            pagePtr,
            annotationPtr,
            rect.origin,
            content.imageData,
          );
      }
    }

    return false;
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
    position: Position,
    imageData: ImageData,
  ) {
    const bytesPerPixel = 4;
    const pixelCount = imageData.width * imageData.height;

    const bitmapBufferPtr = this.malloc(bytesPerPixel * pixelCount);
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
      this.free(bitmapBufferPtr);
      return false;
    }

    const imageObjectPtr = this.pdfiumModule.FPDFPageObj_NewImageObj(docPtr);
    if (!imageObjectPtr) {
      this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr);
      this.free(bitmapBufferPtr);
      return false;
    }

    if (!this.pdfiumModule.FPDFImageObj_SetBitmap(pagePtr, 0, imageObjectPtr, bitmapPtr)) {
      this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr);
      this.pdfiumModule.FPDFPageObj_Destroy(imageObjectPtr);
      this.free(bitmapBufferPtr);
      return false;
    }

    const matrixPtr = this.malloc(6 * 4);
    this.pdfiumModule.pdfium.setValue(matrixPtr, imageData.width, 'float');
    this.pdfiumModule.pdfium.setValue(matrixPtr + 4, 0, 'float');
    this.pdfiumModule.pdfium.setValue(matrixPtr + 8, 0, 'float');
    this.pdfiumModule.pdfium.setValue(matrixPtr + 12, imageData.height, 'float');
    this.pdfiumModule.pdfium.setValue(matrixPtr + 16, 0, 'float');
    this.pdfiumModule.pdfium.setValue(matrixPtr + 20, 0, 'float');
    if (!this.pdfiumModule.FPDFPageObj_SetMatrix(imageObjectPtr, matrixPtr)) {
      this.free(matrixPtr);
      this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr);
      this.pdfiumModule.FPDFPageObj_Destroy(imageObjectPtr);
      this.free(bitmapBufferPtr);
      return false;
    }
    this.free(matrixPtr);

    this.pdfiumModule.FPDFPageObj_Transform(imageObjectPtr, 1, 0, 0, 1, position.x, position.y);

    if (!this.pdfiumModule.FPDFAnnot_AppendObject(annotationPtr, imageObjectPtr)) {
      this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr);
      this.pdfiumModule.FPDFPageObj_Destroy(imageObjectPtr);
      this.free(bitmapBufferPtr);
      return false;
    }

    this.pdfiumModule.FPDFPage_GenerateContent(pagePtr);
    this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr);
    this.free(bitmapBufferPtr);

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
    const dataPtr = this.malloc(size);
    this.pdfiumModule.PDFiumExt_GetFileWriterData(writerPtr, dataPtr, size);
    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    for (let i = 0; i < size; i++) {
      view.setInt8(i, this.pdfiumModule.pdfium.getValue(dataPtr + i, 'i8'));
    }
    this.free(dataPtr);
    this.pdfiumModule.PDFiumExt_CloseFileWriter(writerPtr);

    return buffer;
  }

  /**
   * Read metadata from pdf document
   * @param docPtr - pointer to pdf document
   * @param key - key of metadata field
   * @returns metadata value
   *
   * @private
   */
  readMetaText(docPtr: number, key: string) {
    return readString(
      this.pdfiumModule.pdfium,
      (buffer, bufferLength) => {
        return this.pdfiumModule.FPDF_GetMetaText(docPtr, key, buffer, bufferLength);
      },
      this.pdfiumModule.pdfium.UTF16ToString,
    );
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
      const topPtr = this.malloc(8);
      const leftPtr = this.malloc(8);
      const rightPtr = this.malloc(8);
      const bottomPtr = this.malloc(8);
      const isSucceed = this.pdfiumModule.FPDFText_GetRect(
        textPagePtr,
        i,
        leftPtr,
        topPtr,
        rightPtr,
        bottomPtr,
      );
      if (!isSucceed) {
        this.free(leftPtr);
        this.free(topPtr);
        this.free(rightPtr);
        this.free(bottomPtr);
        continue;
      }

      const left = this.pdfiumModule.pdfium.getValue(leftPtr, 'double');
      const top = this.pdfiumModule.pdfium.getValue(topPtr, 'double');
      const right = this.pdfiumModule.pdfium.getValue(rightPtr, 'double');
      const bottom = this.pdfiumModule.pdfium.getValue(bottomPtr, 'double');

      this.free(leftPtr);
      this.free(topPtr);
      this.free(rightPtr);
      this.free(bottomPtr);

      const deviceXPtr = this.malloc(4);
      const deviceYPtr = this.malloc(4);
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
      this.free(deviceXPtr);
      this.free(deviceYPtr);

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
      const textBuffer = this.malloc(bytesCount);
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
      this.free(textBuffer);

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
        const textBufferPtr = this.malloc(bytesCount);
        const flagsPtr = this.malloc(4);
        this.pdfiumModule.FPDFText_GetFontInfo(
          textPagePtr,
          charIndex,
          textBufferPtr,
          bytesCount,
          flagsPtr,
        );
        fontFamily = this.pdfiumModule.pdfium.UTF8ToString(textBufferPtr);
        this.free(textBufferPtr);
        this.free(flagsPtr);
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
    const dx1Ptr = this.malloc(4);
    const dy1Ptr = this.malloc(4);
    const dx2Ptr = this.malloc(4);
    const dy2Ptr = this.malloc(4);
    const rectPtr = this.malloc(16); // 4 floats = 16 bytes

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
    [rectPtr, dx1Ptr, dy1Ptr, dx2Ptr, dy2Ptr].forEach((p) => this.free(p));

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
    const topPtr = this.malloc(8);
    const leftPtr = this.malloc(8);
    const bottomPtr = this.malloc(8);
    const rightPtr = this.malloc(8);
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

      const deviceXPtr = this.malloc(4);
      const deviceYPtr = this.malloc(4);
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
      this.free(deviceXPtr);
      this.free(deviceYPtr);

      width = Math.ceil(Math.abs(right - left));
      height = Math.ceil(Math.abs(top - bottom));
    }
    this.free(topPtr);
    this.free(leftPtr);
    this.free(bottomPtr);
    this.free(rightPtr);

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
   * @param page - page info
   * @param docPtr - pointer to pdf document
   * @param pagePtr - pointer to pdf page
   * @param textPagePtr - pointe to pdf text page
   * @param scaleFactor - scale factor
   * @param rotation - rotation angle
   * @returns annotations on the pdf page
   *
   * @private
   */
  private readPageAnnotations(ctx: DocumentContext, page: PdfPageObject) {
    const pageCtx = ctx.acquirePage(page.index);
    const annotationCount = this.pdfiumModule.FPDFPage_GetAnnotCount(pageCtx.pagePtr);

    const annotations: PdfAnnotationObject[] = [];
    for (let i = 0; i < annotationCount; i++) {
      pageCtx.withAnnotation(i, (annotPtr) => {
        const annotation = this.readPageAnnotation(page, pageCtx, annotPtr, i);
        if (annotation) {
          annotations.push(annotation);
        }
      });
    }

    return annotations;
  }

  /**
   * Read pdf annotation from pdf document
   * @param page  - pdf page infor
   * @param docPtr - pointer to pdf document object
   * @param pagePtr - pointer to pdf page object
   * @param  textPagePtr - pointer to pdf text page object
   * @param formHandle - form handle
   * @param index - index of annotation in the pdf page
   * @param scaleFactor  - factor of scalling
   * @param rotation  - rotation angle
   * @returns pdf annotation
   *
   * @private
   */
  private readPageAnnotation(
    page: PdfPageObject,
    pageCtx: PageContext,
    annotationPtr: number,
    index: number,
  ) {
    const subType = this.pdfiumModule.FPDFAnnot_GetSubtype(
      annotationPtr,
    ) as PdfAnnotationObject['type'];
    let annotation: PdfAnnotationObject | undefined;
    switch (subType) {
      case PdfAnnotationSubtype.TEXT:
        {
          annotation = this.readPdfTextAnno(page, pageCtx.pagePtr, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.FREETEXT:
        {
          annotation = this.readPdfFreeTextAnno(page, pageCtx.pagePtr, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.LINK:
        {
          annotation = this.readPdfLinkAnno(
            page,
            pageCtx.docPtr,
            pageCtx.pagePtr,
            pageCtx.getTextPage(),
            annotationPtr,
            index,
          );
        }
        break;
      case PdfAnnotationSubtype.WIDGET:
        {
          annotation = this.readPdfWidgetAnno(
            page,
            pageCtx.pagePtr,
            annotationPtr,
            pageCtx.getFormHandle(),
            index,
          );
        }
        break;
      case PdfAnnotationSubtype.FILEATTACHMENT:
        {
          annotation = this.readPdfFileAttachmentAnno(page, pageCtx.pagePtr, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.INK:
        {
          annotation = this.readPdfInkAnno(page, pageCtx.pagePtr, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.POLYGON:
        {
          annotation = this.readPdfPolygonAnno(page, pageCtx.pagePtr, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.POLYLINE:
        {
          annotation = this.readPdfPolylineAnno(page, pageCtx.pagePtr, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.LINE:
        {
          annotation = this.readPdfLineAnno(page, pageCtx.pagePtr, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.HIGHLIGHT:
        annotation = this.readPdfHighlightAnno(page, pageCtx.pagePtr, annotationPtr, index);
        break;
      case PdfAnnotationSubtype.STAMP:
        {
          annotation = this.readPdfStampAnno(
            pageCtx.docPtr,
            page,
            pageCtx.pagePtr,
            annotationPtr,
            index,
          );
        }
        break;
      case PdfAnnotationSubtype.SQUARE:
        {
          annotation = this.readPdfSquareAnno(page, pageCtx.pagePtr, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.CIRCLE:
        {
          annotation = this.readPdfCircleAnno(page, pageCtx.pagePtr, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.UNDERLINE:
        {
          annotation = this.readPdfUnderlineAnno(page, pageCtx.pagePtr, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.SQUIGGLY:
        {
          annotation = this.readPdfSquigglyAnno(page, pageCtx.pagePtr, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.STRIKEOUT:
        {
          annotation = this.readPdfStrikeOutAnno(page, pageCtx.pagePtr, annotationPtr, index);
        }
        break;
      case PdfAnnotationSubtype.CARET:
        {
          annotation = this.readPdfCaretAnno(page, pageCtx.pagePtr, annotationPtr, index);
        }
        break;
      default:
        {
          annotation = this.readPdfAnno(page, pageCtx.pagePtr, subType, annotationPtr, index);
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
  ): PdfAlphaColor | undefined {
    const rPtr = this.malloc(4);
    const gPtr = this.malloc(4);
    const bPtr = this.malloc(4);
    const aPtr = this.malloc(4);

    // colourType 0 = "colour" (stroke/fill); other types are interior/border
    const ok = this.pdfiumModule.EPDFAnnot_GetColor(
      annotationPtr,
      colorType,
      rPtr,
      gPtr,
      bPtr,
      aPtr,
    );

    let colour: PdfAlphaColor | undefined;

    if (ok) {
      colour = {
        red: this.pdfiumModule.pdfium.getValue(rPtr, 'i32') & 0xff,
        green: this.pdfiumModule.pdfium.getValue(gPtr, 'i32') & 0xff,
        blue: this.pdfiumModule.pdfium.getValue(bPtr, 'i32') & 0xff,
        alpha: this.pdfiumModule.pdfium.getValue(aPtr, 'i32') & 0xff, // 0 = transparent, 255 = opaque
      };
    }

    this.free(rPtr);
    this.free(gPtr);
    this.free(bPtr);
    this.free(aPtr);

    return colour;
  }

  /* --------------------------------------------------------------------------- */
  /**
   * Resolve the visible fill colour for **Highlight / Underline / StrikeOut /
   * Squiggly** markup annotations.
   *
   * Resolution order (first non-`undefined` wins):
   *  1. `/C` dictionary entry – fast, present in Acrobat / Office PDFs
   *  2. Appearance-stream objects – drills into paths & nested forms
   *  3. Hard-coded fallback (Acrobat-style opaque yellow)
   *
   * @param annotationPtr - pointer to an `FPDF_ANNOTATION`
   * @param fallback      - colour to use when the PDF stores no tint at all
   * @returns WebAlphaColor with hex color and opacity (0-1)
   *
   * @private
   */
  private resolveAnnotationColor(
    annotationPtr: number,
    colorType: PdfAnnotationColorType = PdfAnnotationColorType.Color,
    fallback: PdfAlphaColor = { red: 255, green: 245, blue: 155, alpha: 255 },
  ): WebAlphaColor {
    const pdfColor = this.readAnnotationColor(annotationPtr, colorType) ?? fallback;

    return pdfAlphaColorToWebAlphaColor(pdfColor);
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
    webAlphaColor: WebAlphaColor,
    colorType: PdfAnnotationColorType = PdfAnnotationColorType.Color,
  ): boolean {
    const pdfAlphaColor = webAlphaColorToPdfAlphaColor(webAlphaColor);

    return this.pdfiumModule.EPDFAnnot_SetColor(
      annotationPtr,
      colorType,
      pdfAlphaColor.red & 0xff,
      pdfAlphaColor.green & 0xff,
      pdfAlphaColor.blue & 0xff,
      (pdfAlphaColor.alpha ?? 255) & 0xff,
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
    const widthPtr = this.malloc(4);
    let width = 0;
    let style: PdfAnnotationBorderStyle = PdfAnnotationBorderStyle.UNKNOWN;
    let ok = false;

    style = this.pdfiumModule.EPDFAnnot_GetBorderStyle(annotationPtr, widthPtr);
    width = this.pdfiumModule.pdfium.getValue(widthPtr, 'float');
    ok = style !== PdfAnnotationBorderStyle.UNKNOWN;
    this.free(widthPtr);
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
    const intensityPtr = this.malloc(4);

    const ok = !!this.pdfiumModule.EPDFAnnot_GetBorderEffect(annotationPtr, intensityPtr);

    const intensity = ok ? this.pdfiumModule.pdfium.getValue(intensityPtr, 'float') : 0;

    this.free(intensityPtr);
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
    const lPtr = this.malloc(4);
    const tPtr = this.malloc(4);
    const rPtr = this.malloc(4);
    const bPtr = this.malloc(4);

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
    this.free(lPtr);
    this.free(tPtr);
    this.free(rPtr);
    this.free(bPtr);

    return { ok, left, top, right, bottom };
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
    const arrPtr = this.malloc(4 * count);
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

    this.free(arrPtr);
    return { ok: okNative, pattern };
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
      const quadPtr = this.malloc(FS_QUADPOINTSF_SIZE);

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

      this.free(quadPtr);
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
    const buf = this.malloc(FS_QUADPOINTSF_SIZE);

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
        this.free(buf);
        return false;
      }
    }

    /* 2. append new quads if rects.length > count                             */
    for (let i = count; i < rects.length; i++) {
      writeQuad(rects[i]);
      if (!this.pdfiumModule.FPDFAnnot_AppendAttachmentPoints(annotPtr, buf)) {
        this.free(buf);
        return false;
      }
    }

    this.free(buf);
    return true;
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
        const pointsPtr = this.malloc(pointsCount * pointMemorySize);
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

        this.free(pointsPtr);
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
      const inkPointsPtr = this.malloc(inkPointsCount * 8);
      for (let i = 0; i < inkPointsCount; i++) {
        const point = inkStroke.points[i];
        const { x, y } = this.convertDevicePointToPagePoint(page, point);

        this.pdfiumModule.pdfium.setValue(inkPointsPtr + i * 8, x, 'float');
        this.pdfiumModule.pdfium.setValue(inkPointsPtr + i * 8 + 4, y, 'float');
      }

      if (
        this.pdfiumModule.FPDFAnnot_AddInkStroke(annotationPtr, inkPointsPtr, inkPointsCount) === -1
      ) {
        this.free(inkPointsPtr);
        return false;
      }

      this.free(inkPointsPtr);
    }

    return true;
  }

  /**
   * Read pdf text annotation
   * @param page  - pdf page infor
   * @param pagePtr - pointer to pdf page object
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf text annotation
   *
   * @private
   */
  private readPdfTextAnno(
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    index: number,
  ): PdfTextAnnoObject | undefined {
    const annoRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pagePtr, annoRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modifiedRaw = this.getAnnotString(annotationPtr, 'M');
    const modified = pdfDateToDate(modifiedRaw);

    const contents = this.getAnnotString(annotationPtr, 'Contents') || '';
    const state = this.getAnnotString(annotationPtr, 'State') as PdfAnnotationState;
    const stateModel = this.getAnnotString(annotationPtr, 'StateModel') as PdfAnnotationStateModel;
    const webAlphaColor = this.resolveAnnotationColor(annotationPtr);
    const inReplyToId = this.getInReplyToId(pagePtr, annotationPtr);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.TEXT,
      contents,
      ...webAlphaColor,
      rect,
      inReplyToId,
      author,
      modified,
      state,
      stateModel,
    };
  }

  /**
   * Read pdf freetext annotation
   * @param page  - pdf page infor
   * @param pagePtr - pointer to pdf page object
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf freetext annotation
   *
   * @private
   */
  private readPdfFreeTextAnno(
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    index: number,
  ): PdfFreeTextAnnoObject | undefined {
    const annoRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pagePtr, annoRect);
    const contents = this.getAnnotString(annotationPtr, 'Contents') || '';
    const author = this.getAnnotString(annotationPtr, 'T');
    const modifiedRaw = this.getAnnotString(annotationPtr, 'M');
    const modified = pdfDateToDate(modifiedRaw);
    const richContent = this.getAnnotRichContent(annotationPtr);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.FREETEXT,
      richContent,
      contents,
      author,
      modified,
      rect,
    };
  }

  /**
   * Read pdf link annotation from pdf document
   * @param page  - pdf page infor
   * @param docPtr - pointer to pdf document object
   * @param pagePtr - pointer to pdf page object
   * @param  textPagePtr - pointer to pdf text page object
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf link annotation
   *
   * @private
   */
  private readPdfLinkAnno(
    page: PdfPageObject,
    docPtr: number,
    pagePtr: number,
    textPagePtr: number,
    annotationPtr: number,
    index: number,
  ): PdfLinkAnnoObject | undefined {
    const linkPtr = this.pdfiumModule.FPDFAnnot_GetLink(annotationPtr);
    if (!linkPtr) {
      return;
    }

    const annoRect = this.readPageAnnoRect(annotationPtr);
    const { left, top, right, bottom } = annoRect;
    const rect = this.convertPageRectToDeviceRect(page, pagePtr, annoRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modifiedRaw = this.getAnnotString(annotationPtr, 'M');
    const modified = pdfDateToDate(modifiedRaw);

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
    const textBufferPtr = this.malloc(bytesCount);
    this.pdfiumModule.FPDFText_GetBoundedText(
      textPagePtr,
      left,
      top,
      right,
      bottom,
      textBufferPtr,
      utf16Length,
    );
    const text = this.pdfiumModule.pdfium.UTF16ToString(textBufferPtr);
    this.free(textBufferPtr);

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
      text,
      target,
      rect,
      author,
      modified,
    };
  }

  /**
   * Read pdf widget annotation
   * @param page  - pdf page infor
   * @param pagePtr - pointer to pdf page object
   * @param annotationPtr - pointer to pdf annotation
   * @param formHandle - form handle
   * @param index  - index of annotation in the pdf page
   * @returns pdf widget annotation
   *
   * @private
   */
  private readPdfWidgetAnno(
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    formHandle: number,
    index: number,
  ): PdfWidgetAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pagePtr, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modifiedRaw = this.getAnnotString(annotationPtr, 'M');
    const modified = pdfDateToDate(modifiedRaw);

    const field = this.readPdfWidgetAnnoField(formHandle, annotationPtr);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.WIDGET,
      rect,
      field,
      author,
      modified,
    };
  }

  /**
   * Read pdf file attachment annotation
   * @param page  - pdf page infor
   * @param pagePtr - pointer to pdf page object
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf file attachment annotation
   *
   * @private
   */
  private readPdfFileAttachmentAnno(
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    index: number,
  ): PdfFileAttachmentAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pagePtr, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modifiedRaw = this.getAnnotString(annotationPtr, 'M');
    const modified = pdfDateToDate(modifiedRaw);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.FILEATTACHMENT,
      rect,
      author,
      modified,
    };
  }

  /**
   * Read pdf ink annotation
   * @param page  - pdf page infor
   * @param pagePtr - pointer to pdf page object
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf ink annotation
   *
   * @private
   */
  private readPdfInkAnno(
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    index: number,
  ): PdfInkAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pagePtr, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modifiedRaw = this.getAnnotString(annotationPtr, 'M');
    const modified = pdfDateToDate(modifiedRaw);
    const webAlphaColor = this.resolveAnnotationColor(annotationPtr);
    const { width: strokeWidth } = this.getBorderStyle(annotationPtr);
    const inkList = this.getInkList(page, annotationPtr);
    const blendMode = this.pdfiumModule.EPDFAnnot_GetBlendMode(annotationPtr);
    const intent = this.getAnnotIntent(annotationPtr);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.INK,
      ...(intent && { intent }),
      blendMode,
      ...webAlphaColor,
      strokeWidth,
      rect,
      inkList,
      author,
      modified,
    };
  }

  /**
   * Read pdf polygon annotation
   * @param page  - pdf page infor
   * @param pagePtr - pointer to pdf page object
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf polygon annotation
   *
   * @private
   */
  private readPdfPolygonAnno(
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    index: number,
  ): PdfPolygonAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pagePtr, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modifiedRaw = this.getAnnotString(annotationPtr, 'M');
    const modified = pdfDateToDate(modifiedRaw);
    const vertices = this.readPdfAnnoVertices(page, pagePtr, annotationPtr);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.POLYGON,
      rect,
      vertices,
      author,
      modified,
    };
  }

  /**
   * Read pdf polyline annotation
   * @param page  - pdf page infor
   * @param pagePtr - pointer to pdf page object
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf polyline annotation
   *
   * @private
   */
  private readPdfPolylineAnno(
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    index: number,
  ): PdfPolylineAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pagePtr, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modifiedRaw = this.getAnnotString(annotationPtr, 'M');
    const modified = pdfDateToDate(modifiedRaw);
    const vertices = this.readPdfAnnoVertices(page, pagePtr, annotationPtr);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.POLYLINE,
      rect,
      vertices,
      author,
      modified,
    };
  }

  /**
   * Read pdf line annotation
   * @param page  - pdf page infor
   * @param pagePtr - pointer to pdf page object
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf line annotation
   *
   * @private
   */
  private readPdfLineAnno(
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    index: number,
  ): PdfLineAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pagePtr, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modifiedRaw = this.getAnnotString(annotationPtr, 'M');
    const modified = pdfDateToDate(modifiedRaw);
    const startPointPtr = this.malloc(8);
    const endPointPtr = this.malloc(8);

    this.pdfiumModule.FPDFAnnot_GetLine(annotationPtr, startPointPtr, endPointPtr);

    const startPointX = this.pdfiumModule.pdfium.getValue(startPointPtr, 'float');
    const startPointY = this.pdfiumModule.pdfium.getValue(startPointPtr + 4, 'float');
    const startPoint = this.convertPagePointToDevicePoint(page, {
      x: startPointX,
      y: startPointY,
    });

    const endPointX = this.pdfiumModule.pdfium.getValue(endPointPtr, 'float');
    const endPointY = this.pdfiumModule.pdfium.getValue(endPointPtr + 4, 'float');
    const endPoint = this.convertPagePointToDevicePoint(page, {
      x: endPointX,
      y: endPointY,
    });

    this.free(startPointPtr);
    this.free(endPointPtr);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.LINE,
      rect,
      startPoint,
      endPoint,
      author,
      modified,
    };
  }

  /**
   * Read pdf highlight annotation
   * @param page  - pdf page infor
   * @param pagePtr - pointer to pdf page object
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf highlight annotation
   *
   * @private
   */
  private readPdfHighlightAnno(
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    index: number,
  ): PdfHighlightAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pagePtr, pageRect);
    const segmentRects = this.getQuadPointsAnno(page, annotationPtr);
    const webAlphaColor = this.resolveAnnotationColor(annotationPtr);
    const blendMode = this.pdfiumModule.EPDFAnnot_GetBlendMode(annotationPtr);

    const author = this.getAnnotString(annotationPtr, 'T');
    const modifiedRaw = this.getAnnotString(annotationPtr, 'M');
    const modified = pdfDateToDate(modifiedRaw);
    const contents = this.getAnnotString(annotationPtr, 'Contents') || '';

    return {
      pageIndex: page.index,
      id: index,
      blendMode,
      type: PdfAnnotationSubtype.HIGHLIGHT,
      rect,
      contents,
      segmentRects,
      ...webAlphaColor,
      author,
      modified,
    };
  }

  /**
   * Read pdf underline annotation
   * @param page  - pdf page infor
   * @param pagePtr - pointer to pdf page object
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf underline annotation
   *
   * @private
   */
  private readPdfUnderlineAnno(
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    index: number,
  ): PdfUnderlineAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pagePtr, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modifiedRaw = this.getAnnotString(annotationPtr, 'M');
    const modified = pdfDateToDate(modifiedRaw);
    const segmentRects = this.getQuadPointsAnno(page, annotationPtr);
    const contents = this.getAnnotString(annotationPtr, 'Contents') || '';
    const webAlphaColor = this.resolveAnnotationColor(annotationPtr);
    const blendMode = this.pdfiumModule.EPDFAnnot_GetBlendMode(annotationPtr);

    return {
      pageIndex: page.index,
      id: index,
      blendMode,
      type: PdfAnnotationSubtype.UNDERLINE,
      rect,
      contents,
      segmentRects,
      ...webAlphaColor,
      author,
      modified,
    };
  }

  /**
   * Read strikeout annotation
   * @param page  - pdf page infor
   * @param pagePtr - pointer to pdf page object
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf strikeout annotation
   *
   * @private
   */
  private readPdfStrikeOutAnno(
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    index: number,
  ): PdfStrikeOutAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pagePtr, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modifiedRaw = this.getAnnotString(annotationPtr, 'M');
    const modified = pdfDateToDate(modifiedRaw);
    const segmentRects = this.getQuadPointsAnno(page, annotationPtr);
    const contents = this.getAnnotString(annotationPtr, 'Contents') || '';
    const webAlphaColor = this.resolveAnnotationColor(annotationPtr);
    const blendMode = this.pdfiumModule.EPDFAnnot_GetBlendMode(annotationPtr);

    return {
      pageIndex: page.index,
      id: index,
      blendMode,
      type: PdfAnnotationSubtype.STRIKEOUT,
      rect,
      contents,
      segmentRects,
      ...webAlphaColor,
      author,
      modified,
    };
  }

  /**
   * Read pdf squiggly annotation
   * @param page  - pdf page infor
   * @param pagePtr - pointer to pdf page object
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf squiggly annotation
   *
   * @private
   */
  private readPdfSquigglyAnno(
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    index: number,
  ): PdfSquigglyAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pagePtr, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modifiedRaw = this.getAnnotString(annotationPtr, 'M');
    const modified = pdfDateToDate(modifiedRaw);
    const segmentRects = this.getQuadPointsAnno(page, annotationPtr);
    const contents = this.getAnnotString(annotationPtr, 'Contents') || '';
    const webAlphaColor = this.resolveAnnotationColor(annotationPtr);
    const blendMode = this.pdfiumModule.EPDFAnnot_GetBlendMode(annotationPtr);

    return {
      pageIndex: page.index,
      id: index,
      blendMode,
      type: PdfAnnotationSubtype.SQUIGGLY,
      rect,
      contents,
      segmentRects,
      ...webAlphaColor,
      author,
      modified,
    };
  }

  /**
   * Read pdf caret annotation
   * @param page  - pdf page infor
   * @param pagePtr - pointer to pdf page object
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf caret annotation
   *
   * @private
   */
  private readPdfCaretAnno(
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    index: number,
  ): PdfCaretAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pagePtr, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modifiedRaw = this.getAnnotString(annotationPtr, 'M');
    const modified = pdfDateToDate(modifiedRaw);

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.CARET,
      rect,
      author,
      modified,
    };
  }

  /**
   * Read pdf stamp annotation
   * @param docPtr - pointer to pdf document object
   * @param page  - pdf page infor
   * @param pagePtr - pointer to pdf page object
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf stamp annotation
   *
   * @private
   */
  private readPdfStampAnno(
    docPtr: number,
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    index: number,
  ): PdfStampAnnoObject | undefined {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pagePtr, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modifiedRaw = this.getAnnotString(annotationPtr, 'M');
    const modified = pdfDateToDate(modifiedRaw);
    const contents: PdfStampAnnoObject['contents'] = [];

    const objectCount = this.pdfiumModule.FPDFAnnot_GetObjectCount(annotationPtr);
    for (let i = 0; i < objectCount; i++) {
      const annotationObjectPtr = this.pdfiumModule.FPDFAnnot_GetObject(annotationPtr, i);

      const pageObj = this.readPdfPageObject(annotationObjectPtr);
      if (pageObj) {
        contents.push(pageObj);
      }
    }

    return {
      pageIndex: page.index,
      id: index,
      type: PdfAnnotationSubtype.STAMP,
      rect,
      contents,
      author,
      modified,
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

    const leftPtr = this.malloc(4);
    const bottomPtr = this.malloc(4);
    const rightPtr = this.malloc(4);
    const topPtr = this.malloc(4);
    this.pdfiumModule.FPDFPageObj_GetBounds(pathObjectPtr, leftPtr, bottomPtr, rightPtr, topPtr);
    const left = this.pdfiumModule.pdfium.getValue(leftPtr, 'float');
    const bottom = this.pdfiumModule.pdfium.getValue(bottomPtr, 'float');
    const right = this.pdfiumModule.pdfium.getValue(rightPtr, 'float');
    const top = this.pdfiumModule.pdfium.getValue(topPtr, 'float');
    const bounds = { left, bottom, right, top };
    this.free(leftPtr);
    this.free(bottomPtr);
    this.free(rightPtr);
    this.free(topPtr);
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
    const pointXPtr = this.malloc(4);
    const pointYPtr = this.malloc(4);
    this.pdfiumModule.FPDFPathSegment_GetPoint(segmentPtr, pointXPtr, pointYPtr);
    const pointX = this.pdfiumModule.pdfium.getValue(pointXPtr, 'float');
    const pointY = this.pdfiumModule.pdfium.getValue(pointYPtr, 'float');
    this.free(pointXPtr);
    this.free(pointYPtr);

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
    const matrixPtr = this.malloc(4 * 6);
    if (this.pdfiumModule.FPDFPageObj_GetMatrix(pageObjectPtr, matrixPtr)) {
      const a = this.pdfiumModule.pdfium.getValue(matrixPtr, 'float');
      const b = this.pdfiumModule.pdfium.getValue(matrixPtr + 4, 'float');
      const c = this.pdfiumModule.pdfium.getValue(matrixPtr + 8, 'float');
      const d = this.pdfiumModule.pdfium.getValue(matrixPtr + 12, 'float');
      const e = this.pdfiumModule.pdfium.getValue(matrixPtr + 16, 'float');
      const f = this.pdfiumModule.pdfium.getValue(matrixPtr + 20, 'float');
      this.free(matrixPtr);

      return { a, b, c, d, e, f };
    }

    this.free(matrixPtr);

    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
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
    const hPtr = this.malloc(4);
    const vPtr = this.malloc(4);
    const wPtr = this.malloc(4);

    const ok = this.pdfiumModule.FPDFAnnot_GetBorder(annotationPtr, hPtr, vPtr, wPtr);
    const width = ok ? this.pdfiumModule.pdfium.getValue(wPtr, 'float') : 1; // default 1 pt

    this.free(hPtr);
    this.free(vPtr);
    this.free(wPtr);

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

  /**
   * Read circle annotation
   * @param page  - pdf page infor
   * @param pagePtr - pointer to pdf page object
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf circle annotation
   *
   * @private
   */
  private readPdfCircleAnno(
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    index: number,
  ): PdfCircleAnnoObject {
    const flags = this.getAnnotationFlags(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pagePtr, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modifiedRaw = this.getAnnotString(annotationPtr, 'M');
    const modified = pdfDateToDate(modifiedRaw);
    const { color, opacity } = this.resolveAnnotationColor(
      annotationPtr,
      PdfAnnotationColorType.InteriorColor,
    );
    const { color: strokeColor } = this.resolveAnnotationColor(annotationPtr);
    let { style: strokeStyle, width: strokeWidth } = this.getBorderStyle(annotationPtr);

    let cloudyBorderIntensity: number | undefined;
    let cloudyBorderInset: number[] | undefined;
    if (
      strokeStyle === PdfAnnotationBorderStyle.CLOUDY ||
      strokeStyle === PdfAnnotationBorderStyle.UNKNOWN
    ) {
      const { ok: hasEffect, intensity } = this.getBorderEffect(annotationPtr);

      if (hasEffect) {
        cloudyBorderIntensity = intensity;
        strokeStyle = PdfAnnotationBorderStyle.CLOUDY;
        const {
          ok: hasInset,
          left,
          top,
          right,
          bottom,
        } = this.getRectangleDifferences(annotationPtr);
        if (hasInset) cloudyBorderInset = [left, top, right, bottom];
      }
    }

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
      flags,
      color,
      opacity,
      strokeWidth,
      strokeColor,
      strokeStyle,
      rect,
      author,
      modified,
      ...(cloudyBorderIntensity !== undefined && { cloudyBorderIntensity }),
      ...(cloudyBorderInset !== undefined && { cloudyBorderInset }),
      ...(strokeDashArray !== undefined && { strokeDashArray }),
    };
  }

  /**
   * Read square annotation
   * @param page  - pdf page infor
   * @param pagePtr - pointer to pdf page object
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf square annotation
   *
   * @private
   */
  private readPdfSquareAnno(
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
    index: number,
  ): PdfSquareAnnoObject {
    const flags = this.getAnnotationFlags(annotationPtr);
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pagePtr, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modifiedRaw = this.getAnnotString(annotationPtr, 'M');
    const modified = pdfDateToDate(modifiedRaw);
    const { color, opacity } = this.resolveAnnotationColor(
      annotationPtr,
      PdfAnnotationColorType.InteriorColor,
    );
    const { color: strokeColor } = this.resolveAnnotationColor(annotationPtr);
    let { style: strokeStyle, width: strokeWidth } = this.getBorderStyle(annotationPtr);

    let cloudyBorderIntensity: number | undefined;
    let cloudyBorderInset: number[] | undefined;
    if (
      strokeStyle === PdfAnnotationBorderStyle.CLOUDY ||
      strokeStyle === PdfAnnotationBorderStyle.UNKNOWN
    ) {
      const { ok: hasEffect, intensity } = this.getBorderEffect(annotationPtr);

      if (hasEffect) {
        cloudyBorderIntensity = intensity;
        strokeStyle = PdfAnnotationBorderStyle.CLOUDY;
        const {
          ok: hasInset,
          left,
          top,
          right,
          bottom,
        } = this.getRectangleDifferences(annotationPtr);
        if (hasInset) cloudyBorderInset = [left, top, right, bottom];
      }
    }

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
      flags,
      color,
      opacity,
      strokeColor,
      strokeWidth,
      strokeStyle,
      rect,
      author,
      modified,
      ...(cloudyBorderIntensity !== undefined && { cloudyBorderIntensity }),
      ...(cloudyBorderInset !== undefined && { cloudyBorderInset }),
      ...(strokeDashArray !== undefined && { strokeDashArray }),
    };
  }

  /**
   * Read basic info of unsupported pdf annotation
   * @param page  - pdf page infor
   * @param pagePtr - pointer to pdf page object
   * @param type - type of annotation
   * @param annotationPtr - pointer to pdf annotation
   * @param index  - index of annotation in the pdf page
   * @returns pdf annotation
   *
   * @private
   */
  private readPdfAnno(
    page: PdfPageObject,
    pagePtr: number,
    type: PdfUnsupportedAnnoObject['type'],
    annotationPtr: number,
    index: number,
  ): PdfUnsupportedAnnoObject {
    const pageRect = this.readPageAnnoRect(annotationPtr);
    const rect = this.convertPageRectToDeviceRect(page, pagePtr, pageRect);
    const author = this.getAnnotString(annotationPtr, 'T');
    const modifiedRaw = this.getAnnotString(annotationPtr, 'M');
    const modified = pdfDateToDate(modifiedRaw);

    return {
      pageIndex: page.index,
      id: index,
      type,
      rect,
      author,
      modified,
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
  private getInReplyToId(pagePtr: number, annotationPtr: number): number | undefined {
    const parentPtr = this.pdfiumModule.FPDFAnnot_GetLinkedAnnot(annotationPtr, 'IRT');
    if (!parentPtr) return;

    // PDFium ≥ 5100 – returns −1 when annot not found on page
    const idx = this.pdfiumModule.FPDFPage_GetAnnotIndex(pagePtr, parentPtr);
    return idx >= 0 ? idx : undefined;
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
    const ptr = this.malloc(bytes);

    this.pdfiumModule.FPDFAnnot_GetStringValue(annotationPtr, key, ptr, bytes);
    const value = this.pdfiumModule.pdfium.UTF16ToString(ptr);
    this.free(ptr);

    return value || undefined;
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
    const ptr = this.malloc(bytes);

    this.pdfiumModule.EPDFAnnot_GetIntent(annotationPtr, ptr, bytes);
    const value = this.pdfiumModule.pdfium.UTF16ToString(ptr);

    this.free(ptr);

    return value && value !== 'undefined' ? value : undefined;
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
    const ptr = this.malloc(bytes);

    this.pdfiumModule.EPDFAnnot_GetRichContent(annotationPtr, ptr, bytes);
    const value = this.pdfiumModule.pdfium.UTF16ToString(ptr);

    this.free(ptr);

    return value || undefined;
  }

  /**
   * Set a string value (`/T`, `/M`, `/State`, …) to an annotation.
   *
   * @returns `true` if the operation was successful
   *
   * @private
   */
  private setAnnotString(annotationPtr: number, key: string, value: string): boolean {
    const bytes = 2 * (value.length + 1);
    const ptr = this.malloc(bytes);
    this.pdfiumModule.pdfium.stringToUTF16(value, ptr, bytes);
    const ok = this.pdfiumModule.FPDFAnnot_SetStringValue(annotationPtr, key, ptr);
    this.free(ptr);
    return ok;
  }

  /**
   * Read vertices of pdf annotation
   * @param page  - pdf page infor
   * @param pagePtr - pointer to pdf page object
   * @param annotationPtr - pointer to pdf annotation
   * @returns vertices of pdf annotation
   *
   * @private
   */
  private readPdfAnnoVertices(
    page: PdfPageObject,
    pagePtr: number,
    annotationPtr: number,
  ): Position[] {
    const vertices: Position[] = [];
    const count = this.pdfiumModule.FPDFAnnot_GetVertices(annotationPtr, 0, 0);
    const pointMemorySize = 8;
    const pointsPtr = this.malloc(count * pointMemorySize);
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
      vertices.push({
        x,
        y,
      });
    }
    this.free(pointsPtr);

    return vertices;
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
  renderAnnotation(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
    scaleFactor: number,
    rotation: Rotation,
    dpr: number = 1, // device-pixel-ratio (canvas)
    mode: AppearanceMode = AppearanceMode.Normal,
    imageType: ImageConversionTypes = 'image/webp',
  ): PdfTask<T> {
    this.logger.debug(
      LOG_SOURCE,
      LOG_CATEGORY,
      'renderAnnotation',
      doc,
      page,
      annotation,
      scaleFactor,
      rotation,
      dpr,
      mode,
      imageType,
    );
    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `RenderAnnotation`,
      'Begin',
      `${doc.id}-${page.index}-${annotation.id}`,
    );
    const task = new Task<T, PdfErrorReason>();
    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        `RenderAnnotation`,
        'End',
        `${doc.id}-${page.index}-${annotation.id}`,
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.DocNotOpen,
        message: 'document does not open',
      });
    }

    /* ── 1. grab native handles ───────────────────────────────────────── */
    const pageCtx = ctx.acquirePage(page.index);
    const annotPtr = this.pdfiumModule.FPDFPage_GetAnnot(pageCtx.pagePtr, annotation.id);
    if (!annotPtr) {
      pageCtx.release();
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        `RenderAnnotation`,
        'End',
        `${doc.id}-${page.index}-${annotation.id}`,
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'annotation not found',
      });
    }

    const finalScale = scaleFactor * dpr;
    /* ── 2. decide bitmap size (integer pixels) ──────────────────────── */
    const annotRect = annotation.rect;
    const bitmapRect = toIntRect(transformRect(page.size, annotRect, rotation, finalScale));

    const format = BitmapFormat.Bitmap_BGRA;
    const bytesPerPixel = 4;
    const bitmapHeapLength = bitmapRect.size.width * bitmapRect.size.height * bytesPerPixel;
    const bitmapHeapPtr = this.malloc(bitmapHeapLength);
    const bitmapPtr = this.pdfiumModule.FPDFBitmap_CreateEx(
      bitmapRect.size.width,
      bitmapRect.size.height,
      format,
      bitmapHeapPtr,
      bitmapRect.size.width * bytesPerPixel,
    );
    this.pdfiumModule.FPDFBitmap_FillRect(
      bitmapPtr,
      0,
      0,
      bitmapRect.size.width,
      bitmapRect.size.height,
      0x00000000,
    );

    const matrix = makeMatrix(annotation.rect, rotation, finalScale);

    // Allocate memory for the matrix on the wasm heap and write to it
    const matrixSize = 6 * 4;
    const matrixPtr = this.malloc(matrixSize);
    const matrixView = new Float32Array(this.pdfiumModule.pdfium.HEAPF32.buffer, matrixPtr, 6);
    matrixView.set([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]);

    /* ── 5. call the native helper with the new matrix ───────────────── */
    const FLAGS = RenderFlag.REVERSE_BYTE_ORDER;
    const ok = !!this.pdfiumModule.EPDF_RenderAnnotBitmap(
      bitmapPtr,
      pageCtx.pagePtr,
      annotPtr,
      mode,
      matrixPtr,
      FLAGS,
    );

    /* ── 6. tear down native resources ───────────────────────────────── */
    this.free(matrixPtr); // Free the matrix memory
    this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr);
    this.pdfiumModule.FPDFPage_CloseAnnot(annotPtr);
    pageCtx.release();

    if (!ok) {
      this.free(bitmapHeapPtr);
      this.logger.perf(
        LOG_SOURCE,
        LOG_CATEGORY,
        `RenderAnnotation`,
        'End',
        `${doc.id}-${page.index}-${annotation.id}`,
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Unknown,
        message: 'EPDF_RenderAnnotBitmap failed',
      });
    }

    /* ── 6. copy out + convert to Blob (reuse existing converter) ─────── */
    const data = this.pdfiumModule.pdfium.HEAPU8.subarray(
      bitmapHeapPtr,
      bitmapHeapPtr + bitmapHeapLength,
    );

    const imageData: PdfImage = {
      data: new Uint8ClampedArray(data),
      width: bitmapRect.size.width,
      height: bitmapRect.size.height,
    };

    this.free(bitmapHeapPtr);

    this.logger.perf(
      LOG_SOURCE,
      LOG_CATEGORY,
      `RenderAnnotation`,
      'End',
      `${doc.id}-${page.index}-${annotation.id}`,
    );

    this.imageDataConverter(imageData, imageType)
      .then((blob) => task.resolve(blob))
      .catch((err) => task.reject({ code: PdfErrorCode.Unknown, message: String(err) }));

    return task;
  }

  /**
   * render rectangle of pdf page to image
   * @param docPtr - pointer to pdf document object
   * @param page  - pdf page infor
   * @param rect - rectangle info
   * @param scaleFactor  - factor of scalling
   * @param rotation  - rotation angle
   * @param options - render options
   * @returns image data
   *
   * @private
   */
  private renderPageRectToImageData(
    ctx: DocumentContext,
    page: PdfPageObject,
    rect: Rect,
    scaleFactor: number,
    rotation: Rotation,
    dpr: number,
    options: PdfRenderOptions,
  ) {
    const format = BitmapFormat.Bitmap_BGRA;
    const bytesPerPixel = 4;

    // Round the transformed dimensions to whole pixels
    const rectSize = toIntRect(transformRect(page.size, rect, rotation, scaleFactor * dpr));
    const pageSize = toIntSize(transformSize(page.size, rotation, scaleFactor * dpr));

    const bitmapHeapLength = rectSize.size.width * rectSize.size.height * bytesPerPixel;
    const bitmapHeapPtr = this.malloc(bitmapHeapLength);
    const bitmapPtr = this.pdfiumModule.FPDFBitmap_CreateEx(
      rectSize.size.width,
      rectSize.size.height,
      format,
      bitmapHeapPtr,
      rectSize.size.width * bytesPerPixel,
    );

    this.pdfiumModule.FPDFBitmap_FillRect(
      bitmapPtr,
      0,
      0,
      rectSize.size.width,
      rectSize.size.height,
      0xffffffff,
    );

    let flags = RenderFlag.REVERSE_BYTE_ORDER;
    if (options?.withAnnotations) {
      flags = flags | RenderFlag.ANNOT;
    }

    const pageCtx = ctx.acquirePage(page.index);

    this.pdfiumModule.FPDF_RenderPageBitmap(
      bitmapPtr,
      pageCtx.pagePtr,
      -rectSize.origin.x,
      -rectSize.origin.y,
      pageSize.width,
      pageSize.height,
      rotation,
      flags,
    );

    this.pdfiumModule.FPDFBitmap_Destroy(bitmapPtr);
    pageCtx.release();

    const data = this.pdfiumModule.pdfium.HEAPU8.subarray(
      bitmapHeapPtr,
      bitmapHeapPtr + bitmapHeapLength,
    );

    const imageData = {
      data: new Uint8ClampedArray(data),
      width: rectSize.size.width,
      height: rectSize.size.height,
    };

    this.free(bitmapHeapPtr);

    return imageData;
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
    const paramsCountPtr = this.malloc(maxParmamsCount);
    const paramsPtr = this.malloc(maxParmamsCount * 4);
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
    this.free(paramsCountPtr);
    this.free(paramsPtr);

    if (zoomMode === PdfZoomMode.XYZ) {
      const hasXPtr = this.malloc(1);
      const hasYPtr = this.malloc(1);
      const hasZPtr = this.malloc(1);
      const xPtr = this.malloc(4);
      const yPtr = this.malloc(4);
      const zPtr = this.malloc(4);

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

        this.free(hasXPtr);
        this.free(hasYPtr);
        this.free(hasZPtr);
        this.free(xPtr);
        this.free(yPtr);
        this.free(zPtr);

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

      this.free(hasXPtr);
      this.free(hasYPtr);
      this.free(hasZPtr);
      this.free(xPtr);
      this.free(yPtr);
      this.free(zPtr);

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
    const creationDate = readString(
      this.pdfiumModule.pdfium,
      (buffer, bufferLength) => {
        return this.pdfiumModule.FPDFAttachment_GetStringValue(
          attachmentPtr,
          'CreationDate',
          buffer,
          bufferLength,
        );
      },
      this.pdfiumModule.pdfium.UTF16ToString,
    );
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

    return {
      index,
      name,
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
    pagePtr: number,
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
    const bufferPtr = this.malloc(bytesCount);
    this.pdfiumModule.FPDFAnnot_GetAP(annotationPtr, mode, bufferPtr, bytesCount);
    const ap = this.pdfiumModule.pdfium.UTF16ToString(bufferPtr);
    this.free(bufferPtr);

    return ap;
  }

  /**
   * Change the visible colour (and opacity) of an existing annotation.
   *
   * For markup annotations (highlight / underline / strikeout / squiggly) we
   * first clear the AP dictionary entry, otherwise the stored appearance stream
   * will override the new tint.  For all other sub-types we keep the existing
   * AP so custom artwork isn't lost.
   *
   * @param doc         logical document object
   * @param page        logical page object
   * @param annotation  the annotation we want to recolour
   * @param colour      RGBA tuple (0-255 per channel)
   * @param which       0 = stroke/fill colour  (PDFium's "colourType" param)
   *
   * @returns `true` when the operation succeeded
   */
  public updateAnnotationColor(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObjectBase,
    color: WebAlphaColor,
    which: number = 0, // 0 → "colour" (fill/stroke)
  ): PdfTask<boolean> {
    this.logger.debug(
      LOG_SOURCE,
      LOG_CATEGORY,
      'setAnnotationColor',
      doc,
      page,
      annotation,
      color,
      which,
    );
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'setAnnotationColor', 'Begin', doc.id);
    const task = PdfTaskHelper.create<boolean>();

    try {
      /* 1 ── sanity & native handles ────────────────────────────────────────── */
      const ctx = this.cache.getContext(doc.id);
      if (!ctx) {
        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'setAnnotationColor', 'End', doc.id);
        this.logger.warn(LOG_SOURCE, LOG_CATEGORY, 'setAnnotationColor: doc closed');
        task.resolve(false);
        return task;
      }

      const pageCtx = ctx.acquirePage(page.index);
      const annotPtr = this.pdfiumModule.FPDFPage_GetAnnot(pageCtx.pagePtr, annotation.id);
      if (!annotPtr) {
        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'setAnnotationColor', 'End', doc.id);
        this.logger.warn(LOG_SOURCE, LOG_CATEGORY, 'setAnnotationColor: annot not found');
        pageCtx.release();
        task.resolve(false);
        return task;
      }

      const ok = this.setAnnotationColor(annotPtr, color, which);

      /* 4 ── regenerate appearance & clean-up ───────────────────────────────── */
      if (ok) {
        this.pdfiumModule.FPDFPage_GenerateContent(pageCtx.pagePtr);
      }

      this.pdfiumModule.FPDFPage_CloseAnnot(annotPtr);
      pageCtx.release();

      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'setAnnotationColor', 'End', doc.id);
      task.resolve(!!ok);
    } catch (error) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, 'setAnnotationColor', 'End', doc.id);
      this.logger.error(LOG_SOURCE, LOG_CATEGORY, 'setAnnotationColor: error', error);
      task.reject({
        code: PdfErrorCode.Unknown,
        message: `Failed to set annotation color: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return task;
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
    const pageXPtr = this.malloc(8);
    const pageYPtr = this.malloc(8);
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
      this.free(pageXPtr);
      this.free(pageYPtr);
      return false;
    }
    const pageX = this.pdfiumModule.pdfium.getValue(pageXPtr, 'double');
    const pageY = this.pdfiumModule.pdfium.getValue(pageYPtr, 'double');
    this.free(pageXPtr);
    this.free(pageYPtr);

    const pageRectPtr = this.malloc(4 * 4);
    this.pdfiumModule.pdfium.setValue(pageRectPtr, pageX, 'float');
    this.pdfiumModule.pdfium.setValue(pageRectPtr + 4, pageY, 'float');
    this.pdfiumModule.pdfium.setValue(pageRectPtr + 8, pageX + rect.size.width, 'float');
    this.pdfiumModule.pdfium.setValue(pageRectPtr + 12, pageY - rect.size.height, 'float');

    if (!this.pdfiumModule.FPDFAnnot_SetRect(annotationPtr, pageRectPtr)) {
      this.free(pageRectPtr);
      return false;
    }
    this.free(pageRectPtr);

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
    const pageRectPtr = this.malloc(4 * 4);
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
    this.free(pageRectPtr);

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
      const topPtr = this.malloc(8);
      const leftPtr = this.malloc(8);
      const rightPtr = this.malloc(8);
      const bottomPtr = this.malloc(8);
      const isSucceed = this.pdfiumModule.FPDFText_GetRect(
        textPagePtr,
        i,
        leftPtr,
        topPtr,
        rightPtr,
        bottomPtr,
      );
      if (!isSucceed) {
        this.free(leftPtr);
        this.free(topPtr);
        this.free(rightPtr);
        this.free(bottomPtr);
        continue;
      }

      const left = this.pdfiumModule.pdfium.getValue(leftPtr, 'double');
      const top = this.pdfiumModule.pdfium.getValue(topPtr, 'double');
      const right = this.pdfiumModule.pdfium.getValue(rightPtr, 'double');
      const bottom = this.pdfiumModule.pdfium.getValue(bottomPtr, 'double');

      this.free(leftPtr);
      this.free(topPtr);
      this.free(rightPtr);
      this.free(bottomPtr);

      const deviceXPtr = this.malloc(4);
      const deviceYPtr = this.malloc(4);
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
      this.free(deviceXPtr);
      this.free(deviceYPtr);

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
   * Search for a keyword across all pages in the document
   * Returns all search results throughout the entire document
   *
   * @param doc - Pdf document object
   * @param keyword - Search keyword
   * @param flags - Match flags for search
   * @returns Promise of all search results in the document
   *
   * @public
   */
  searchAllPages(doc: PdfDocumentObject, keyword: string, flags: MatchFlag[] = []) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'searchAllPages', doc, keyword, flags);
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `SearchAllPages`, 'Begin', doc.id);

    const ctx = this.cache.getContext(doc.id);

    if (!ctx) {
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `SearchAllPages`, 'End', doc.id);
      return PdfTaskHelper.resolve<SearchAllPagesResult>({ results: [], total: 0 });
    }

    const length = 2 * (keyword.length + 1);
    const keywordPtr = this.malloc(length);
    this.pdfiumModule.pdfium.stringToUTF16(keyword, keywordPtr, length);

    const flag = flags.reduce((flag: MatchFlag, currFlag: MatchFlag) => {
      return flag | currFlag;
    }, MatchFlag.None);

    const results: SearchResult[] = [];

    // Search through all pages
    const searchAllPagesTask = PdfTaskHelper.create<SearchAllPagesResult>();

    // Execute search in a separate function to avoid issues with resolve parameter
    const executeSearch = async () => {
      for (let pageIndex = 0; pageIndex < doc.pageCount; pageIndex++) {
        // Get all results for the current page efficiently (load page only once)
        const pageResults = this.searchAllInPage(ctx, doc.pages[pageIndex], keywordPtr, flag);

        results.push(...pageResults);
      }

      this.free(keywordPtr);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `SearchAllPages`, 'End', doc.id);

      searchAllPagesTask.resolve({
        results,
        total: results.length,
      });
    };

    // Start the search process
    executeSearch().catch((error) => {
      this.free(keywordPtr);
      this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `SearchAllPages`, 'End', doc.id);
      searchAllPagesTask.reject({
        code: PdfErrorCode.Unknown,
        message: `Error searching document: ${error}`,
      });
    });

    return searchAllPagesTask;
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
    const pageIndex = page.index;
    // Load the page and text page only once
    const pageCtx = ctx.acquirePage(pageIndex);
    const textPagePtr = pageCtx.getTextPage();

    // Load the full text of the page once
    const total = this.pdfiumModule.FPDFText_CountChars(textPagePtr);
    const bufPtr = this.malloc(2 * (total + 1));
    this.pdfiumModule.FPDFText_GetText(textPagePtr, 0, total, bufPtr);
    const fullText = this.pdfiumModule.pdfium.UTF16ToString(bufPtr);
    this.free(bufPtr);

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
        pageIndex,
        charIndex,
        charCount,
        rects,
        context,
      });
    }

    // Close the search handle only once after finding all results
    this.pdfiumModule.FPDFText_FindClose(searchHandle);

    // Close the text page and page only once
    pageCtx.release();

    return pageResults;
  }
}
