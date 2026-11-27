/** A PDF file of `objects`, numbered from 1, with its cross-reference table. */
export function pdfOf(objects: readonly string[]): Uint8Array {
  let text = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(text.length);
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) text += `${String(offset).padStart(10, '0')} 00000 n \n`;
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return new TextEncoder().encode(text);
}

/** A stream object: its dictionary's entries (without `/Length`) and its bytes. */
export interface PdfStreamObject {
  dictionary: string;
  data: Uint8Array;
}

/** {@link pdfOf} with stream objects among `objects`, their bytes as they are. */
export function pdfOfParts(objects: readonly (string | PdfStreamObject)[]): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  let length = 0;
  const write = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    parts.push(bytes);
    length += bytes.length;
  };
  write('%PDF-1.7\n');
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(length);
    if (typeof object === 'string') {
      write(`${index + 1} 0 obj\n${object}\nendobj\n`);
      return;
    }
    write(`${index + 1} 0 obj\n<< ${object.dictionary} /Length ${object.data.length} >>\nstream\n`);
    write(object.data);
    write('\nendstream\nendobj\n');
  });
  const start = length;
  write(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) write(`${String(offset).padStart(10, '0')} 00000 n \n`);
  write(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}

/** Hex digits a {@link SIGNATURE_SLOT} holds: room for 64 bytes of signature. */
const SLOT_HEX_DIGITS = 128;

/**
 * A signature value's `/ByteRange` and `/Contents`, left blank: put it in the
 * value's dictionary, and {@link sealedPdfOf} fills it in.
 */
export const SIGNATURE_SLOT = `/ByteRange [0 ${' '.repeat(10)} ${' '.repeat(10)} ${' '.repeat(10)}] /Contents <${'0'.repeat(SLOT_HEX_DIGITS)}>`;

/**
 * {@link pdfOf} with its one {@link SIGNATURE_SLOT} filled in: the signature
 * seals the whole file, and its contents are `cms` (at most 64 bytes),
 * padded with zeros.
 */
export function sealedPdfOf(objects: readonly string[], cms: Uint8Array): Uint8Array {
  const bytes = pdfOf(objects);
  const text = new TextDecoder('latin1').decode(bytes);
  const at = text.indexOf(SIGNATURE_SLOT);
  if (at < 0 || text.indexOf(SIGNATURE_SLOT, at + 1) >= 0) {
    throw new Error('sealedPdfOf: the objects must hold exactly one signature slot');
  }
  const hex = [...cms].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length > SLOT_HEX_DIGITS) throw new Error('sealedPdfOf: the CMS is too long');
  const contentsStart = at + SIGNATURE_SLOT.indexOf('<');
  const contentsEnd = at + SIGNATURE_SLOT.length;
  const range = [0, contentsStart, contentsEnd, text.length - contentsEnd];
  const filled =
    `/ByteRange [${range.map((n, i) => (i === 0 ? `${n}` : `${n}`.padEnd(10))).join(' ')}] ` +
    `/Contents <${hex.padEnd(SLOT_HEX_DIGITS, '0')}>`;
  return new TextEncoder().encode(text.slice(0, at) + filled + text.slice(contentsEnd));
}

/**
 * `bytes` with one more revision: `objects`, by number, written after the
 * file, with their own cross-reference section and a trailer that points
 * back to the one before. For a file {@link pdfOf} wrote, or one built on
 * it: the earlier trailer is read by pattern.
 */
export function withRevision(
  bytes: Uint8Array,
  objects: Readonly<Record<number, string>>,
): Uint8Array {
  const text = new TextDecoder('latin1').decode(bytes);
  const previous = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text)?.[1];
  const size = [...text.matchAll(/\/Size (\d+)/g)].at(-1)?.[1];
  if (previous === undefined || size === undefined) {
    throw new Error('withRevision: no trailer to continue from');
  }
  const numbers = Object.keys(objects)
    .map(Number)
    .sort((a, b) => a - b);
  let tail = '';
  const offsets: number[] = [];
  for (const number of numbers) {
    offsets.push(bytes.length + tail.length);
    tail += `${number} 0 obj\n${objects[number]}\nendobj\n`;
  }
  const start = bytes.length + tail.length;
  tail += 'xref\n';
  numbers.forEach((number, index) => {
    tail += `${number} 1\n${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  });
  const newSize = Math.max(Number(size), numbers[numbers.length - 1]! + 1);
  tail += `trailer\n<< /Size ${newSize} /Root 1 0 R /Prev ${previous} >>\nstartxref\n${start}\n%%EOF\n`;
  const appended = new TextEncoder().encode(tail);
  const out = new Uint8Array(bytes.length + appended.length);
  out.set(bytes);
  out.set(appended, bytes.length);
  return out;
}
