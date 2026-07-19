#!/usr/bin/env node
/**
 * Hand-rolls a tiny PDF fixture with the exact mix of annotation shapes
 * the v3 read-path conformance tests need. Emits to public/annotations.pdf.
 *
 * Layout:
 *   1 0 obj  Catalog -> Pages
 *   2 0 obj  Pages tree (Kids [3 0 R], Count 1)
 *   3 0 obj  Page with /Annots [4..16 0 R <<direct>>]
 *   4 0 obj  Highlight (indirect, no /NM)         -> ref.kind = objectNumber
 *   5 0 obj  Highlight (indirect, no /NM)         -> ref.kind = objectNumber
 *   6 0 obj  Ink       (indirect, /InkList + /C)  -> subtype = ink
 *   7 0 obj  Highlight (indirect, with /NM)       -> ref.kind = objectNumber, nm != null
 *   8 0 obj  Circle    (indirect, /IC + /C + /BS) -> subtype = circle
 *   9 0 obj  Square    (indirect, /C + dashed /BS)-> subtype = square
 *  10 0 obj  Polygon   (indirect, /Vertices + /IC)-> subtype = polygon
 *  11 0 obj  Polyline  (indirect, /Vertices + /LE)-> subtype = polyline
 *  12 0 obj  Line      (indirect, /L + /LE)       -> subtype = line
 *  13 0 obj  Screen    (indirect)                 -> subtype = unsupported
 *  14 0 obj  FreeText  (indirect, /DA + /Q + /C)  -> subtype = free-text
 *  15 0 obj  FreeText  (indirect, /IT callout+/CL)-> subtype = free-text (callout)
 *  16 0 obj  Caret     (indirect, /C + /CA + /RD) -> subtype = caret
 *   direct   Highlight (direct dict in /Annots)   -> ref.kind = index, identity = weak
 *
 * The direct-object annotation is the only way to get an
 * `identityQuality === 'weak'` row, because PDFium reports object number 0
 * for direct dicts.
 */
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '..', 'public', 'annotations.pdf');

const objects = [];

const addObject = (n, body) => {
  objects[n] = body;
};

addObject(
  1,
  `<<\n/Type /Catalog\n/Pages 2 0 R\n>>`,
);

addObject(
  2,
  `<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>`,
);

const directAnnot = `<<\n/Type /Annot\n/Subtype /Highlight\n/Rect [100 100 200 120]\n/QuadPoints [100 120 200 120 100 100 200 100]\n/C [1 1 0]\n/CA 0.5\n/F 4\n/Contents (direct)\n>>`;

addObject(
  3,
  `<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n/Resources <<>>\n/Annots [4 0 R 5 0 R 6 0 R 7 0 R 8 0 R 9 0 R 10 0 R 11 0 R 12 0 R 13 0 R 14 0 R 15 0 R 16 0 R ${directAnnot}]\n>>`,
);

addObject(
  4,
  `<<\n/Type /Annot\n/Subtype /Highlight\n/Rect [50 50 150 70]\n/QuadPoints [50 70 150 70 50 50 150 50]\n/C [1 1 0]\n/CA 0.5\n/F 4\n/Contents (highlight 1)\n/T (alice)\n/M (D:20240101000000Z)\n>>`,
);

addObject(
  5,
  `<<\n/Type /Annot\n/Subtype /Highlight\n/Rect [200 200 300 220]\n/QuadPoints [200 220 300 220 200 200 300 200]\n/C [1 0.8 0]\n/CA 0.7\n/F 4\n/Contents (highlight 2)\n>>`,
);

addObject(
  6,
  `<<\n/Type /Annot\n/Subtype /Ink\n/Rect [300 300 400 400]\n/InkList [[300 300 320 320 340 340 360 360 380 380]]\n/C [0 0 1]\n/F 4\n>>`,
);

addObject(
  7,
  `<<\n/Type /Annot\n/Subtype /Highlight\n/Rect [400 50 500 70]\n/QuadPoints [400 70 500 70 400 50 500 50]\n/C [0 1 0]\n/CA 1\n/F 4\n/NM (named-highlight-1)\n>>`,
);

// Circle: red interior fill, blue solid 2pt border.
addObject(
  8,
  `<<\n/Type /Annot\n/Subtype /Circle\n/Rect [50 300 150 380]\n/IC [1 0 0]\n/C [0 0 1]\n/CA 1\n/BS << /W 2 /S /S >>\n/F 4\n/Contents (circle 1)\n>>`,
);

