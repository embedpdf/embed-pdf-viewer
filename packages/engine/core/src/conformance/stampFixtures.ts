/**
 * Stamp artwork both engines' suites draw with: two small drawings whose
 * bands show a crop or a wrong fit.
 */

/** A 30 × 10 PNG: red, green and blue bands, so a crop or a wrong fit shows. */
export const BANDS_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAB4AAAAKCAIAAAAsFXl4AAAAGklEQVR42mP4z8CABzFQIj1q9KjRo0aTIg0AQXcq5OunV0AAAAAASUVORK5CYII=',
  ),
  (c) => c.charCodeAt(0),
);

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

export const BANDS_PDF_CONTENT = '1 0 0 rg 0 0 120 100 re f 0 0 1 rg 120 0 80 100 re f';

/** A PDF file of `objects`, numbered from 1, with its cross-reference table. */
function pdfOf(objects: readonly string[]): Uint8Array {
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

/** A one-page PDF, 200 × 100: a red band and a blue band, so a wrong fit or crop shows. */
export const BANDS_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R /Resources << >> >>',
  `<< /Length ${BANDS_PDF_CONTENT.length} >>\nstream\n${BANDS_PDF_CONTENT}\nendstream`,
]);

/** Two empty pages: not a stamp's drawing, which is one page. */
export const TWO_PAGE_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << >> >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << >> >>',
]);
