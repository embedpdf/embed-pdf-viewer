// Writes repeated-paths.pdf: pages that draw the same path several times in a
// row under every condition that can change how a repeat composites. A render
// that reuses a path's rasterization must give the same bytes on each page.
//
//   node test/render-baseline/fixtures/generate-repeated-paths.mjs

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPdf } from './pdf.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const dot = (x, y) => `${x} ${y} m ${x} ${y} l S\n`;
const seg = (x0, y0, x1, y1) => `${x0} ${y0} m ${x1} ${y1} l S\n`;
const repeat = (text, times) => text.repeat(times);

// A deterministic generator for the stress page.
function* numbers(seed) {
  let state = seed;
  for (;;) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    yield state / 0x7fffffff;
  }
}

const pages = [];

// Runs of identical round-cap dots and segments in device-like units, as CAD
// plots printed through PostScript produce them.
pages.push({
  content:
    'q 0.24 0 0 0.24 0 0 cm 1 J 1 j\n' +
    [1, 3, 6]
      .map(
        (width, i) =>
          `${width} w ${0.2 * i} G\n` +
          repeat(dot(100 + 60 * i, 100), 6) +
          repeat(dot(101 + 60 * i, 100), 3) +
          repeat(seg(100 + 60 * i, 200, 140 + 60 * i, 200), 4) +
          repeat(seg(100 + 60 * i, 300, 100 + 60 * i, 360), 5),
      )
      .join('') +
    'Q\n',
});

// Identical strokes and fills with constant alpha: every repeat darkens the
// antialiased edge again.
pages.push({
  resources: '/ExtGState << /A << /CA 0.5 /ca 0.5 >> /B << /CA 0.2 /ca 0.2 >> >>',
  content:
    '/A gs 2 w 1 J 0 0 1 RG 1 0 0 rg\n' +
    repeat(seg(20, 20, 180, 60), 4) +
    repeat('20 80 60 40 re f\n', 3) +
    '/B gs\n' +
    repeat(seg(20, 150, 180, 170), 5) +
    repeat('120 80 50 50 re f\n', 2),
});

// The same path under changing clips, rectangular and not.
pages.push({
  content:
    '3 w 1 J 0 0.5 0 RG\n' +
    ['10 10 90 90 re W n', '50 50 120 120 re W n', '20 20 m 180 40 l 100 180 l h W* n', ''].map(
      (clip) => `q ${clip}\n${repeat(seg(10, 100, 190, 110), 2)}${repeat(dot(100, 100), 3)}Q\n`,
    ).join(''),
});

// Fill and stroke in one operator, opaque and with alpha, winding and even-odd.
pages.push({
  resources: '/ExtGState << /A << /CA 0.6 /ca 0.4 >> >>',
  content:
    '4 w 1 0 0 RG 0 0 1 rg\n' +
    repeat('30 30 m 170 50 l 100 170 l h B\n', 3) +
    '/A gs\n' +
    repeat('40 40 m 160 60 l 90 160 l h B*\n', 3) +
    repeat('20 100 m 180 100 l 100 20 l 100 180 l h f*\n', 2) +
    repeat('20 100 m 180 100 l 100 20 l 100 180 l h f\n', 2),
});

// Dashes, including a changed phase between otherwise identical strokes.
pages.push({
  content:
    '2 w 0 J\n' +
    '[6 3] 0 d\n' +
    repeat(seg(10, 50, 190, 60), 3) +
    '[6 3] 2 d\n' +
    repeat(seg(10, 50, 190, 60), 2) +
    '[0.01 0.01] 0 d\n' +
    repeat(seg(10, 120, 190, 130), 3),
});

