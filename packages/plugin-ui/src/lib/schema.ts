/**
 * Top-level UI Schema
 */
export interface UISchema {
  id: string;
  version: string;

  // UI Primitives
  toolbars: Record<string, ToolbarSchema>;
  menus: Record<string, MenuSchema>;
  panels: Record<string, PanelSchema>;
}

export interface ToolbarPosition {
  placement: 'top' | 'bottom' | 'left' | 'right';

  // Slot name - toolbars in same slot are mutually exclusive
  slot?: string;

  // Order within the slot (lower = first)
  order?: number;
}

export interface CustomComponentItem {
  type: 'custom';
  id: string;
  componentId: string; // Registered custom component
  props?: Record<string, any>;
}

/**
 * Toolbar item types
 */
export type ToolbarItem =
  | CommandButtonItem
  | TabGroupItem
  | DividerItem
  | SpacerItem
  | GroupItem
  | CustomComponentItem;

/**
 * Toolbar definition
 */
export interface ToolbarSchema {
  id: string;

  // Position & behavior
  position: ToolbarPosition;
  permanent?: boolean; // If true, always visible (can't be toggled)

  // Content
  items: ToolbarItem[];

  // Responsive behavior
  responsive?: ResponsiveRules;
}

export interface TabGroupItem {
  type: 'tab-group';
  id: string;
  tabs: TabItem[];
  defaultTab?: string;
  variant?: 'pills' | 'underline' | 'enclosed';
  alignment?: 'start' | 'center' | 'end';
}

export interface TabItem {
  id: string;
  labelKey?: string; // i18n key
  label?: string; // Fallback label
  commandId?: string; // Optional: command executed when tab selected
  variant?: 'icon' | 'text' | 'icon-text';
}

export interface CommandButtonItem {
  type: 'command-button';
  id: string;
  commandId: string;
  variant?: 'icon' | 'text' | 'icon-text' | 'tab';
  size?: 'sm' | 'md' | 'lg';
}

export interface DividerItem {
  type: 'divider';
  id: string;
  orientation?: 'vertical' | 'horizontal';
}

export interface SpacerItem {
  type: 'spacer';
  id: string;
  flex?: boolean;
}

export interface GroupItem {
  type: 'group';
  id: string;
  items: ToolbarItem[];
  gap?: number;
  alignment?: 'start' | 'center' | 'end';
}

/**
 * Menu definition - pure structure, no trigger info
 */
export interface MenuSchema {
  id: string;

  // Menu structure
  items: MenuItem[];

  // Responsive behavior
  responsive?: ResponsiveRules;
}

/**
 * Menu item types
 */
export type MenuItem =
  | MenuCommandItem
  | MenuSectionItem
  | MenuSubmenuItem
  | MenuDividerItem
  | MenuCustomItem;

export interface MenuCommandItem {
  type: 'command';
  id: string;
  commandId: string;
}

export interface MenuSectionItem {
  type: 'section';
  id: string;
  labelKey?: string; // i18n key
  label?: string; // Fallback label
  items: MenuItem[];
}

export interface MenuSubmenuItem {
  type: 'submenu';
  id: string;
  labelKey?: string;
  label?: string;
  icon?: string;
  menuId: string; // References another MenuSchema
}

export interface MenuDividerItem {
  type: 'divider';
  id: string;
}

export interface MenuCustomItem {
  type: 'custom';
  id: string;
  componentId: string;
  props?: Record<string, any>;
}

/**
 * Panel definition (sidebars, overlays, modals)
 */
export interface PanelSchema {
  id: string;

  // Panel type
  type: 'sidebar' | 'overlay' | 'modal' | 'popover';

  // Position (for sidebar/overlay)
  position?: PanelPosition;

  // Content
  content: PanelContent;

  // Behavior
  collapsible?: boolean;
  defaultOpen?: boolean;
  closeOnClickOutside?: boolean;

  // Sizing
  width?: string;
  height?: string;
  minWidth?: string;
  minHeight?: string;
  maxWidth?: string;
  maxHeight?: string;
}

export interface PanelPosition {
  placement: 'left' | 'right' | 'top' | 'bottom';

  // Slot name - panels in same slot are mutually exclusive
  slot?: string;

  // Order within slot (if multiple can coexist)
  order?: number;
}

/**
 * Panel content types
 */
export type PanelContent = TabsPanelContent | ComponentPanelContent;

export interface TabsPanelContent {
  type: 'tabs';
  tabs: PanelTab[];
  defaultTab?: string;
}

export interface PanelTab {
  id: string;
  labelKey?: string;
  label?: string;
  icon?: string;
  componentId: string; // Which component to render for this tab
}

export interface ComponentPanelContent {
  type: 'component';
  componentId: string;
  props?: Record<string, any>;
}

export interface ResponsiveRules {
  // User defines their own breakpoint names
  breakpoints: Record<string, BreakpointRule>;
}

export interface BreakpointRule {
  // Just width constraints - no prescribed behavior
  minWidth?: number; // px
  maxWidth?: number; // px

  // Control visibility
  hide?: string[]; // Item IDs to hide
  show?: string[]; // Item IDs to show
}
