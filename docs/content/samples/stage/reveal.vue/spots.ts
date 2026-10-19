import type { RevealZoom } from '@embedpdf/vue/stage';

// Spots to jump to: a page index and a box in page coordinates (points from
// the page's top-left), like a search hit or a comment would give you.
export const SPOTS = [
  { label: 'Top of page 2', page: 1, rect: { x: 72, y: 72, width: 468, height: 96 } },
  { label: 'Middle of page 3', page: 2, rect: { x: 72, y: 340, width: 468, height: 120 } },
  { label: 'Corner of page 4', page: 3, rect: { x: 330, y: 620, width: 210, height: 110 } },
];

export const ZOOMS: { label: string; zoom: RevealZoom }[] = [
  { label: 'Keep zoom', zoom: 'keep' },
  { label: 'Fit width', zoom: 'fit-width' },
  { label: 'Fit the box', zoom: 'fit' },
];
