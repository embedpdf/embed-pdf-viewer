import {
  ToolbarSchema,
  MenuSchema,
  ResponsiveMetadata,
  ResponsiveItemMetadata,
  ResponsiveVisibilityRule,
} from '../types';

/**
 * Processes responsive configuration and returns metadata for all items
 * This is framework-agnostic and lives in plugin-ui
 */
export function resolveResponsiveMetadata(
  schema: ToolbarSchema | MenuSchema,
): ResponsiveMetadata | null {
  if (!schema.responsive?.breakpoints) {
    return null;
  }

  const items = new Map<string, ResponsiveItemMetadata>();
  const breakpoints = new Map<string, { minWidth?: number; maxWidth?: number }>();

  // Extract breakpoint definitions
  for (const [breakpointId, config] of Object.entries(schema.responsive.breakpoints)) {
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
    const sortedBreakpoints = Array.from(Object.entries(schema.responsive.breakpoints)).sort(
      (a, b) => {
        const aMin = a[1].minWidth ?? 0;
        const bMin = b[1].minWidth ?? 0;
        return aMin - bMin;
      },
    );

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
 * Get responsive metadata for a specific item
 */
export function getItemResponsiveMetadata(
  itemId: string,
  schema: ToolbarSchema | MenuSchema,
): ResponsiveItemMetadata | null {
  const metadata = resolveResponsiveMetadata(schema);
  return metadata?.items.get(itemId) ?? null;
}
