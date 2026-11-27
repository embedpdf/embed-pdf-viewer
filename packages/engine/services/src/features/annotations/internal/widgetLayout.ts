import type { WidgetLayout } from '@embedpdf/engine-core/runtime';

/**
 * A push button's `/MK /TP` (ISO 32000-2 Table 192) as the `WidgetLayout`
 * the API reads, in the order of its numbers. Kept in engine-services so
 * engine-core stays PDFium-free (mirrors `textAlignment.ts`).
 */
const LAYOUTS: readonly WidgetLayout[] = [
  'caption',
  'image',
  'caption-below',
  'caption-above',
  'caption-right',
  'caption-left',
  'caption-over',
];

/** The layout a `/MK /TP` number gives: one outside the table reads `caption`, as the generator draws it. */
export function widgetLayoutFromCode(code: number): WidgetLayout {
  return LAYOUTS[code] ?? 'caption';
}

/** The `/MK /TP` number a layout is written as. */
export function widgetLayoutToCode(layout: WidgetLayout): number {
  return LAYOUTS.indexOf(layout);
}
