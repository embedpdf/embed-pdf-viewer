/**
 * Using 'embedpdf' prefix to avoid conflicts with other libraries.
 */
export const UI_ATTRIBUTES = {
  /** Root element marker */
  ROOT: 'data-epdf',
  /** Style element marker for deduplication */
  STYLES: 'data-epdf-s',
  /** Item ID for responsive and dependency rules */
  ITEM: 'data-epdf-i',
  /** Item categories for category-based hiding */
  CATEGORIES: 'data-epdf-cat',
  /** Disabled categories list on root element */
  DISABLED_CATEGORIES: 'data-epdf-dis',
} as const;

/**
 * CSS selectors derived from attributes
 */
export const UI_SELECTORS = {
  ROOT: `[${UI_ATTRIBUTES.ROOT}]`,
  STYLES: `[${UI_ATTRIBUTES.STYLES}]`,
  ITEM: (id: string) => `[${UI_ATTRIBUTES.ITEM}="${id}"]`,
  CATEGORIES: (category: string) => `[${UI_ATTRIBUTES.CATEGORIES}~="${category}"]`,
  DISABLED_CATEGORY: (category: string) => `[${UI_ATTRIBUTES.DISABLED_CATEGORIES}~="${category}"]`,
} as const;
