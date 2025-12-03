import type { VNode } from 'vue';
import type { Rect } from '@embedpdf/models';
import type { SelectionMenuPlacement, SelectionMenuContextBase } from '@embedpdf/utils';
import type { MenuWrapperProps } from './components/types';

// Re-export base types
export type { SelectionMenuPlacement, SelectionMenuContextBase };

export type { MenuWrapperProps };

/**
 * Selection menu props - Vue version
 */
export interface SelectionMenuPropsBase<
  TContext extends SelectionMenuContextBase = SelectionMenuContextBase,
> {
  /** Bounding rect (already scaled to viewport) */
  rect: Rect;
  /** Props for the positioning wrapper div */
  menuWrapperProps: MenuWrapperProps;
  /** Whether the item is currently selected */
  selected: boolean;
  /** Placement hints for menu positioning */
  placement: SelectionMenuPlacement;
  /** Layer-specific context, discriminated by 'type' field */
  context: TContext;
}

/**
 * Render function type for selection menus - Vue version
 */
export type SelectionMenuRenderFn<
  TContext extends SelectionMenuContextBase = SelectionMenuContextBase,
> = (props: SelectionMenuPropsBase<TContext>) => VNode | null;
