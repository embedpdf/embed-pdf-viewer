/**
 * @embedpdf/angular/toolbar: a toolbar that fits its width (or its height, standing up), with
 * every part yours.
 *
 *   <epdf-toolbar [bar] [orientation]>           measures, folds, fills a "More" menu, arrow keys
 *   <ng-template epdfToolbarCommand>, …          the parts you draw (templates.ts)
 *   group(), item(), custom()                    the bar's vocabulary, from @embedpdf/core-ui
 */

// The toolbar's vocabulary: the schema a bar is written in.
export { DEFAULT_IMPORTANCE, PINNED, custom, group, item } from '@embedpdf/core-ui';
export type {
  BarChild,
  BarGroup,
  BarItem,
  BarSchema,
  BarSections,
  CustomItem,
  Importance,
  OverflowRow,
  OverflowSection,
  Variant,
} from '@embedpdf/core-ui';
export * from './templates';
export { EpdfToolbar } from './toolbar';
