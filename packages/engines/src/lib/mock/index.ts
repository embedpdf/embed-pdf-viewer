import {
  PdfDocumentObject,
  PdfEngine,
  PdfPageObject,
  PdfAnnotationSubtype,
  PdfLinkAnnoObject,
  Rotation,
  swap,
  PdfZoomMode,
  PdfActionType,
  PdfAnnotationObject,
  PdfBookmarkObject,
  PdfTextRectObject,
  SearchResult,
  PdfAttachmentObject,
  PdfSignatureObject,
  Rect,
  PdfFile,
  PdfWidgetAnnoObject,
  FormFieldValue,
  PdfTaskHelper,
  PdfPageFlattenResult,
  SearchAllPagesResult,
  PdfOpenDocumentUrlOptions,
  PdfFileUrl,
  PdfGlyphObject,
  PdfPageGeometry,
  PageTextSlice,
  PdfPageSearchProgress,
  PdfRenderPageOptions,
  PdfRenderPageAnnotationOptions,
  PdfFlattenPageOptions,
  PdfRedactTextOptions,
  PdfSearchAllPagesOptions,
  PdfOpenDocumentBufferOptions,
  uuidV4,
  PdfMetadataObject,
  PdfTask,
  PdfPrintOptions,
  PdfTrappedStatus,
  PdfAddAttachmentParams,
} from '@embedpdf/models';

/**
 * Create mock of pdf engine
 * @param partialEngine - partial configuration of engine
 * @returns - mock of pdf engine
 *
 * @public
 */
