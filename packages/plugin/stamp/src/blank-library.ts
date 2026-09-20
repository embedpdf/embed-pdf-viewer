/**
 * The seed of a new library: a one-page PDF whose page is UNREGISTERED — the
 * shape Acrobat itself gives a fresh stamp library (its first page is a
 * blank starter that no `/Names /Pages` key points at). A library must be a
 * PDF from the moment it exists, and a PDF must have a page; the unregistered
 * blank is that page. It is never an asset, never placed, never listed.
 */
const BLANK_OBJECTS = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
];

let cached: Uint8Array | null = null;

export function blankLibraryPdf(): Uint8Array {
  if (cached) return new Uint8Array(cached);
  let body = '%PDF-1.7\n';
  const offsets: number[] = [];
  BLANK_OBJECTS.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${BLANK_OBJECTS.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${BLANK_OBJECTS.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  cached = new TextEncoder().encode(body);
  return new Uint8Array(cached);
}
