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
