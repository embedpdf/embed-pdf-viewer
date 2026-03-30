import { Matrix, Rotation, Rect, Size, PdfObjectSpec } from '@embedpdf/models';
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

const PDF_NAME_DELIMITERS = new Set(['(', ')', '<', '>', '[', ']', '{', '}', '/', '%', '#']);

const REGENERATING_ANNOTATION_KEYS = new Set([
  'DA',
  'DS',
  'BS',
  'BE',
  'C',
  'IC',
  'LE',
  'CL',
  'Vertices',
  'L',
  'RD',
  'IT',
]);

export function isValidPdfDictKey(key: string): boolean {
  if (!key || key.length > 127) return false;
  if (key[0] === '/') return false;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    if (c < 0x21 || c > 0x7e) return false;
  }
  return true;
}

function formatPdfNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid PDF number: ${value}`);
  }

  if (Object.is(value, -0)) {
    return '0';
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  let out = value.toString();
  if (/e/i.test(out)) {
    out = value.toFixed(12);
  }
  out = out.replace(/(?:\.0+|(?:(\.[0-9]*?)0+))$/, '$1');
  if (out.endsWith('.')) {
    out = out.slice(0, -1);
  }
  return out;
}

function encodePdfUtf16Hex(value: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < value.length; i++) {
    const codeUnit = value.charCodeAt(i);
    hex += codeUnit.toString(16).toUpperCase().padStart(4, '0');
  }
  return `<${hex}>`;
}

function escapePdfName(name: string): string {
  if (!name) {
    throw new Error('PDF names must not be empty');
  }

  let out = '';
  for (let i = 0; i < name.length; i++) {
    const ch = name[i]!;
    const code = name.charCodeAt(i);
    const isRegular = code >= 0x21 && code <= 0x7e && !PDF_NAME_DELIMITERS.has(ch);
    if (isRegular) {
      out += ch;
      continue;
    }

    if (code > 0xff) {
      throw new Error(`PDF names must be ASCII/byte-oriented in v1: ${name}`);
    }

    out += `#${code.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

function serializePdfObjectSpecInternal(value: PdfObjectSpec, nestedInDict: boolean): string | null {
  switch (value.type) {
    case 'null':
      return nestedInDict ? null : 'null';
    case 'boolean':
      return value.value ? 'true' : 'false';
    case 'number':
      return formatPdfNumber(value.value);
    case 'string':
      return encodePdfUtf16Hex(value.value);
    case 'name':
      return `/${escapePdfName(value.value)}`;
    case 'array': {
      const items = value.value.map((item) => serializePdfObjectSpecInternal(item, false) ?? 'null');
      return `[${items.join(' ')}]`;
    }
    case 'dict': {
      const entries: string[] = [];
      for (const [key, child] of Object.entries(value.value)) {
        if (!isValidPdfDictKey(key)) {
          throw new Error(`Invalid PDF dictionary key: ${key}`);
        }

        const serialized = serializePdfObjectSpecInternal(child, true);
        if (serialized === null) {
          continue;
        }
        entries.push(`/${escapePdfName(key)} ${serialized}`);
      }
      return entries.length > 0 ? `<< ${entries.join(' ')} >>` : '<< >>';
    }
  }
}

export function serializePdfObjectSpec(value: PdfObjectSpec): string {
  return serializePdfObjectSpecInternal(value, false) ?? 'null';
}

export function shouldRegenerateAnnotationAppearanceForKey(key: string): boolean {
  return REGENERATING_ANNOTATION_KEYS.has(key);
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
