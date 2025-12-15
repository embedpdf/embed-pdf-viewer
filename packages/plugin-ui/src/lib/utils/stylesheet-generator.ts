import {
  UISchema,
  ToolbarSchema,
  ToolbarItem,
  TabItem,
  MenuSchema,
  MenuItem,
  SidebarSchema,
  SelectionMenuSchema,
  SelectionMenuItem,
  BreakpointRule,
  VisibilityDependency,
  ResponsiveItemMetadata,
} from '../types';
import { resolveResponsiveMetadata } from './responsive-utils';
import { UI_ATTRIBUTES, UI_SELECTORS } from './consts';

// ─────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────

export interface StylesheetConfig {
  /** Use container queries (@container) instead of media queries (@media). Default: true */
  useContainerQueries?: boolean;
}

export interface StylesheetGenerationOptions {
  config?: StylesheetConfig;
  /** Current locale for locale-aware responsive rules */
  locale?: string;
}

const DEFAULT_CONFIG: Required<StylesheetConfig> = {
  useContainerQueries: true,
};

// ─────────────────────────────────────────────────────────
// Analysis Types
// ─────────────────────────────────────────────────────────

interface SchemaAnalysis {
  /** All unique categories found in schema */
  categories: Set<string>;
  /** Map of item ID -> categories array */
  itemCategories: Map<string, string[]>;
  /** All dependency rules collected from schema */
  dependencies: DependencyRule[];
  /** Breakpoint visibility info per menu (for dependency calculations) */
  menuBreakpoints: Map<string, BreakpointVisibility[]>;
  /** All responsive item metadata */
  responsiveItems: Map<string, ResponsiveItemMetadata>;
}

interface DependencyRule {
  itemId: string;
  dependsOnMenuId?: string;
  dependsOnItemIds?: string[];
}

interface BreakpointVisibility {
  minWidth?: number;
  maxWidth?: number;
  /** Item IDs that are responsive-visible at this breakpoint */
  visibleItemIds: string[];
  /** Categories that are responsive-visible at this breakpoint (kept for backwards compat) */
  visibleCategories: Set<string>;
}

// ─────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────

/**
 * Generates complete CSS stylesheet for UI visibility.
 *
 * Includes:
 * 1. Responsive visibility rules (container queries or media queries)
 * 2. Category visibility rules
 * 3. Breakpoint-aware dependency rules
 *
 * This is pure logic - no DOM manipulation.
 *
 * @param schema - The UI schema to generate CSS for
 * @param options - Generation options including config and locale
 * @returns Generated CSS string
 */
export function generateUIStylesheet(
  schema: UISchema,
  options: StylesheetGenerationOptions = {},
): string {
  const cfg = { ...DEFAULT_CONFIG, ...options.config };
  const locale = options.locale;
  const analysis = analyzeSchema(schema, locale);
  const sections: string[] = [];

  // Header
  sections.push(generateHeader(locale));

  // 1. Responsive visibility rules
  const responsiveCSS = generateResponsiveRules(analysis, cfg);
  if (responsiveCSS) sections.push(responsiveCSS);

  // 2. Category visibility rules
  const categoryCSS = generateCategoryRules(analysis, cfg);
  if (categoryCSS) sections.push(categoryCSS);

  // 3. Dependency rules (breakpoint-aware)
  const dependencyCSS = generateDependencyRules(analysis, cfg);
  if (dependencyCSS) sections.push(dependencyCSS);

  return sections.filter((s) => s.trim()).join('\n\n');
}

/**
 * Extract all unique categories from the schema.
 * Useful for building UI to toggle categories.
 *
 * @param schema - The UI schema to extract categories from
 * @returns Sorted array of unique category names
 */
export function extractCategories(schema: UISchema): string[] {
  const analysis = analyzeSchema(schema);
  return Array.from(analysis.categories).sort();
}

/**
 * Extract a map of item ID -> categories from the schema.
 * Used to compute which items are hidden based on disabled categories.
 *
 * @param schema - The UI schema to extract item categories from
 * @returns Map of item ID to array of categories
 */
