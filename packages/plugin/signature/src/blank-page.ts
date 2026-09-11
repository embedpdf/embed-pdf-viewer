/** A one-page blank PDF: the appearance that clears a visual fill. */
// A content stream that draws NOTHING but is not empty (`q Q`): the engine
// turns the page into a form XObject, and a page with no content at all has
// nothing to turn — it refuses; a saved/restored state passes and paints
// nothing.
const CONTENT = 'q Q';
const OBJECTS = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 60] /Contents 4 0 R /Resources << >> >>',
  `<< /Length ${CONTENT.length} >>\nstream\n${CONTENT}\nendstream`,
];

let cached: Uint8Array | null = null;

export function blankPagePdf(): Uint8Array {
  if (cached) return new Uint8Array(cached);
  let body = '%PDF-1.7\n';
  const offsets: number[] = [];
  OBJECTS.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${OBJECTS.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${OBJECTS.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  cached = new TextEncoder().encode(body);
  return new Uint8Array(cached);
}
