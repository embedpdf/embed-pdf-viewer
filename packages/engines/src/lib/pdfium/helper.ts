import { Matrix, Rotation, Rect, Size } from '@embedpdf/models';
import { PdfiumRuntimeMethods, PdfiumModule } from '@embedpdf/pdfium';

/**
 * Read string from WASM heap
 * @param wasmModule - pdfium wasm module instance
 * @param readChars - function to read chars
 * @param parseChars - function to parse chars
 * @param defaultLength - default length of chars that needs to read
 * @returns string from the heap
 *
 * @public
 */
export function readString(
  wasmModule: PdfiumRuntimeMethods & PdfiumModule,
  readChars: (buffer: number, bufferLength: number) => number,
  parseChars: (buffer: number) => string,
  defaultLength: number = 100,
): string {
  let buffer = wasmModule.wasmExports.malloc(defaultLength);
  for (let i = 0; i < defaultLength; i++) {
    wasmModule.HEAP8[buffer + i] = 0;
  }
  const actualLength = readChars(buffer, defaultLength);
  let str: string;
  if (actualLength > defaultLength) {
    wasmModule.wasmExports.free(buffer);
    buffer = wasmModule.wasmExports.malloc(actualLength);
    for (let i = 0; i < actualLength; i++) {
      wasmModule.HEAP8[buffer + i] = 0;
    }
    readChars(buffer, actualLength);
    str = parseChars(buffer);
  } else {
    str = parseChars(buffer);
  }
  wasmModule.wasmExports.free(buffer);

  return str;
}
/**
 * Read arraybyffer from WASM heap
 * @param wasmModule - pdfium wasm module instance
 * @param readChars - function to read chars
 * @returns arraybuffer from the heap
 *
 * @public
 */
export function readArrayBuffer(
  wasmModule: PdfiumRuntimeMethods & PdfiumModule,
  readChars: (buffer: number, bufferLength: number) => number,
): ArrayBuffer {
  const bufferSize = readChars(0, 0);

  const bufferPtr = wasmModule.wasmExports.malloc(bufferSize);

  readChars(bufferPtr, bufferSize);

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  for (let i = 0; i < bufferSize; i++) {
    view.setInt8(i, wasmModule.getValue(bufferPtr + i, 'i8'));
  }

  wasmModule.wasmExports.free(bufferPtr);

  return arrayBuffer;
}

const RESERVED_INFO_KEYS = new Set([
  'Title',
  'Author',
  'Subject',
  'Keywords',
  'Producer',
  'Creator',
  'CreationDate',
  'ModDate',
  'Trapped',
]);

export function isValidCustomKey(key: string): boolean {
  // PDF Name object rules are looser than strings here, but keep it sane:
  // - non-empty ASCII, no embedded NULs, avoid leading slash
  if (!key || key.length > 127) return false;
  if (RESERVED_INFO_KEYS.has(key)) return false;
  if (key[0] === '/') return false;
  // Keep ASCII-ish to avoid surprises; relax if you need.
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) return false;
  }
  return true;
}

interface FormDrawParams {
  startX: number;
  startY: number;
  formsWidth: number;
  formsHeight: number;
  scaleX: number;
  scaleY: number;
}

export function computeFormDrawParams(
  matrix: Matrix,
  rect: Rect,
  pageSize: Size,
  rotation: Rotation,
): FormDrawParams {
  const rectLeft = rect.origin.x;
  const rectBottom = rect.origin.y;
  const rectRight = rectLeft + rect.size.width;
  const rectTop = rectBottom + rect.size.height;
  const pageWidth = pageSize.width;
  const pageHeight = pageSize.height;

  // Extract the per-axis scale that the render matrix applies.
  const scaleX = Math.hypot(matrix.a, matrix.b);
  const scaleY = Math.hypot(matrix.c, matrix.d);
  const swap = (rotation & 1) === 1;

  const formsWidth = swap
    ? Math.max(1, Math.round(pageHeight * scaleX))
    : Math.max(1, Math.round(pageWidth * scaleX));
  const formsHeight = swap
    ? Math.max(1, Math.round(pageWidth * scaleY))
    : Math.max(1, Math.round(pageHeight * scaleY));

  let startX: number;
  let startY: number;
  switch (rotation) {
    case Rotation.Degree0:
      startX = -Math.round(rectLeft * scaleX);
      startY = -Math.round(rectBottom * scaleY);
      break;
    case Rotation.Degree90:
      startX = Math.round((rectTop - pageHeight) * scaleX);
      startY = -Math.round(rectLeft * scaleY);
      break;
    case Rotation.Degree180:
      startX = Math.round((rectRight - pageWidth) * scaleX);
      startY = Math.round((rectTop - pageHeight) * scaleY);
      break;
    case Rotation.Degree270:
      startX = -Math.round(rectBottom * scaleX);
      startY = Math.round((rectRight - pageWidth) * scaleY);
      break;
    default:
      startX = -Math.round(rectLeft * scaleX);
      startY = -Math.round(rectBottom * scaleY);
      break;
  }

  return { startX, startY, formsWidth, formsHeight, scaleX, scaleY };
}
