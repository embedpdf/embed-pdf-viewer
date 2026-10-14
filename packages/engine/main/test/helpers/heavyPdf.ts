/**
 * Generated documents whose pages take many slices of work: a parse of many
 * steps, or a page of many glyphs.
 */
import { pdf, type Objects } from './miniPdf';

/** Pages of small coloured squares: a parse (and a render) of many steps. Pages are objects 3, 5, 7… */
export function heavyPdf(pageCount: number, squares: number): Uint8Array {
  const objects: Objects = { 1: '<< /Type /Catalog /Pages 2 0 R >>' };
  const kids: string[] = [];
  for (let p = 0; p < pageCount; p++) {
    const pageNumber = 3 + 2 * p;
    kids.push(`${pageNumber} 0 R`);
    let body = '';
    for (let i = 0; i < squares; i++) {
      const x = (i * 7 + p * 3) % 590;
      const y = (i * 13) % 830;
      body += `${(i % 7) / 7} ${(i % 5) / 5} ${(i % 3) / 3} rg ${x} ${y} 4 4 re f\n`;
    }
    objects[pageNumber] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 840] /Contents ${pageNumber + 1} 0 R >>`;
    objects[pageNumber + 1] = `<< /Length ${body.length} >>\nstream\n${body}endstream`;
  }
  objects[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pageCount} >>`;
  return pdf(objects);
}

/** One page (object 3) of `lines` lines of tiny Helvetica text: a text page of many glyphs. */
export function textPdf(lines: number): Uint8Array {
  let body = 'BT /F1 2 Tf\n';
  for (let i = 0; i < lines; i++) {
    body += `1 0 0 1 10 ${830 - (i % 400) * 2} Tm (The quick brown fox jumps over the lazy dog ${i}) Tj\n`;
  }
  body += 'ET\n';
  return pdf({
    1: '<< /Type /Catalog /Pages 2 0 R >>',
    2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 840] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    4: `<< /Length ${body.length} >>\nstream\n${body}endstream`,
    5: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  });
}
