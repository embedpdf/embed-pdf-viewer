import type { PdfDocumentObject, PdfTask } from '@embedpdf/models';
import type { WrappedPdfiumModule } from '@embedpdf/pdfium';
import { PdfiumNative } from '../src/lib/pdfium/engine';

type ReadBlock = (context: number, offset: number, buffer: number, length: number) => number;
type RangeNative = {
  openDocumentFromLoader(
    id: string,
    file_length: number,
    callback: (offset: number, length: number) => Uint8Array,
  ): PdfTask<PdfDocumentObject>;
};

function create_native() {
  const heap = new Uint8Array(1024);
  let next_pointer = 64;
  let read_block: ReadBlock = () => 0;
  const runtime = {
    HEAPU8: heap,
    wasmExports: {
      malloc: jest.fn((size: number) => {
        const pointer = next_pointer;
        next_pointer += size;
        return pointer;
      }),
      free: jest.fn(),
    },
    addFunction: jest.fn((callback: ReadBlock) => {
      read_block = callback;
      return 32;
    }),
    removeFunction: jest.fn(),
    setValue: jest.fn(),
  };
  const pdfium = {
    pdfium: runtime,
    PDFiumExt_Init: jest.fn(),
    FPDF_LoadCustomDocument: jest.fn(() => 200),
    FPDF_GetPageCount: jest.fn(() => 0),
    EPDF_IsEncrypted: jest.fn(() => false),
    EPDF_IsOwnerUnlocked: jest.fn(() => true),
    FPDF_GetDocPermissions: jest.fn(() => 0xffffffff),
    FPDF_GetLastError: jest.fn(() => 1),
    FPDF_CloseDocument: jest.fn(),
    FPDF_DestroyLibrary: jest.fn(),
  };
  const native = new PdfiumNative(pdfium as unknown as WrappedPdfiumModule);
  return { native, pdfium, runtime, read: () => read_block };
}

describe('PdfiumNative range document lifecycle', () => {
  it('keeps custom file access alive until the document closes', async () => {
    const { native, pdfium, runtime, read } = create_native();
    pdfium.FPDF_LoadCustomDocument.mockImplementation(() => {
      expect(read()(0, 0, 512, 4)).toBe(1);
      return 200;
    });

    const document = await (native as unknown as RangeNative)
      .openDocumentFromLoader('book', 4, () => Uint8Array.from([1, 2, 3, 4]))
      .toPromise();

    expect(runtime.removeFunction).not.toHaveBeenCalled();
    await native.closeDocument(document).toPromise();
    expect(pdfium.FPDF_CloseDocument).toHaveBeenCalledTimes(1);
    expect(runtime.removeFunction).toHaveBeenCalledTimes(1);
    expect(runtime.wasmExports.free).toHaveBeenCalledTimes(3);
    expect(pdfium.FPDF_CloseDocument.mock.invocationCallOrder[0]).toBeLessThan(
      runtime.removeFunction.mock.invocationCallOrder[0],
    );
  });

  it('closes range-backed documents before destroying PDFium', async () => {
    const { native, pdfium, runtime } = create_native();
    await (native as unknown as RangeNative)
      .openDocumentFromLoader('book', 4, () => Uint8Array.from([1, 2, 3, 4]))
      .toPromise();

    await native.destroy().toPromise();

    expect(pdfium.FPDF_CloseDocument).toHaveBeenCalledTimes(1);
    expect(runtime.removeFunction).toHaveBeenCalledTimes(1);
    expect(pdfium.FPDF_DestroyLibrary).toHaveBeenCalledTimes(1);
    expect(pdfium.FPDF_CloseDocument.mock.invocationCallOrder[0]).toBeLessThan(
      runtime.removeFunction.mock.invocationCallOrder[0],
    );
    expect(pdfium.FPDF_CloseDocument.mock.invocationCallOrder[0]).toBeLessThan(
      pdfium.FPDF_DestroyLibrary.mock.invocationCallOrder[0],
    );
  });

  it('releases custom file access when PDFium rejects the document', async () => {
    const { native, pdfium, runtime } = create_native();
    pdfium.FPDF_LoadCustomDocument.mockReturnValue(0);

    const task = (native as unknown as RangeNative).openDocumentFromLoader('book', 4, () =>
      Uint8Array.from([1, 2, 3, 4]),
    );

    await expect(task.toPromise()).rejects.toBeDefined();
    expect(pdfium.FPDF_CloseDocument).not.toHaveBeenCalled();
    expect(runtime.removeFunction).toHaveBeenCalledTimes(1);
    expect(runtime.wasmExports.free).toHaveBeenCalledTimes(1);
  });

  it('releases the document when a range read fails during metadata discovery', () => {
    const { native, pdfium, runtime, read } = create_native();
    let request_count = 0;
    const callback = () => {
      request_count += 1;
      if (request_count === 2) throw new Error('range failed');
      return Uint8Array.from([1, 2, 3, 4]);
    };
    pdfium.FPDF_LoadCustomDocument.mockImplementation(() => {
      read()(0, 0, 512, 4);
      return 200;
    });
    pdfium.FPDF_GetPageCount.mockImplementation(() => {
      read()(0, 0, 512, 4);
      return 0;
    });

    expect(() =>
      (native as unknown as RangeNative).openDocumentFromLoader('book', 4, callback),
    ).toThrow('range failed');
    expect(pdfium.FPDF_CloseDocument).toHaveBeenCalledTimes(1);
    expect(runtime.removeFunction).toHaveBeenCalledTimes(1);
    expect(runtime.wasmExports.free).toHaveBeenCalledTimes(1);
  });
});
