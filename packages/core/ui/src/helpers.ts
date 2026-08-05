/**
 * The helpers bundle handed to `chrome: (base, h) => …` transforms — the
 * surgical edits plus the authoring sugar, so simple customizations need no
 * imports at all. One object, frozen shape: it IS public API (the vanilla
 * snippet passes it across the config boundary), so additions are features
 * and removals are breaking.
 */
import { custom, defineChrome, group, item } from './schema';
import { addItem, removeItems, replaceItem } from './transforms';

export const chromeHelpers = {
  addItem,
  removeItems,
  replaceItem,
  item,
  group,
  custom,
  defineChrome,
} as const;

export type ChromeHelpers = typeof chromeHelpers;