export function extractItemCategories(schema: UISchema): Map<string, string[]> {
  const analysis = analyzeSchema(schema);
  return analysis.itemCategories;
}

/**
 * Compute which items are hidden based on disabled categories.
 * An item is hidden if ANY of its categories is disabled.
 *
 * @param itemCategories - Map of item ID to categories (from extractItemCategories)
 * @param disabledCategories - Array of currently disabled categories
 * @returns Array of hidden item IDs
 */
export function computeHiddenItems(
  itemCategories: Map<string, string[]>,
  disabledCategories: string[],
): string[] {
  const disabledSet = new Set(disabledCategories);
  const hiddenItems: string[] = [];

  itemCategories.forEach((categories, itemId) => {
    // Item is hidden if ANY of its categories is disabled
    if (categories.some((cat) => disabledSet.has(cat))) {
      hiddenItems.push(itemId);
    }
  });

  return hiddenItems;
}

/**
 * Get the stylesheet configuration with defaults applied.
 *
 * @param config - Optional partial configuration
 * @returns Complete configuration with defaults
 */
export function getStylesheetConfig(config: StylesheetConfig = {}): Required<StylesheetConfig> {
  return { ...DEFAULT_CONFIG, ...config };
}

// ─────────────────────────────────────────────────────────
// Schema Analysis
// ─────────────────────────────────────────────────────────

function analyzeSchema(schema: UISchema, locale?: string): SchemaAnalysis {
  const categories = new Set<string>();
  const itemCategories = new Map<string, string[]>();
  const dependencies: DependencyRule[] = [];
  const menuBreakpoints = new Map<string, BreakpointVisibility[]>();
  const responsiveItems = new Map<string, ResponsiveItemMetadata>();

  // Analyze menus first (needed for dependency calculations)
  for (const [menuId, menu] of Object.entries(schema.menus)) {
    analyzeMenu(
      menuId,
      menu,
      categories,
      itemCategories,
      dependencies,
      menuBreakpoints,
      responsiveItems,
      locale,
    );
  }

  // Analyze toolbars
  for (const [toolbarId, toolbar] of Object.entries(schema.toolbars)) {
    analyzeToolbar(
      toolbarId,
      toolbar,
      categories,
      itemCategories,
      dependencies,
      responsiveItems,
      locale,
    );
  }

  // Analyze panels
  for (const [panelId, panel] of Object.entries(schema.sidebars)) {
    analyzePanel(panelId, panel, categories, itemCategories, dependencies);
  }

  // Analyze selection menus
  for (const [selMenuId, selMenu] of Object.entries(schema.selectionMenus || {})) {
    analyzeSelectionMenu(
      selMenuId,
      selMenu,
      categories,
      itemCategories,
      dependencies,
      responsiveItems,
      locale,
    );
  }

  return { categories, itemCategories, dependencies, menuBreakpoints, responsiveItems };
}

// ─────────────────────────────────────────────────────────
// Menu Analysis
// ─────────────────────────────────────────────────────────

function analyzeMenu(
  menuId: string,
  menu: MenuSchema,
  categories: Set<string>,
  itemCategories: Map<string, string[]>,
  dependencies: DependencyRule[],
  menuBreakpoints: Map<string, BreakpointVisibility[]>,
  responsiveItems: Map<string, ResponsiveItemMetadata>,
  locale?: string,
): void {
  // Menu-level categories and dependencies
  collectCategoriesAndDependency(
    menuId,
    menu.categories,
    menu.visibilityDependsOn,
    categories,
    itemCategories,
    dependencies,
  );

  // Collect from menu items
  analyzeMenuItems(menu.items, categories, itemCategories, dependencies);

  // Get responsive metadata with locale
  const metadata = resolveResponsiveMetadata(menu, locale);
  if (metadata) {
    metadata.items.forEach((itemMeta, itemId) => {
      responsiveItems.set(itemId, itemMeta);
    });
  }

  // Compute visibility per breakpoint for dependency calculations
  const breakpointVisibilities = computeMenuBreakpointVisibilities(menu, itemCategories, locale);
  menuBreakpoints.set(menuId, breakpointVisibilities);
}

