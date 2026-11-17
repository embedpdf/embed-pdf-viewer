/**
 * Device-space annotation geometry must round-trip on pages whose /Rotate
 * is 0, 90, 180, or 270. A square created at device rect (20, 30) size
 * 120×40 on a 400×300 page is saved with the correct PDF /Rect, and
 * getPageAnnotations must read that same device rect back. Ink points and
 * polygon vertices use the point converter and must keep the authored
 * device positions, including when the MediaBox origin is not (0, 0).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

import { PdfiumNative } from '@embedpdf/engines/pdfium';
import { PdfAnnotationBorderStyle, PdfAnnotationSubtype } from '@embedpdf/models';
import { init } from '@embedpdf/pdfium';

const require = createRequire(import.meta.url);

const AUTHORED_RECT = {
  origin: { x: 20, y: 30 },
  size: { width: 120, height: 40 },
};

// PDFium grows an ink annotation's /Rect by half the stroke width on every
// side when it builds the appearance. That padded rect is the value stored
// in the file, so device-space readback must be stable across /Rotate.
const INK_RECT = {
  origin: { x: 19.5, y: 29.5 },
  size: { width: 121, height: 41 },
};

const INK_POINTS = [
  { x: 20, y: 30 },
  { x: 140, y: 30 },
  { x: 140, y: 70 },
  { x: 20, y: 70 },
];

const POLYGON_VERTICES = [
  { x: 20, y: 30 },
  { x: 140, y: 30 },
  { x: 140, y: 70 },
  { x: 20, y: 70 },
];

type MediaBox = [number, number, number, number];

const CASES: { rotate: number; mediaBox: MediaBox }[] = [
  { rotate: 0, mediaBox: [0, 0, 400, 300] },
  { rotate: 90, mediaBox: [0, 0, 400, 300] },
  { rotate: 180, mediaBox: [0, 0, 400, 300] },
  { rotate: 270, mediaBox: [0, 0, 400, 300] },
  { rotate: 0, mediaBox: [50, 60, 450, 360] },
  { rotate: 90, mediaBox: [50, 60, 450, 360] },
  { rotate: 180, mediaBox: [50, 60, 450, 360] },
  { rotate: 270, mediaBox: [50, 60, 450, 360] },
];

function onePagePdf(rotate: number, mediaBox: MediaBox): ArrayBuffer {
  const [x0, y0, x1, y1] = mediaBox;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [${x0} ${y0} ${x1} ${y1}] /Rotate ${rotate} >>`,
  ];
  let pdf = '%PDF-1.7\n';
  const offsets = objects.map((body, i) => {
    const at = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf).buffer;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundRect(rect: {
  origin: { x: number; y: number };
  size: { width: number; height: number };
}) {
  return {
    origin: { x: round3(rect.origin.x), y: round3(rect.origin.y) },
    size: { width: round3(rect.size.width), height: round3(rect.size.height) },
  };
}

function roundPoints(points: { x: number; y: number }[]) {
  return points.map((point) => ({ x: round3(point.x), y: round3(point.y) }));
}

function formatRect(rect: {
  origin: { x: number; y: number };
  size: { width: number; height: number };
}) {
  const rounded = roundRect(rect);
  return `(${rounded.origin.x}, ${rounded.origin.y}) ${rounded.size.width}×${rounded.size.height}`;
}

test(
  'getPageAnnotations returns the authored device rect for every page /Rotate',
  { timeout: 120_000 },
  async () => {
    const wasmBinary = readFileSync(require.resolve('@embedpdf/pdfium/pdfium.wasm'));
    const engine = new PdfiumNative(await init({ wasmBinary }));
    const failures: string[] = [];
    const readback: string[] = [];

    try {
      for (const { rotate, mediaBox } of CASES) {
        const label = `/Rotate ${rotate} MediaBox [${mediaBox.join(' ')}]`;
        const doc = await engine
          .openDocumentBuffer({
            id: `rotate-${rotate}-${mediaBox.join('-')}`,
            content: onePagePdf(rotate, mediaBox),
          })
          .toPromise();
        const page = doc.pages[0];

        await engine
          .createPageAnnotation(doc, page, {
            id: 'square',
            type: PdfAnnotationSubtype.SQUARE,
            pageIndex: 0,
            rect: AUTHORED_RECT,
            flags: ['print'],
            color: 'transparent',
            strokeColor: '#FF0000',
            strokeWidth: 2,
            strokeStyle: PdfAnnotationBorderStyle.SOLID,
            opacity: 1,
          })
          .toPromise();

        await engine
          .createPageAnnotation(doc, page, {
            id: 'ink',
            type: PdfAnnotationSubtype.INK,
            pageIndex: 0,
            rect: AUTHORED_RECT,
            flags: ['print'],
            strokeColor: '#0000FF',
            opacity: 1,
            strokeWidth: 1,
            inkList: [{ points: INK_POINTS }],
          })
          .toPromise();

        await engine
          .createPageAnnotation(doc, page, {
            id: 'polygon',
            type: PdfAnnotationSubtype.POLYGON,
            pageIndex: 0,
            rect: AUTHORED_RECT,
            flags: ['print'],
            color: 'transparent',
            strokeColor: '#00AA00',
            strokeWidth: 1,
            strokeStyle: PdfAnnotationBorderStyle.SOLID,
            opacity: 1,
            vertices: POLYGON_VERTICES,
          })
          .toPromise();

        const annotations = await engine.getPageAnnotations(doc, page).toPromise();
        const byId = new Map(annotations.map((annotation) => [annotation.id, annotation]));
        const square = byId.get('square');
        const ink = byId.get('ink');
        const polygon = byId.get('polygon');

        if (!square || square.type !== PdfAnnotationSubtype.SQUARE) {
          failures.push(`${label}: missing square annotation`);
        } else if (JSON.stringify(roundRect(square.rect)) !== JSON.stringify(AUTHORED_RECT)) {
          failures.push(
            `${label}: square rect ${formatRect(square.rect)} expected (20, 30) 120×40`,
          );
        }

        if (!ink || ink.type !== PdfAnnotationSubtype.INK) {
          failures.push(`${label}: missing ink annotation`);
        } else {
          const points = ink.inkList.flatMap((stroke) => stroke.points);
          if (JSON.stringify(roundPoints(points)) !== JSON.stringify(INK_POINTS)) {
            failures.push(`${label}: ink points ${JSON.stringify(roundPoints(points))}`);
          }
          if (JSON.stringify(roundRect(ink.rect)) !== JSON.stringify(INK_RECT)) {
            failures.push(
              `${label}: ink rect ${formatRect(ink.rect)} expected (19.5, 29.5) 121×41`,
            );
          }
        }

        if (!polygon || polygon.type !== PdfAnnotationSubtype.POLYGON) {
          failures.push(`${label}: missing polygon annotation`);
        } else {
          if (JSON.stringify(roundPoints(polygon.vertices)) !== JSON.stringify(POLYGON_VERTICES)) {
            failures.push(`${label}: vertices ${JSON.stringify(roundPoints(polygon.vertices))}`);
          }
          if (JSON.stringify(roundRect(polygon.rect)) !== JSON.stringify(AUTHORED_RECT)) {
            failures.push(
              `${label}: polygon rect ${formatRect(polygon.rect)} expected (20, 30) 120×40`,
            );
          }
        }

        readback.push(
          `${label}: square ${square ? formatRect(square.rect) : 'missing'}, ink ${
            ink ? formatRect(ink.rect) : 'missing'
          }, polygon ${polygon ? formatRect(polygon.rect) : 'missing'}`,
        );

        await engine.closeDocument(doc).toPromise();
      }
    } finally {
      await engine.destroy().toPromise();
    }

    assert.deepEqual(
      failures,
      [],
      `getPageAnnotations device geometry did not round-trip\n${failures.join('\n')}\n\nreadback:\n${readback.join('\n')}`,
    );
  },
);
