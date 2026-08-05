import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

export interface DemoResult {
  platform: string;
  kind: PdfRuntimeModule['kind'];
  pageCount: number;
}

export async function runDemo(
  runtime: PdfRuntimeModule,
  pdfBytes: Uint8Array,
): Promise<DemoResult> {
  const { fn, mem } = runtime;

  fn.FPDF_InitLibrary();

  const ptr = mem.alloc(pdfBytes.byteLength);
  mem.writeBytes(ptr, pdfBytes);
  const doc = fn.FPDF_LoadMemDocument(ptr, pdfBytes.byteLength, '');
  if (!doc) {
    mem.free(ptr);
    fn.FPDF_DestroyLibrary();
    throw new Error('FPDF_LoadMemDocument returned null');
  }

  const pageCount = fn.FPDF_GetPageCount(doc);

  fn.FPDF_CloseDocument(doc);
  mem.free(ptr);
  fn.FPDF_DestroyLibrary();

  return { platform: runtime.platform, kind: runtime.kind, pageCount };
}
