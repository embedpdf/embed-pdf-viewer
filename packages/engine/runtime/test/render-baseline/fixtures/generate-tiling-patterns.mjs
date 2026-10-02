// Writes tiling-patterns.pdf: tiling patterns whose cell box equals their step and
// whose origin lies hundreds of cells off the page. A renderer that steps from the
// origin by a cell width rounded to whole pixels moves the tiling on the page, by an
// amount that changes with the zoom; every cell must sit where the pattern puts it.
//
//   node test/render-baseline/fixtures/generate-tiling-patterns.mjs

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPdf } from './pdf.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const pattern = (matrix, step, content, resources = '') =>
  `/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 ${step} ${step}] ` +
  `/XStep ${step} /YStep ${step} /Matrix [${matrix.join(' ')}] /Resources << ${resources} >>`;

// A bar along the cell's left edge: vertical stripes, one per cell.
const bar = '0 0 0 rg 0 0 2 10 re f\n';

// Short diagonal strokes that join across cells into long stripes, as a star
// chart's hatching does.
const hatch =
  '0.42 0.855 0.835 rg\n' +
  'q 1 0 0 1 0 13.5 cm 0 0 m 0 -0.178 l 0.178 0 l h f Q\n' +
  'q 1 0 0 1 4.9014 11.4736 cm 0 0 m 2.026 2.026 l 1.671 2.026 l -0.178 0.178 l h f Q\n' +
  'q 1 0 0 1 11.6514 11.4736 cm 0 0 m 1.849 1.849 l 1.849 2.026 l 1.671 2.026 l -0.178 0.178 l h f Q\n' +
  'q 1 0 0 1 1.8486 8.7764 cm 0 0 m -1.849 -1.849 l -1.849 -2.204 l 0.178 -0.178 l h f Q\n' +
  'q 1 0 0 1 4.7236 4.9014 cm 0 0 m 0.178 -0.178 l 4.053 3.697 l 3.875 3.875 l h f Q\n' +
  'q 1 0 0 1 11.6514 4.7236 cm 0 0 m 1.849 1.849 l 1.849 2.204 l -0.178 0.178 l h f Q\n' +
  'q 1 0 0 1 1.8486 2.0264 cm 0 0 m -1.849 -1.849 l -1.849 -2.026 l -1.671 -2.026 l 0.178 -0.178 l h f Q\n' +
  'q 1 0 0 1 8.5986 2.0264 cm 0 0 m -2.026 -2.026 l -1.671 -2.026 l 0.178 -0.178 l h f Q\n' +
  'q 1 0 0 1 13.5 0 cm 0 0 m 0 0.178 l -0.178 0 l h f Q\n';

// Dots to see the tiling against.
const dots =
  '0.45 0.85 0.83 rg\n' +
  [
    [48, 150],
    [131, 77],
    [160, 172],
    [22, 31],
  ]
    .map(
      ([x, y]) =>
        `${x} ${y} m ${x + 3} ${y} ${x + 5} ${y + 2} ${x + 5} ${y + 5} c ${x + 5} ${y + 8} ${x + 3} ${y + 10} ${x} ${y + 10} c ${x - 3} ${y + 10} ${x - 5} ${y + 8} ${x - 5} ${y + 5} c ${x - 5} ${y + 2} ${x - 3} ${y} ${x} ${y} c f\n`,
    )
    .join('');

const pages = [
  // Vertical bars, the pattern's origin 500 cells to the left and 400 below.
  {
    resources: '/Pattern << /P0 10 0 R >>',
    content: '/Pattern cs /P0 scn 0 0 200 200 re f\n',
    extra: { 10: { dict: pattern([1, 0, 0, 1, -5003.3, -4001.7], 10, bar), stream: bar } },
  },
  // The hatching of a star chart: scaled cells, the origin far above and to the left.
  {
    resources: '/Pattern << /P1 11 0 R >>',
    content:
      '0 0.2 0.2 rg 0 0 200 200 re f\n' +
      '/Pattern cs /P1 scn 10 12 m 190 30 l 170 188 l 22 160 l h f\n' +
      dots,
    extra: {
      11: {
        dict: pattern([0.55366999, 0, 0, 0.55366999, -3868.0801, 3923.8301], 13.5, hatch),
        stream: hatch,
      },
    },
  },
  // Turned a quarter: horizontal bars.
  {
    resources: '/Pattern << /P2 12 0 R >>',
    content: '/Pattern cs /P2 scn 0 0 200 200 re f\n',
    extra: { 12: { dict: pattern([0, 1.3, -1.3, 0, -3000.4, 2000.2], 10, bar), stream: bar } },
  },
  // Inside a form, filled under a translated coordinate system: the pattern stays
  // in the form's space.
  {
    resources: '/XObject << /F0 14 0 R >>',
    content: 'q 1 0 0 1 0.35 0.65 cm /F0 Do Q\n' + dots,
    extra: {
      13: {
        dict: pattern([0.55366999, 0, 0, 0.55366999, -3868.0801, 3923.8301], 13.5, hatch),
        stream: hatch,
      },
      14: {
        dict: '/Type /XObject /Subtype /Form /BBox [0 0 200 200] /Resources << /Pattern << /P3 13 0 R >> >>',
        stream:
          '0 0.2 0.2 rg 0 0 200 200 re f\n' +
          'q 1 0 0 1 47.3 61.9 cm /Pattern cs /P3 scn 0 0 m 120 -40 l 110 100 l -30 90 l h f Q\n',
      },
    },
  },
];

writeFileSync(path.join(here, 'tiling-patterns.pdf'), buildPdf(pages));
