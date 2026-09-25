import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions } from '@embedpdf/engine-runtime';

/** `FPDF_GetLastError()` after a failed load: the file needs a (right) password. */
export const FPDF_ERR_PASSWORD = 4;
/** `FPDF_GetLastError()` after a failed load: an unsupported security handler. */
export const FPDF_ERR_SECURITY = 5;

/**
 * What a PDFium document load that just returned null failed with, as the
 * engine reports it: a password state the caller can act on (prompt and
 * unlock) when PDFium says so, else `otherwise` (a broken file).
 */
export function loadFailure(
  fn: PdfFunctions,
  password: string | null | undefined,
  otherwise: EngineError,
): EngineError {
  if (fn.FPDF_GetLastError() !== FPDF_ERR_PASSWORD) return otherwise;
  return password
    ? new EngineError(EngineErrorCode.DocPasswordIncorrect, 'incorrect document password')
    : new EngineError(EngineErrorCode.DocPasswordRequired, 'document requires a password');
}
