/**
 * @embedpdf/angular/toolbar: a toolbar that fits its width, with every part yours.
 *
 *   <epdf-toolbar [bar]>                         measures, folds, and fills a "More" menu
 *   <ng-template epdfToolbarCommand>, …          the parts you draw (templates.ts)
 *   group(), item(), custom(), addItem(), …      the bar's vocabulary, from @embedpdf/core-ui
 */

// The toolbar's vocabulary: the schema a bar is written in, and the helpers that change one.
export {
  DEFAULT_IMPORTANCE,
  PINNED,
  addItem,
  chromeHelpers,
  custom,
  defineChrome,
  group,
  item,
  removeItems,
  replaceItem,
  validateChrome,
} from '@embedpdf/core-ui';
export type {
  AddItemSpec,
  BarChild,
  BarGroup,
  BarItem,
  BarSchema,
  BarSections,
  ChromeHelpers,
  ChromeSchema,
  CustomItem,
  FrameSchema,
  Importance,
  MenuSchema,
  MenuSection,
  OverflowRow,
  OverflowSection,
  Variant,
} from '@embedpdf/core-ui';
export * from './templates';
export { EpdfToolbar } from './toolbar';