function analyzeMenuItems(
  items: MenuItem[],
  categories: Set<string>,
  itemCategories: Map<string, string[]>,
  dependencies: DependencyRule[],
): void {
  for (const item of items) {
    collectCategoriesAndDependency(
      item.id,
      item.categories,
      item.visibilityDependsOn,
      categories,
      itemCategories,
      dependencies,
    );

    // Recurse into sections
    if (item.type === 'section') {
      analyzeMenuItems(item.items, categories, itemCategories, dependencies);
    }
  }
}

function computeMenuBreakpointVisibilities(
  menu: MenuSchema,
  itemCategories: Map<string, string[]>,
  locale?: string,
): BreakpointVisibility[] {
  const breakpointVisibilities: BreakpointVisibility[] = [];

  // Get effective breakpoints (with locale overrides applied)
  const metadata = resolveResponsiveMetadata(menu, locale);

  if (menu.responsive?.breakpoints && metadata) {
    const sortedBreakpoints = Array.from(metadata.breakpoints.entries()).sort(
      (a, b) => (a[1].minWidth ?? 0) - (b[1].minWidth ?? 0),
    );

    for (const [_bpId, bp] of sortedBreakpoints) {
      const visibleItems = computeVisibleItemsAtBreakpoint(metadata, bp);
      const visibleCats = new Set<string>();

      for (const itemId of visibleItems) {
        const cats = itemCategories.get(itemId);
        if (cats) cats.forEach((c) => visibleCats.add(c));
      }

      breakpointVisibilities.push({
        minWidth: bp.minWidth,
        maxWidth: bp.maxWidth,
        visibleItemIds: visibleItems,
        visibleCategories: visibleCats,
      });
    }
  } else {
    // No responsive rules - collect all item IDs and categories
    const allItemIds: string[] = [];
    const allCats = new Set<string>();
    collectAllMenuItemInfo(menu.items, itemCategories, allItemIds, allCats);
    breakpointVisibilities.push({ visibleItemIds: allItemIds, visibleCategories: allCats });
  }

  return breakpointVisibilities;
}

function collectAllMenuItemInfo(
  items: MenuItem[],
  itemCategories: Map<string, string[]>,
  resultIds: string[],
  resultCats: Set<string>,
): void {
  for (const item of items) {
    resultIds.push(item.id);
    const cats = itemCategories.get(item.id);
    if (cats) cats.forEach((c) => resultCats.add(c));

    if (item.type === 'section') {
      collectAllMenuItemInfo(item.items, itemCategories, resultIds, resultCats);
    }
  }
}

function computeVisibleItemsAtBreakpoint(
  metadata: {
    items: Map<string, ResponsiveItemMetadata>;
    breakpoints: Map<string, { minWidth?: number; maxWidth?: number }>;
  },
  targetBp: { minWidth?: number; maxWidth?: number },
): string[] {
  const visible: string[] = [];

  metadata.items.forEach((itemMeta, itemId) => {
    // Check if item is visible at this breakpoint
    let isVisible = itemMeta.defaultVisible;

    for (const rule of itemMeta.visibilityRules) {
      // Check if this rule applies to our target breakpoint
      const ruleApplies =
        (rule.minWidth === undefined ||
          (targetBp.minWidth !== undefined && targetBp.minWidth >= rule.minWidth)) &&
        (rule.maxWidth === undefined ||
          (targetBp.maxWidth !== undefined && targetBp.maxWidth <= rule.maxWidth));

      if (ruleApplies) {
        isVisible = rule.visible;
      }
    }

    if (isVisible) {
      visible.push(itemId);
    }
  });

  return visible;
}

// ─────────────────────────────────────────────────────────
// Toolbar Analysis
// ─────────────────────────────────────────────────────────

