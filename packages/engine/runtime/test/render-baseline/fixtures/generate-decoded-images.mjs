// Writes decoded-images.pdf: images under every condition that decides how a kept
// decode may be reused. A render that reuses decodes across page loads must give the
// same bytes on each page and at every size.
//
//   node test/render-baseline/fixtures/generate-decoded-images.mjs

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPdf } from './pdf.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

// Rows of an 8-bit image with the PNG Up predictor applied, so rows that repeat the
// one above compress to almost nothing.
function predicted(width, height, channels, pixel) {
  const rowBytes = width * channels;
  const out = Buffer.alloc(height * (rowBytes + 1));
  let previous = Buffer.alloc(rowBytes);
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(rowBytes);
    for (let x = 0; x < width; x++) pixel(x, y, row, x * channels);
    const offset = y * (rowBytes + 1);
    out[offset] = 2;
    for (let i = 0; i < rowBytes; i++) out[offset + 1 + i] = (row[i] - previous[i]) & 0xff;
    previous = row;
  }
  return out;
}

const imageDict = (width, height, colorSpace, colors, extra = '') =>
  `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${colorSpace} ` +
  `/BitsPerComponent 8 /DecodeParms << /Predictor 12 /Colors ${colors} /Columns ${width} >> ${extra}`;

// A huge image: 5000 × 4500 RGB decodes to 67.5 MB, above PDFium's 60 MB limit for
// keeping decodes in a page's image cache. Bands and a diagonal make every row and
// column distinct enough that a wrong or shifted row would show.
const HUGE_W = 5000;
const HUGE_H = 4500;
const huge = predicted(HUGE_W, HUGE_H, 3, (x, y, row, i) => {
  const diagonal = Math.abs(x - Math.round((y * HUGE_W) / HUGE_H)) < 6;
  row[i] = diagonal ? 0 : ((x * 255) / HUGE_W) & 0xf0;
  row[i + 1] = diagonal ? 0 : ((y * 255) / HUGE_H) & 0xf0;
  row[i + 2] = diagonal ? 255 : ((x >> 6) + (y >> 6)) & 1 ? 200 : 40;
});

// A small image with a soft mask, and the same pixels decoded inverted.
const SMALL_W = 300;
const SMALL_H = 200;
const small = predicted(SMALL_W, SMALL_H, 3, (x, y, row, i) => {
  row[i] = (x * 255) / SMALL_W;
  row[i + 1] = (y * 255) / SMALL_H;
  row[i + 2] = (x + y) & 0xff;
});
const mask = predicted(SMALL_W, SMALL_H, 1, (x, y, row, i) => {
  row[i] = Math.min(255, Math.hypot(x - SMALL_W / 2, y - SMALL_H / 2) * 2);
});

const images = {
  7: { dict: imageDict(HUGE_W, HUGE_H, '/DeviceRGB', 3), stream: huge },
  8: { dict: imageDict(SMALL_W, SMALL_H, '/DeviceRGB', 3, '/SMask 9 0 R'), stream: small },
  9: { dict: imageDict(SMALL_W, SMALL_H, '/DeviceGray', 1), stream: mask },
  10: {
    dict: imageDict(SMALL_W, SMALL_H, '/DeviceRGB', 3, '/Decode [1 0 1 0 1 0]'),
    stream: small,
  },
  // The huge image inside a transparency group with a grey blending space, which
  // decodes it for another colour-space family.
  11: {
    dict:
      '/Type /XObject /Subtype /Form /BBox [0 0 200 200] ' +
      '/Group << /S /Transparency /CS /DeviceGray >> /Resources << /XObject << /H 7 0 R >> >>',
    stream: 'q 200 0 0 200 0 0 cm /H Do Q\n',
  },
};
const resources = '/XObject << /H 7 0 R /S 8 0 R /I 10 0 R /G 11 0 R >>';

const pages = [
  // The huge image across the page.
  { resources, content: 'q 200 0 0 200 0 0 cm /H Do Q\n', extra: images },
  // The huge image small, then inside the grey group, then large again.
  {
    resources,
    content:
      'q 60 0 0 54 10 136 cm /H Do Q\n' +
      'q 0.5 0 0 0.5 100 100 cm /G Do Q\n' +
      'q 120 0 0 108 10 10 cm /H Do Q\n',
  },
  // The masked image twice, and its pixels decoded inverted.
  {
    resources,
    content:
      '0.2 0.6 0.9 rg 0 0 200 200 re f\n' +
      'q 150 0 0 100 10 90 cm /S Do Q\n' +
      'q 60 0 0 40 130 20 cm /S Do Q\n' +
      'q 90 0 0 60 20 10 cm /I Do Q\n',
  },
];

writeFileSync(path.join(here, 'decoded-images.pdf'), buildPdf(pages));
