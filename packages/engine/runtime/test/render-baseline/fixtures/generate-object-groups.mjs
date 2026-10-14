// Writes object-groups.pdf: pages with enough objects for a render to pass over runs
// of them that miss its clip, in the layouts that decide whether a run can be passed
// over. A render that skips runs must give the same bytes on each page and tile.
//
//   node test/render-baseline/fixtures/generate-object-groups.mjs

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPdf } from './pdf.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

// Small filled squares on a 48 × 48 grid over the lower-left quarter of the page, row
// by row, so consecutive objects lie close together.
function grid() {
  let content = '';
  for (let row = 0; row < 48; row++) {
    content += `${(row / 48).toFixed(3)} 0.2 ${(1 - row / 48).toFixed(3)} rg\n`;
    for (let col = 0; col < 48; col++) content += `${4 + 2 * col} ${4 + 2 * row} 1.5 1.5 re f\n`;
  }
  return content;
}

// A deterministic generator for scattered positions.
function* numbers(seed) {
  let state = seed;
  for (;;) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    yield state / 0x7fffffff;
  }
}

const pages = [];

// The grid, in page order: tiles away from the lower-left quarter miss every run.
pages.push({ content: grid() });

// The grid inside a form whose frame spans the page, so the form object reaches every
// tile and the form's own runs decide what is drawn. Drawn a second time, scaled into
// the upper-right quarter.
pages.push({
  resources: '/XObject << /G 7 0 R >>',
  content: 'q /G Do Q\nq 0.5 0 0 0.5 100 100 cm /G Do Q\n',
  extra: {
    7: {
      dict: '/Type /XObject /Subtype /Form /BBox [0 0 200 200]',
      stream: '0.5 w 0 0 0 RG 1 1 198 198 re S\n' + grid(),
    },
  },
});

// Squares scattered over the whole page: runs overlap every tile.
{
  const rand = numbers(11);
  let content = '0.3 0.3 0.3 rg\n';
  for (let i = 0; i < 2000; i++) {
    const x = (rand.next().value * 196).toFixed(2);
    const y = (rand.next().value * 196).toFixed(2);
    content += `${x} ${y} 2 2 re f\n`;
  }
  pages.push({ content });
}

// Runs of 128 alternating between the lower-left and upper-right corners, 1500 objects
// in all, so the last run is partial.
{
  let content = '';
  for (let i = 0; i < 1500; i++) {
    const run = Math.floor(i / 128);
    const [x0, y0] = run % 2 === 0 ? [4, 4] : [120, 120];
    const k = i % 128;
    if (k === 0) content += `${run % 2 === 0 ? '0.8 0.1 0.1' : '0.1 0.1 0.8'} rg\n`;
    content += `${x0 + 2 * (k % 32)} ${y0 + 2 * Math.floor(k / 32) + 10 * (run >> 1)} 1.5 1.5 re f\n`;
  }
  pages.push({ content });
}

writeFileSync(path.join(here, 'object-groups.pdf'), buildPdf(pages));
