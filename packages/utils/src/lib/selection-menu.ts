/**
 * Placement hints for positioning selection menus
 */
export interface SelectionMenuPlacement {
  suggestTop: boolean;
  spaceAbove?: number;
  spaceBelow?: number;
}

/**
 * Base context type - all layer contexts must extend this
 */
export interface SelectionMenuContextBase {
  type: string;
}