export function createMockPdfEngine(partialEngine?: Partial<PdfEngine>): PdfEngine {
  const engine: PdfEngine = {
    openDocumentUrl: jest.fn((file: PdfFileUrl, options?: PdfOpenDocumentUrlOptions) => {
      return PdfTaskHelper.create();
    }),
    openDocumentBuffer: jest.fn((file: PdfFile, options?: PdfOpenDocumentBufferOptions) => {
      return PdfTaskHelper.create();
    }),
    getMetadata: (doc: PdfDocumentObject) => {
      const metadata: PdfMetadataObject = {
        title: 'title',
        author: 'author',
        subject: 'subject',
        keywords: 'keywords',
        producer: 'producer',
        creator: 'creator',
        creationDate: new Date(),
        modificationDate: new Date(),
        trapped: PdfTrappedStatus.NotSet,
      };
      return PdfTaskHelper.resolve(metadata);
    },
    setMetadata: (doc: PdfDocumentObject, metadata: Partial<PdfMetadataObject>) => {
      return PdfTaskHelper.resolve(true);
    },
    getDocPermissions: (doc: PdfDocumentObject) => {
      return PdfTaskHelper.resolve(0xffffffff);
    },
    getDocUserPermissions: (doc: PdfDocumentObject) => {
      return PdfTaskHelper.resolve(0xffffffff);
    },
    getSignatures: (doc: PdfDocumentObject) => {
      const signatures: PdfSignatureObject[] = [];
      return PdfTaskHelper.resolve(signatures);
    },
    getBookmarks: (doc: PdfDocumentObject) => {
      const bookmarks: PdfBookmarkObject[] = [];
      bookmarks.push(
        {
          title: 'Page 1',
          target: {
            type: 'destination',
            destination: {
              pageIndex: 1,
              zoom: {
                mode: PdfZoomMode.FitPage,
              },
              view: [],
            },
          },
        },
        {
          title: 'Page 2',
          target: {
            type: 'destination',
            destination: {
              pageIndex: 2,
              zoom: {
                mode: PdfZoomMode.FitPage,
              },
              view: [],
            },
          },
          children: [
            {
              title: 'Page 3',
              target: {
                type: 'destination',
                destination: {
                  pageIndex: 3,
                  zoom: {
                    mode: PdfZoomMode.FitPage,
                  },
                  view: [],
                },
              },
            },
          ],
        },
      );
      return PdfTaskHelper.resolve({
        bookmarks,
      });
    },
    setBookmarks: jest.fn((doc: PdfDocumentObject, payload: PdfBookmarkObject[]) => {
      return PdfTaskHelper.resolve(true);
    }),
    deleteBookmarks: jest.fn((doc: PdfDocumentObject) => {
      return PdfTaskHelper.resolve(true);
    }),
    renderPage: jest.fn(
      (doc: PdfDocumentObject, page: PdfPageObject, options?: PdfRenderPageOptions) => {
        const { scaleFactor = 1, rotation = Rotation.Degree0, dpr = 1 } = options ?? {};
        const pageSize = rotation % 2 === 0 ? page.size : swap(page.size);
        const imageSize = {
          width: Math.ceil(pageSize.width * scaleFactor),
          height: Math.ceil(pageSize.height * scaleFactor),
        };
        const pixelCount = imageSize.width * imageSize.height;
        const array = new Uint8ClampedArray(pixelCount * 4);
        const rgbValue = page.index % 255;
        const alphaValue = 255;
        for (let i = 0; i < pixelCount; i++) {
          for (let j = 0; j < 3; j++) {
            const index = i * 4 + j;
            array[index] = rgbValue;
          }
          array[i * 4 + 3] = alphaValue;
        }

        const ab = array.buffer;
        const realBuffer = ab instanceof ArrayBuffer ? ab : new Uint8Array(array).buffer;
        const blob = new Blob([realBuffer], { type: 'application/octet-stream' });
        return PdfTaskHelper.resolve(blob);
      },
    ),
    renderPageRect: jest.fn(
      (doc: PdfDocumentObject, page: PdfPageObject, rect: Rect, options?: PdfRenderPageOptions) => {
        const { scaleFactor = 1, rotation = Rotation.Degree0, dpr = 1 } = options ?? {};
        const pageSize = rotation % 2 === 0 ? page.size : swap(page.size);
        const imageSize = {
          width: Math.ceil(pageSize.width * scaleFactor),
          height: Math.ceil(pageSize.height * scaleFactor),
        };
        const pixelCount = imageSize.width * imageSize.height;
        const array = new Uint8ClampedArray(pixelCount * 4);
        const rgbValue = page.index % 255;
        const alphaValue = 255;
        for (let i = 0; i < pixelCount; i++) {
          for (let j = 0; j < 3; j++) {
            const index = i * 4 + j;
            array[index] = rgbValue;
          }
          array[i * 4 + 3] = alphaValue;
        }

        const ab = array.buffer;
        const realBuffer = ab instanceof ArrayBuffer ? ab : new Uint8Array(array).buffer;
        const blob = new Blob([realBuffer], { type: 'application/octet-stream' });
        return PdfTaskHelper.resolve(blob);
      },
    ),
    renderThumbnail: jest.fn((doc: PdfDocumentObject, page: PdfPageObject) => {
      const thumbnailWidth = page.size.width / 4;
      const thumbnailHeight = page.size.height / 4;
      const pixelCount = thumbnailWidth * thumbnailHeight;
      const array = new Uint8ClampedArray(pixelCount * 4);
      const rgbValue = page.index % 255;
      const alphaValue = 255;
      for (let i = 0; i < pixelCount; i++) {
        for (let j = 0; j < 3; j++) {
          const index = i * 4 + j;
          array[index] = rgbValue;
        }
        array[i * 4 + 3] = alphaValue;
      }

      const ab = array.buffer;
      const realBuffer = ab instanceof ArrayBuffer ? ab : new Uint8Array(array).buffer;
      const blob = new Blob([realBuffer], { type: 'image/png' });

      return PdfTaskHelper.resolve(blob);
    }),
    renderPageAnnotation: jest.fn(
      (
        doc: PdfDocumentObject,
        page: PdfPageObject,
        annotation: PdfAnnotationObject,
        options?: PdfRenderPageAnnotationOptions,
      ) => {
        return PdfTaskHelper.resolve(new Blob([], { type: 'image/png' }));
      },
    ),
    getAllAnnotations: jest.fn((doc: PdfDocumentObject) => {
      return PdfTaskHelper.resolve({});
    }),
    getPageAnnotations: jest.fn((doc: PdfDocumentObject, page: PdfPageObject) => {
      const link: PdfLinkAnnoObject = {
        pageIndex: page.index,
        id: '1',
        type: PdfAnnotationSubtype.LINK,
        target: {
          type: 'action',
          action: {
            type: PdfActionType.URI,
            uri: 'https://localhost',
          },
        },
        rect: {
          origin: {
            x: 0,
            y: 0,
          },
          size: {
            width: 100,
            height: 100,
          },
        },
      };
      const annotations: PdfAnnotationObject[] = [];
      annotations.push(link);
      return PdfTaskHelper.resolve(annotations);
    }),
    createPageAnnotation: jest.fn(() => {
      return PdfTaskHelper.resolve(uuidV4());
    }),
    updatePageAnnotation: jest.fn(() => {
      return PdfTaskHelper.resolve(true);
    }),
    removePageAnnotation: jest.fn(() => {
      return PdfTaskHelper.resolve(true);
    }),
    getPageTextRects: jest.fn((doc: PdfDocumentObject, page: PdfPageObject) => {
      const textRects: PdfTextRectObject[] = [
        {
          content: 'pdf text',
          font: {
            family: 'sans-serif',
            size: 12,
          },
          rect: {
            origin: {
              x: 0,
              y: 0,
            },
            size: {
              width: 100,
              height: 100,
            },
          },
        },
      ];
      return PdfTaskHelper.resolve(textRects);
    }),
    closeDocument: (pdf: PdfDocumentObject) => {
      return PdfTaskHelper.resolve(true);
    },
    closeAllDocuments: () => {
      return PdfTaskHelper.resolve(true);
    },
    saveAsCopy: (pdf: PdfDocumentObject) => {
      return PdfTaskHelper.resolve(new ArrayBuffer(0));
    },
    flattenPage: (pdf: PdfDocumentObject, page: PdfPageObject, options?: PdfFlattenPageOptions) => {
      return PdfTaskHelper.resolve<PdfPageFlattenResult>(PdfPageFlattenResult.Success);
    },
    extractPages: (pdf: PdfDocumentObject, pageIndexes: number[]) => {
      return PdfTaskHelper.resolve(new ArrayBuffer(0));
    },
    extractText: (pdf: PdfDocumentObject, pageIndexes: number[]) => {
      return PdfTaskHelper.resolve('');
    },
    redactTextInRects: (
      pdf: PdfDocumentObject,
      page: PdfPageObject,
      rects: Rect[],
      options?: PdfRedactTextOptions,
    ) => {
      return PdfTaskHelper.resolve(true);
    },
    getTextSlices: (doc: PdfDocumentObject, slices: PageTextSlice[]) => {
      return PdfTaskHelper.resolve([] as string[]);
    },
    getPageGlyphs: (doc: PdfDocumentObject, page: PdfPageObject) => {
      return PdfTaskHelper.resolve([] as PdfGlyphObject[]);
    },
    getPageGeometry: (doc: PdfDocumentObject, page: PdfPageObject) => {
      return PdfTaskHelper.resolve({
        runs: [],
      } as PdfPageGeometry);
    },
    merge: (files: PdfFile[]) => {
      return PdfTaskHelper.resolve({
        id: 'id',
        content: new ArrayBuffer(0),
      });
    },
    mergePages: (mergeConfigs: Array<{ docId: string; pageIndices: number[] }>) => {
      return PdfTaskHelper.resolve({
        id: 'id',
        content: new ArrayBuffer(0),
      });
    },
    preparePrintDocument: (doc: PdfDocumentObject, options?: PdfPrintOptions) => {
      return PdfTaskHelper.resolve(new ArrayBuffer(0));
    },
    searchAllPages: (
      doc: PdfDocumentObject,
      keyword: string,
      options?: PdfSearchAllPagesOptions,
    ) => {
      // Create a mock search result
      const mockResult: SearchResult = {
        pageIndex: 0,
        charIndex: 0,
        charCount: keyword.length,
        rects: [
          {
            origin: {
              x: 0,
              y: 0,
            },
            size: {
              width: 50,
              height: 20,
            },
          },
        ],
        context: {
          before: '',
          match: '',
          after: '',
          truncatedLeft: false,
          truncatedRight: false,
        },
      };

      // Return a mock SearchAllPagesResult with a single result
      return PdfTaskHelper.resolve<SearchAllPagesResult, PdfPageSearchProgress>({
        results: [mockResult],
        total: 1,
      });
    },
    getAttachments: (doc: PdfDocumentObject) => {
      return PdfTaskHelper.resolve([] as PdfAttachmentObject[]);
    },
    addAttachment: (doc: PdfDocumentObject, params: PdfAddAttachmentParams) => {
      return PdfTaskHelper.resolve(true);
    },
    removeAttachment: (doc: PdfDocumentObject, attachment: PdfAttachmentObject) => {
      return PdfTaskHelper.resolve(true);
    },
    readAttachmentContent: (doc: PdfDocumentObject, attachment: PdfAttachmentObject) => {
      return PdfTaskHelper.resolve(new ArrayBuffer(0));
    },
    setFormFieldValue: (
      doc: PdfDocumentObject,
      page: PdfPageObject,
      annotation: PdfWidgetAnnoObject,
      text: FormFieldValue,
    ) => {
      return PdfTaskHelper.resolve(true);
    },
    ...partialEngine,
  };

  return engine;
}
/**
 * Create mock of pdf document
 * @param doc - partial configuration of document
 * @returns mock of pdf document
 *
 * @public
 */
export function createMockPdfDocument(doc?: Partial<PdfDocumentObject>): PdfDocumentObject {
  const pageCount = 10;
  const pageWidth = 100;
  const pageHeight = 200;
  const pages = [];
  for (let i = 0; i < pageCount; i++) {
    pages.push({
      index: i,
      size: {
        width: pageWidth,
        height: pageHeight,
      },
      rotation: Rotation.Degree0,
    });
  }

  return {
    id: 'id',
    pageCount: pageCount,
    pages: pages,
    ...doc,
  };
}

/**
 * Create mock of pdf file
 * @param file - partial configuration of file
 * @returns mock of pdf file
 *
 * @public
 */
export function createMockPdfFile(file?: Partial<PdfFile>): PdfFile {
  return {
    id: 'id',
    content: new ArrayBuffer(0),
  };
}
