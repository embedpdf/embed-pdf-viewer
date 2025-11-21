import {
  ToolbarSchema,
  MenuSchema,
  ResponsiveMetadata,
  ResponsiveItemMetadata,
  ResponsiveVisibilityRule,
  BreakpointRule,
  LocaleOverrides,
} from '../types';

/**
 * Processes responsive configuration and returns metadata for all items
 * This is framework-agnostic and lives in plugin-ui
 */
export function resolveResponsiveMetadata(
  schema: ToolbarSchema | MenuSchema,
  currentLocale?: string,
): ResponsiveMetadata | null {
  if (!schema.responsive?.breakpoints) {
    return null;
  }

  // Apply locale overrides to get effective breakpoints
  const effectiveBreakpoints = applyLocaleOverrides(
    schema.responsive.breakpoints,
    schema.responsive.localeOverrides,
    currentLocale,
  );

  const items = new Map<string, ResponsiveItemMetadata>();
  const breakpoints = new Map<string, { minWidth?: number; maxWidth?: number }>();

  // Extract breakpoint definitions (widths never change!)
  for (const [breakpointId, config] of Object.entries(effectiveBreakpoints)) {
    breakpoints.set(breakpointId, {
      minWidth: config.minWidth,
      maxWidth: config.maxWidth,
    });
  }

  // Collect all item IDs from schema
  const allItemIds = new Set<string>();
  const collectItemIds = (items: any[]) => {
    items.forEach((item) => {
      allItemIds.add(item.id);
      if (item.type === 'group' && item.items) {
        collectItemIds(item.items);
      }
      if (item.type === 'tab-group' && item.tabs) {
        collectItemIds(item.tabs);
      }
      if (item.type === 'section' && item.items) {
        collectItemIds(item.items);
      }
    });
  };
  collectItemIds(schema.items);

  // Process each item
  for (const itemId of allItemIds) {
    const rules: ResponsiveVisibilityRule[] = [];
    let defaultVisible = true; // Assume visible by default

    // Sort breakpoints by width for proper cascade
    const sortedBreakpoints = Array.from(Object.entries(effectiveBreakpoints)).sort((a, b) => {
      const aMin = a[1].minWidth ?? 0;
      const bMin = b[1].minWidth ?? 0;
      return aMin - bMin;
    });

    sortedBreakpoints.forEach(([breakpointId, config], index) => {
      const isHidden = config.hide?.includes(itemId);
      const isShown = config.show?.includes(itemId);

      // If neither hide nor show mentions this item, skip
      if (!isHidden && !isShown) {
        return;
      }

      rules.push({
        breakpointId,
        minWidth: config.minWidth,
        maxWidth: config.maxWidth,
        visible: isShown || !isHidden,
        priority: index,
      });

      // The first (smallest) breakpoint determines default visibility
      if (index === 0) {
        defaultVisible = isShown || !isHidden;
      }
    });

    // Only add items that have responsive rules
    if (rules.length > 0) {
      items.set(itemId, {
        itemId,
        shouldRender: true, // Always render for SSR
        visibilityRules: rules,
        defaultVisible,
      });
    }
  }

  return { items, breakpoints };
}

/**
 * Apply locale-specific overrides to breakpoints
 * Merges locale-specific show/hide rules with base breakpoints
 */
function applyLocaleOverrides(
  baseBreakpoints: Record<string, BreakpointRule>,
  localeOverrides: LocaleOverrides | undefined,
  currentLocale: string | undefined,
): Record<string, BreakpointRule> {
  // No locale or no overrides - return base breakpoints
  if (!currentLocale || !localeOverrides?.groups) {
    return baseBreakpoints;
  }

  // Find matching locale group
  const matchingGroup = localeOverrides.groups.find((group) =>
    group.locales.includes(currentLocale),
  );

  // No matching group - return base breakpoints
  if (!matchingGroup) {
    return baseBreakpoints;
  }

  // Clone and merge show/hide rules
  const effective: Record<string, BreakpointRule> = {};

  for (const [breakpointId, baseRule] of Object.entries(baseBreakpoints)) {
    const override = matchingGroup.breakpoints[breakpointId];

    if (!override) {
      // No override for this breakpoint - use base as-is
      effective[breakpointId] = baseRule;
      continue;
    }

    // Merge the rules
    effective[breakpointId] = {
      // Width constraints never change!
      minWidth: baseRule.minWidth,
      maxWidth: baseRule.maxWidth,

      // Merge hide lists (base + additional) or use replacement
      hide: override.replaceHide
        ? override.replaceHide
        : [...(baseRule.hide || []), ...(override.hide || [])],

      // Merge show lists (base + additional) or use replacement
      show: override.replaceShow
        ? override.replaceShow
        : [...(baseRule.show || []), ...(override.show || [])],
    };
  }

  return effective;
}

/**
 * Get responsive metadata for a specific item
 */
export function getItemResponsiveMetadata(
  itemId: string,
  schema: ToolbarSchema | MenuSchema,
  currentLocale?: string,
): ResponsiveItemMetadata | null {
  const metadata = resolveResponsiveMetadata(schema, currentLocale);
  return metadata?.items.get(itemId) ?? null;
}
