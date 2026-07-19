import { EngineError, EngineErrorCode, type PdfSaveMode } from '@embedpdf/engine-core/runtime';

const FPDF_INCREMENTAL = 1 << 0;
const FPDF_NO_INCREMENTAL = 1 << 1;

export function pdfSaveModeFlags(mode: PdfSaveMode): number {
  return mode === 'incremental' ? FPDF_INCREMENTAL : FPDF_NO_INCREMENTAL;
}

export function layerSaveError(status: number): EngineError {
  if (status === 1) {
    return new EngineError(
      EngineErrorCode.DocOpenFailed,
      'layer artifact cannot be saved because append-only offsets exceed the supported range',
    );
  }
  return new EngineError(EngineErrorCode.DocOpenFailed, 'failed to save layer artifact');
}
