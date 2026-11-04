import type { WrappedPdfiumModule } from '@embedpdf/pdfium';
import { PdfCache } from '../src/lib/pdfium/cache';
import type { MemoryManager } from '../src/lib/pdfium/core/memory-manager';

function create_cache() {
  const pdfium = { FPDF_CloseDocument: jest.fn() };
  const memory_manager = { free: jest.fn() };
  return {
    cache: new PdfCache(
      pdfium as unknown as WrappedPdfiumModule,
      memory_manager as unknown as MemoryManager,
    ),
    pdfium,
    memory_manager,
  };
}

describe('PdfCache document ownership', () => {
  it('closes a custom-backed document and disposes its file access once', () => {
    const { cache, pdfium, memory_manager } = create_cache();
    const dispose_file = jest.fn();
    cache.setDocument('book', 10, 20, false, dispose_file);

    expect(cache.closeDocument('book')).toBe(true);
    expect(cache.closeDocument('book')).toBe(false);
    expect(pdfium.FPDF_CloseDocument).toHaveBeenCalledTimes(1);
    expect(dispose_file).toHaveBeenCalledTimes(1);
    expect(memory_manager.free).not.toHaveBeenCalled();
  });

  it('disposes the previous document before replacing the same ID', () => {
    const { cache, pdfium } = create_cache();
    const dispose_first = jest.fn();
    const dispose_second = jest.fn();
    cache.setDocument('book', 10, 20, false, dispose_first);

    cache.setDocument('book', 30, 40, false, dispose_second);

    expect(pdfium.FPDF_CloseDocument).toHaveBeenNthCalledWith(1, 20);
    expect(dispose_first).toHaveBeenCalledTimes(1);
    expect(dispose_second).not.toHaveBeenCalled();

    cache.closeAllDocuments();
    expect(pdfium.FPDF_CloseDocument).toHaveBeenNthCalledWith(2, 40);
    expect(dispose_second).toHaveBeenCalledTimes(1);
  });
});