function analyzeToolbar(
  toolbarId: string,
  toolbar: ToolbarSchema,
  categories: Set<string>,
  itemCategories: Map<string, string[]>,
  dependencies: DependencyRule[],
  responsiveItems: Map<string, ResponsiveItemMetadata>,
  locale?: string,
): void {
  // Toolbar-level categories and dependencies
  collectCategoriesAndDependency(
    toolbarId,
    toolbar.categories,
    toolbar.visibilityDependsOn,
    categories,
    itemCategories,
    dependencies,
  );

  // Get responsive metadata with locale
  const metadata = resolveResponsiveMetadata(toolbar, locale);
  if (metadata) {
    metadata.items.forEach((itemMeta, itemId) => {
      responsiveItems.set(itemId, itemMeta);
    });
  }

  // Analyze items
  analyzeToolbarItems(toolbar.items, categories, itemCategories, dependencies);
}

function analyzeToolbarItems(
  items: ToolbarItem[],
  categories: Set<string>,
  itemCategories: Map<string, string[]>,
  dependencies: DependencyRule[],
): void {
  for (const item of items) {
    collectCategoriesAndDependency(
      item.id,
      item.categories,
      item.visibilityDependsOn,
      categories,
      itemCategories,
      dependencies,
    );

    // Recurse into groups
    if (item.type === 'group' && item.items) {
      analyzeToolbarItems(item.items, categories, itemCategories, dependencies);
    }

    // Recurse into tab groups
    if (item.type === 'tab-group' && item.tabs) {
      analyzeTabItems(item.tabs, categories, itemCategories, dependencies);
    }
  }
}

function analyzeTabItems(
  tabs: TabItem[],
  categories: Set<string>,
  itemCategories: Map<string, string[]>,
  dependencies: DependencyRule[],
): void {
  for (const tab of tabs) {
    collectCategoriesAndDependency(
      tab.id,
      tab.categories,
      tab.visibilityDependsOn,
      categories,
      itemCategories,
      dependencies,
    );
  }
}

// ─────────────────────────────────────────────────────────
// Panel Analysis
// ─────────────────────────────────────────────────────────

