// Writes image-masks.pdf: images with 1-bit masks under the patterns that decide how
// a resampler may treat runs of mask bits. A resampler that passes over runs of
// clear or set bits must give the same bytes on each page and at every size.
//
//   node test/render-baseline/fixtures/generate-image-masks.mjs

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPdf } from './pdf.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

// A 1-bit image, most significant bit first, rows padded to whole bytes.
function bits(width, height, set) {
  const rowBytes = Math.ceil(width / 8);
  const out = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (set(x, y)) out[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return out;
}

// A few shapes on a clear background, as the overlays of flood maps are.
const shapes = (size) => (x, y) => {
  const s = size / 1600;
  return (
    Math.hypot(x - 420 * s, y - 380 * s) < 260 * s ||
    Math.hypot(x - 1150 * s, y - 1100 * s) < 90 * s ||
    (Math.abs(x - y - 200 * s) < 40 * s && x > 600 * s) ||
    (x > 900 * s && x < 1500 * s && y > 200 * s && y < 233 * s)
  );
};

const MASK = 1600;
const masks = {
  sparse: bits(MASK, MASK, shapes(MASK)),
  holes: bits(MASK, MASK, (x, y) => !shapes(MASK)(x, y)),
  checker: bits(MASK, MASK, (x, y) => ((x + y) & 1) === 0),
  stripes: bits(MASK, MASK, (x, y) => x % 7 < 3 || Math.abs(x - y) < 2),
  // Rows that end part-way through a byte.
  odd: bits(1601, 1597, (x, y) => shapes(1601)(x, y) || x >= 1596),
};

// The image the masks cut out of: a small gradient.
const BASE = 120;
const base = Buffer.alloc(BASE * BASE * 3);
for (let y = 0; y < BASE; y++) {
  for (let x = 0; x < BASE; x++) {
    const i = (y * BASE + x) * 3;
    base[i] = (x * 255) / BASE;
    base[i + 1] = (y * 255) / BASE;
    base[i + 2] = ((x + y) * 255) / (2 * BASE);
  }
}

const maskDict = (width, height) =>
  `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ImageMask true`;
const imageDict = (maskId) =>
  `/Type /XObject /Subtype /Image /Width ${BASE} /Height ${BASE} /ColorSpace /DeviceRGB ` +
  `/BitsPerComponent 8 /Mask ${maskId} 0 R`;

const objects = {
  10: { dict: maskDict(MASK, MASK), stream: masks.sparse },
  11: { dict: maskDict(MASK, MASK), stream: masks.holes },
  12: { dict: maskDict(MASK, MASK), stream: masks.checker },
  13: { dict: maskDict(MASK, MASK), stream: masks.stripes },
  14: { dict: maskDict(1601, 1597), stream: masks.odd },
  20: { dict: imageDict(10), stream: base },
  21: { dict: imageDict(11), stream: base },
  22: { dict: imageDict(12), stream: base },
  23: { dict: imageDict(13), stream: base },
  24: { dict: imageDict(14), stream: base },
};
const resources =
  '/XObject << /A 20 0 R /B 21 0 R /C 22 0 R /D 23 0 R /E 24 0 R /M 10 0 R /O 14 0 R >>';

const pages = [
  // Mostly clear and mostly set masks, each shrunk a lot and a little.
  {
    resources,
    content:
      '0.9 0.9 0.8 rg 0 0 200 200 re f\n' +
      'q 150 0 0 150 5 45 cm /A Do Q\nq 40 0 0 40 158 5 cm /A Do Q\n' +
      'q 60 0 0 60 140 138 cm /B Do Q\nq 23 0 0 23 110 10 cm /B Do Q\n',
    extra: objects,
  },
  // Masks whose windows are almost all mixed.
  {
    resources,
    content:
      'q 120 0 0 120 5 75 cm /C Do Q\nq 70 0 0 70 125 5 cm /D Do Q\nq 190 0 0 60 5 5 cm /D Do Q\n',
  },
  // A stencil mask painted in the fill colour, and a mask whose rows end mid-byte.
  {
    resources,
    content:
      '0.8 0.1 0.1 rg q 170 0 0 170 15 25 cm /M Do Q\n' +
      '0.1 0.3 0.8 rg q 55 0 0 55 140 140 cm /O Do Q\n' +
      'q 90 0 0 90 5 105 cm /E Do Q\n',
  },
];

writeFileSync(path.join(here, 'image-masks.pdf'), buildPdf(pages));
