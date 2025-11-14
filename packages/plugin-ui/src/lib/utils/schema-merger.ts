import { UISchema, ToolbarSchema, MenuSchema, PanelSchema } from '../types';

/**
 * Deep merge UI schemas
 * Allows users to override/extend default schema
 */
export function mergeUISchema(base: UISchema, override: Partial<UISchema>): UISchema {
  return {
    ...base,
    ...override,
    toolbars: mergeToolbars(base.toolbars, override.toolbars),
    menus: mergeMenus(base.menus, override.menus),
    panels: mergePanels(base.panels, override.panels),
  };
}

function mergeToolbars(
  base: Record<string, ToolbarSchema>,
  override?: Record<string, ToolbarSchema>,
): Record<string, ToolbarSchema> {
  if (!override) return base;

  const result = { ...base };

  for (const [id, toolbar] of Object.entries(override)) {
    if (result[id]) {
      // Merge existing toolbar
      result[id] = {
        ...result[id],
        ...toolbar,
        items: toolbar.items ?? result[id].items,
        responsive: toolbar.responsive ?? result[id].responsive,
      };
    } else {
      // Add new toolbar
      result[id] = toolbar;
    }
  }

  return result;
}

function mergeMenus(
  base: Record<string, MenuSchema>,
  override?: Record<string, MenuSchema>,
): Record<string, MenuSchema> {
  if (!override) return base;

  const result = { ...base };

  for (const [id, menu] of Object.entries(override)) {
    if (result[id]) {
      // Merge existing menu
      result[id] = {
        ...result[id],
        ...menu,
        items: menu.items ?? result[id].items,
      };
    } else {
      // Add new menu
      result[id] = menu;
    }
  }

  return result;
}

function mergePanels(
  base: Record<string, PanelSchema>,
  override?: Record<string, PanelSchema>,
): Record<string, PanelSchema> {
  if (!override) return base;

  const result = { ...base };

  for (const [id, panel] of Object.entries(override)) {
    if (result[id]) {
      // Merge existing panel
      result[id] = {
        ...result[id],
        ...panel,
        content: panel.content ?? result[id].content,
      };
    } else {
      // Add new panel
      result[id] = panel;
    }
  }

  return result;
}

/**
 * Helper to remove items from schema
 */
export function removeFromSchema(
  schema: UISchema,
  options: {
    toolbars?: string[];
    menus?: string[];
    panels?: string[];
    commands?: string[]; // Remove commands from all menus/toolbars
  },
): UISchema {
  const result = { ...schema };

  // Remove toolbars
  if (options.toolbars) {
    result.toolbars = { ...result.toolbars };
    options.toolbars.forEach((id) => delete result.toolbars[id]);
  }

  // Remove menus
  if (options.menus) {
    result.menus = { ...result.menus };
    options.menus.forEach((id) => delete result.menus[id]);
  }

  // Remove panels
  if (options.panels) {
    result.panels = { ...result.panels };
    options.panels.forEach((id) => delete result.panels[id]);
  }

  // Remove commands from all toolbars/menus
  if (options.commands) {
    result.toolbars = removeCommandsFromToolbars(result.toolbars, options.commands);
    result.menus = removeCommandsFromMenus(result.menus, options.commands);
  }

  return result;
}

function removeCommandsFromToolbars(
  toolbars: Record<string, ToolbarSchema>,
  commandIds: string[],
): Record<string, ToolbarSchema> {
  const result: Record<string, ToolbarSchema> = {};

  for (const [id, toolbar] of Object.entries(toolbars)) {
    result[id] = {
      ...toolbar,
      items: toolbar.items.filter((item) => {
        if (item.type === 'command-button') {
          return !commandIds.includes(item.commandId);
        }
        if (item.type === 'group') {
          return item.items.some((child) =>
            child.type === 'command-button' ? !commandIds.includes(child.commandId) : true,
          );
        }
        if (item.type === 'tab-group') {
          return item.tabs.some((tab) => !commandIds.includes(tab.commandId));
        }
        return true;
      }),
    };
  }

  return result;
}

function removeCommandsFromMenus(
  menus: Record<string, MenuSchema>,
  commandIds: string[],
): Record<string, MenuSchema> {
  const result: Record<string, MenuSchema> = {};

  for (const [id, menu] of Object.entries(menus)) {
    result[id] = {
      ...menu,
      items: menu.items.filter((item) => {
        if (item.type === 'command') {
          return !commandIds.includes(item.commandId);
        }
        if (item.type === 'section') {
          return item.items.some((child) =>
            child.type === 'command' ? !commandIds.includes(child.commandId) : true,
          );
        }
        return true;
      }),
    };
  }

  return result;
}