function analyzePanel(
  panelId: string,
  panel: SidebarSchema,
  categories: Set<string>,
  itemCategories: Map<string, string[]>,
  dependencies: DependencyRule[],
): void {
  // Panel-level categories and dependencies
  collectCategoriesAndDependency(
    panelId,
    panel.categories,
    panel.visibilityDependsOn,
    categories,
    itemCategories,
    dependencies,
  );

  // Analyze panel tabs if present
  if (panel.content.type === 'tabs') {
    for (const tab of panel.content.tabs) {
      collectCategoriesAndDependency(
        tab.id,
        tab.categories,
        tab.visibilityDependsOn,
        categories,
        itemCategories,
        dependencies,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────
// Selection Menu Analysis
// ─────────────────────────────────────────────────────────

function analyzeSelectionMenu(
  selMenuId: string,
  selMenu: SelectionMenuSchema,
  categories: Set<string>,
  itemCategories: Map<string, string[]>,
  dependencies: DependencyRule[],
  responsiveItems: Map<string, ResponsiveItemMetadata>,
  locale?: string,
): void {
  // Selection menu level
  collectCategoriesAndDependency(
    selMenuId,
    selMenu.categories,
    selMenu.visibilityDependsOn,
    categories,
    itemCategories,
    dependencies,
  );

  // Get responsive metadata if present
  if (selMenu.responsive) {
    const metadata = resolveResponsiveMetadata(selMenu, locale);
    if (metadata) {
      metadata.items.forEach((itemMeta, itemId) => {
        responsiveItems.set(itemId, itemMeta);
      });
    }
  }

  // Analyze items
  analyzeSelectionMenuItems(selMenu.items, categories, itemCategories, dependencies);
}

function analyzeSelectionMenuItems(
  items: SelectionMenuItem[],
  categories: Set<string>,
  itemCategories: Map<string, string[]>,
  dependencies: DependencyRule[],
): void {
  for (const item of items) {
    collectCategoriesAndDependency(
      item.id,
      item.categories,
      item.visibilityDependsOn,
      categories,
      itemCategories,
      dependencies,
    );

    // Recurse into groups
    if (item.type === 'group' && item.items) {
      analyzeSelectionMenuItems(item.items, categories, itemCategories, dependencies);
    }
  }
}

// ─────────────────────────────────────────────────────────
// Shared Analysis Helpers
// ─────────────────────────────────────────────────────────

function collectCategoriesAndDependency(
  itemId: string,
  itemCats: string[] | undefined,
  visibilityDep: VisibilityDependency | undefined,
  categories: Set<string>,
  itemCategories: Map<string, string[]>,
  dependencies: DependencyRule[],
): void {
  // Collect categories
  if (itemCats?.length) {
    itemCats.forEach((c) => categories.add(c));
    itemCategories.set(itemId, itemCats);
  }

  // Collect dependencies
  if (visibilityDep && (visibilityDep.menuId || visibilityDep.itemIds?.length)) {
    dependencies.push({
      itemId,
      dependsOnMenuId: visibilityDep.menuId,
      dependsOnItemIds: visibilityDep.itemIds,
    });
  }
}

// ─────────────────────────────────────────────────────────
// CSS Generation - Header
// ─────────────────────────────────────────────────────────

function generateHeader(locale?: string): string {
  const localeInfo = locale ? ` (locale: ${locale})` : '';
  return `/* ═══════════════════════════════════════════════════════════════════════════ */
/* EmbedPDF UI Stylesheet - Auto-generated${localeInfo}                         */
/* DO NOT EDIT MANUALLY - This file is generated from your UI schema            */
/* ═══════════════════════════════════════════════════════════════════════════ */`;
}

// ─────────────────────────────────────────────────────────
// CSS Generation - Responsive Rules
// ─────────────────────────────────────────────────────────

function generateResponsiveRules(
  analysis: SchemaAnalysis,
  cfg: Required<StylesheetConfig>,
): string {
  const rules: string[] = [];
  const queryType = cfg.useContainerQueries ? '@container' : '@media';
  const processedItems = new Set<string>();

  // Process all responsive items
  analysis.responsiveItems.forEach((itemMeta, itemId) => {
    if (processedItems.has(itemId)) return;
    processedItems.add(itemId);

    const itemRules = generateItemResponsiveRules(itemId, itemMeta, queryType, cfg);
    if (itemRules) rules.push(itemRules);
  });

  if (rules.length === 0) return '';

  return `/* ─── Responsive Visibility Rules ─── */
/* Items show/hide based on container width */

${rules.join('\n\n')}`;
}

function generateItemResponsiveRules(
  itemId: string,
  metadata: ResponsiveItemMetadata,
  queryType: string,
  cfg: Required<StylesheetConfig>,
): string | null {
  if (metadata.visibilityRules.length === 0) return null;

  const rules: string[] = [];
  const selector = UI_SELECTORS.ITEM(itemId);

  // Base visibility (for mobile-first approach)
  if (!metadata.defaultVisible) {
    rules.push(`${selector} { display: none; }`);
  }

  // Breakpoint-specific rules
  for (const rule of metadata.visibilityRules) {
    const conditions: string[] = [];

    if (rule.minWidth !== undefined) {
      conditions.push(`(min-width: ${rule.minWidth}px)`);
    }
    if (rule.maxWidth !== undefined) {
      conditions.push(`(max-width: ${rule.maxWidth}px)`);
    }

    if (conditions.length > 0) {
      const display = rule.visible ? 'flex' : 'none';
      rules.push(`${queryType} ${conditions.join(' and ')} {
  ${selector} { display: ${display}; }
}`);
    }
  }

  return rules.length > 0 ? rules.join('\n') : null;
}

// ─────────────────────────────────────────────────────────
// CSS Generation - Category Rules
// ─────────────────────────────────────────────────────────

function generateCategoryRules(analysis: SchemaAnalysis, cfg: Required<StylesheetConfig>): string {
  if (analysis.categories.size === 0) return '';

  const rules: string[] = [];

  // Sort categories for consistent output
  const sortedCategories = Array.from(analysis.categories).sort();

  for (const category of sortedCategories) {
    // Using ~= selector matches when category is in space-separated list
    // This works correctly for items with multiple categories
    rules.push(
      `${UI_SELECTORS.ROOT}[${UI_ATTRIBUTES.DISABLED_CATEGORIES}~="${category}"] [${UI_ATTRIBUTES.CATEGORIES}~="${category}"] {
  display: none !important;
}`,
    );
  }

  return `/* ─── Category Visibility Rules ─── */
/* Items hide when ANY of their categories is disabled */
/* Use: data-disabled-categories="category1 category2" on root element */

${rules.join('\n\n')}`;
}

// ─────────────────────────────────────────────────────────
// CSS Generation - Dependency Rules
// ─────────────────────────────────────────────────────────

function generateDependencyRules(
  analysis: SchemaAnalysis,
  cfg: Required<StylesheetConfig>,
): string {
  if (analysis.dependencies.length === 0) return '';

  const rules: string[] = [];
  const queryType = cfg.useContainerQueries ? '@container' : '@media';

  for (const dep of analysis.dependencies) {
    const depRules = generateSingleDependencyRules(dep, analysis, queryType, cfg);
    if (depRules.length > 0) {
      rules.push(...depRules);
    }
  }

  if (rules.length === 0) return '';

  return `/* ─── Dependency Visibility Rules ─── */
/* Container elements hide when all their dependencies are hidden */

${rules.join('\n\n')}`;
}

function generateSingleDependencyRules(
  dep: DependencyRule,
  analysis: SchemaAnalysis,
  queryType: string,
  cfg: Required<StylesheetConfig>,
): string[] {
  const rules: string[] = [];

  // Handle menu-based dependencies
  // Uses data-hidden-items to check if all visible items at each breakpoint are hidden
  if (dep.dependsOnMenuId) {
    const breakpoints = analysis.menuBreakpoints.get(dep.dependsOnMenuId);
    if (breakpoints && breakpoints.length > 0) {
      rules.push(`/* "${dep.itemId}" depends on menu "${dep.dependsOnMenuId}" */`);

      for (const bp of breakpoints) {
        if (bp.visibleItemIds.length === 0) continue;

        // Generate selector: hide when ALL visible items at this breakpoint are hidden
        // Uses data-hidden-items which is computed by JavaScript
        const hiddenItemSelectors = bp.visibleItemIds
          .sort()
          .map((id) => UI_SELECTORS.HIDDEN_ITEM(id))
          .join('');

        const cssRule = `${UI_SELECTORS.ROOT}${hiddenItemSelectors} ${UI_SELECTORS.ITEM(dep.itemId)} {
  display: none !important;
}`;

        // Wrap in media/container query if breakpoint has width constraints
        const conditions: string[] = [];
        if (bp.minWidth !== undefined) conditions.push(`(min-width: ${bp.minWidth}px)`);
        if (bp.maxWidth !== undefined) conditions.push(`(max-width: ${bp.maxWidth}px)`);

        if (conditions.length > 0) {
          rules.push(`${queryType} ${conditions.join(' and ')} {
  ${cssRule}
}`);
        } else {
          rules.push(cssRule);
        }
      }
    }
  }

  // Handle direct item dependencies
  // Uses data-hidden-items to check if all specified items are hidden
  if (dep.dependsOnItemIds?.length) {
    rules.push(`/* "${dep.itemId}" depends on items: ${dep.dependsOnItemIds.join(', ')} */`);

    // Generate selector: hide when ALL dependent items are hidden
    const hiddenItemSelectors = dep.dependsOnItemIds
      .sort()
      .map((id) => UI_SELECTORS.HIDDEN_ITEM(id))
      .join('');

    rules.push(`${UI_SELECTORS.ROOT}${hiddenItemSelectors} ${UI_SELECTORS.ITEM(dep.itemId)} {
  display: none !important;
}`);
  }

  return rules;
}