// Square: no interior fill, green dashed 3pt border (/BS dash array [3 2]).
addObject(
  9,
  `<<\n/Type /Annot\n/Subtype /Square\n/Rect [200 300 320 380]\n/C [0 0.5 0]\n/CA 1\n/BS << /W 3 /S /D /D [3 2] >>\n/F 4\n/Contents (square 1)\n>>`,
);

// Polygon: yellow interior fill, blue solid 2pt border, triangle /Vertices.
addObject(
  10,
  `<<\n/Type /Annot\n/Subtype /Polygon\n/Rect [50 450 150 540]\n/Vertices [60 460 140 460 100 530]\n/IC [1 1 0]\n/C [0 0 1]\n/CA 1\n/BS << /W 2 /S /S >>\n/F 4\n/Contents (polygon 1)\n>>`,
);

// Polyline: red 2pt stroke, open->closed arrow endings, 3-point /Vertices.
addObject(
  11,
  `<<\n/Type /Annot\n/Subtype /PolyLine\n/Rect [200 450 320 540]\n/Vertices [210 460 260 530 310 460]\n/C [1 0 0]\n/CA 1\n/BS << /W 2 /S /S >>\n/LE [/OpenArrow /ClosedArrow]\n/F 4\n/Contents (polyline 1)\n>>`,
);

// Line: teal 2pt stroke, none->open arrow endings, /L diagonal.
addObject(
  12,
  `<<\n/Type /Annot\n/Subtype /Line\n/Rect [400 450 520 540]\n/L [410 460 510 530]\n/C [0 0.5 0.5]\n/CA 1\n/BS << /W 2 /S /S >>\n/LE [/None /OpenArrow]\n/F 4\n/Contents (line 1)\n>>`,
);

// Screen: a subtype the engine has no dedicated reader for -> `unsupported`.
// Keeps the read-path's unsupported-fallback coverage now that /Ink is wired.
addObject(
  13,
  `<<\n/Type /Annot\n/Subtype /Screen\n/Rect [400 300 500 360]\n/F 4\n/Contents (screen 1)\n>>`,
);

// FreeText (plain): /DA (Helvetica 14, dark blue text+border), centered (/Q 1),
// light-yellow /C background, 1pt solid /BS. /IT FreeText.
addObject(
  14,
  `<<\n/Type /Annot\n/Subtype /FreeText\n/Rect [50 600 220 660]\n/DA (/Helv 14 Tf 0.0784 0.1569 0.2353 rg)\n/Q 1\n/IT /FreeText\n/C [0.98 0.98 0.82]\n/CA 1\n/BS << /W 1 /S /S >>\n/F 4\n/Contents (free text 1)\n>>`,
);

// FreeText (callout): /IT FreeTextCallout, knee-jointed /CL leader, open-arrow
// /LE ending, transparent (no /C) background, black /DA text+border.
addObject(
  15,
  `<<\n/Type /Annot\n/Subtype /FreeText\n/Rect [280 600 460 660]\n/DA (/Helv 12 Tf 0 0 0 rg)\n/Q 0\n/IT /FreeTextCallout\n/CL [265 605 320 630 280 640]\n/LE [/None /OpenArrow]\n/BS << /W 1 /S /S >>\n/F 4\n/Contents (callout 1)\n>>`,
);

// Caret: blue /C, full opacity, small /RD inset of the drawn symbol from /Rect.
addObject(
  16,
  `<<\n/Type /Annot\n/Subtype /Caret\n/Rect [50 700 90 730]\n/C [0 0 1]\n/CA 1\n/RD [2 2 2 2]\n/F 4\n/Contents (caret 1)\n>>`,
);

const buf = [];
const offsets = new Array(objects.length).fill(0);
let cursor = 0;

const append = (s) => {
  const bytes = Buffer.from(s, 'latin1');
  buf.push(bytes);
  cursor += bytes.length;
};

append('%PDF-1.4\n');
// Embed a binary marker so PDF readers detect the file as binary.
buf.push(Buffer.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
cursor += 6;

for (let n = 1; n < objects.length; n++) {
  if (objects[n] === undefined) continue;
  offsets[n] = cursor;
  append(`${n} 0 obj\n${objects[n]}\nendobj\n`);
}

const xrefStart = cursor;
const realCount = objects.length;
append(`xref\n0 ${realCount}\n`);
append('0000000000 65535 f \n');
for (let n = 1; n < realCount; n++) {
  append(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
}

append(`trailer\n<<\n/Size ${realCount}\n/Root 1 0 R\n>>\nstartxref\n${xrefStart}\n%%EOF\n`);

const out = Buffer.concat(buf);
await writeFile(outPath, out);
console.log(`wrote ${out.length} bytes to ${outPath}`);
