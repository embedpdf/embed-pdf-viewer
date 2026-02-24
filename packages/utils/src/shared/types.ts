import { Rect } from '@embedpdf/models';
import { ReactNode } from '@framework';
import { SelectionMenuPlacement, SelectionMenuContextBase } from '@embedpdf/utils';
import { MenuWrapperProps } from './components/counter-rotate-container';

// Re-export base types
export type { SelectionMenuPlacement, SelectionMenuContextBase };

export type { MenuWrapperProps };

/**
 * Selection menu props - React/Preact version
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
 * Render function type for selection menus - React/Preact version
 */
export type SelectionMenuRenderFn<
  TContext extends SelectionMenuContextBase = SelectionMenuContextBase,
> = (props: SelectionMenuPropsBase<TContext>) => ReactNode;