// A knockout transparency group: repeats replace instead of compositing.
pages.push({
  resources: '/XObject << /K 7 0 R >> /ExtGState << /A << /CA 0.5 /ca 0.5 >> >>',
  content: 'q /K Do Q\n',
  extra: {
    7: {
      dict: '/Type /XObject /Subtype /Form /BBox [0 0 200 200] /Group << /S /Transparency /K true >> /Resources << /ExtGState << /A << /CA 0.5 /ca 0.5 >> >> >>',
      stream: '/A gs 6 w 1 J 1 0 0 RG\n' + repeat(seg(20, 20, 180, 180), 3) + repeat(seg(20, 180, 180, 20), 3),
    },
  },
});

// A multiply blend.
pages.push({
  resources: '/ExtGState << /M << /BM /Multiply /CA 0.8 /ca 0.8 >> >>',
  content:
    '0.9 0.6 0.1 rg 20 20 160 160 re f\n/M gs 5 w 0.1 0.3 0.9 RG\n' +
    repeat(seg(10, 100, 190, 100), 3) +
    repeat('60 60 80 80 re f\n', 2),
});

// Coordinates that differ only in the sign of zero, and a changed matrix.
pages.push({
  content:
    '2 w 1 J\n' +
    '-0 -0 m 100 100 l S\n0 0 m 100 100 l S\n' +
    'q 1 0 0 1 20 0 cm\n' +
    repeat(seg(0, 20, 100, 40), 2) +
    'Q q 1 0 0 1 20.5 0 cm\n' +
    repeat(seg(0, 20, 100, 40), 2) +
    'Q\n',
});

// Caps: a zero-length stroke paints only with round (and here square) caps.
pages.push({
  content:
    '8 w\n0 J\n' +
    repeat(dot(50, 50), 3) +
    '1 J\n' +
    repeat(dot(100, 50), 3) +
    '2 J\n' +
    repeat(dot(150, 50), 3) +
    '1 j 0 J\n' +
    repeat('20 100 m 100 180 l 180 100 l S\n', 3) +
    '2 j\n' +
    repeat('20 100 m 100 140 l 180 100 l S\n', 2),
});

// Curves.
pages.push({
  content:
    '1.5 w\n' +
    repeat('20 20 m 60 180 140 -20 180 180 c S\n', 3) +
    repeat('20 100 m 100 190 180 100 v 100 10 20 100 y f\n', 2),
});

// Long runs of repeats too large to keep at most scales, with alpha, so each
// repeat must still be drawn exactly once.
pages.push({
  resources: '/ExtGState << /A << /CA 0.3 /ca 0.3 >> >>',
  content:
    '/A gs 12 w 1 J 0 0 1 RG 1 0.5 0 rg\n' +
    repeat('20 20 160 70 re f\n', 5) +
    repeat('20 20 m 60 190 140 10 180 180 c S\n', 5) +
    repeat('30 110 m 170 120 l 100 190 l h B\n', 5),
});

// A stress page: many short strokes with runs of repeats, state changes and
// clips in between.
{
  const rand = numbers(7);
  let content = 'q 0.24 0 0 0.24 0 0 cm 1 J 1 j\n';
  let x = 400;
  let y = 400;
  for (let i = 0; i < 6000; i++) {
    const r = rand.next().value;
    if (r < 0.02) content += `${1 + Math.floor(rand.next().value * 4)} w\n`;
    else if (r < 0.03) content += `${(rand.next().value * 0.8).toFixed(3)} G\n`;
    else if (r < 0.035) content += `Q q 0.24 0 0 0.24 0 0 cm 1 J 1 j ${Math.floor(rand.next().value * 400)} 0 300 800 re W n\n`;
    const dx = Math.floor(rand.next().value * 5) - 2;
    const dy = Math.floor(rand.next().value * 5) - 2;
    const repeats = 1 + Math.floor(rand.next().value * 4);
    content += repeat(seg(x, y, x + dx, y + dy), repeats);
    x = Math.max(10, Math.min(820, x + dx));
    y = Math.max(10, Math.min(820, y + dy));
  }
  pages.push({ content: content + 'Q\n' });
}

writeFileSync(path.join(here, 'repeated-paths.pdf'), buildPdf(pages));
