import type { Component } from 'svelte';
import type { Rect } from '@embedpdf/models';
import type { SelectionMenuPlacement, SelectionMenuContextBase } from '@embedpdf/utils';
import type { MenuWrapperProps } from './components/types';

export type { SelectionMenuPlacement, SelectionMenuContextBase, MenuWrapperProps };

/**
 * Selection menu props - Svelte version
 */
export interface SelectionMenuPropsBase<
  TContext extends SelectionMenuContextBase = SelectionMenuContextBase,
> {
  rect: Rect;
  menuWrapperProps: MenuWrapperProps;
  selected: boolean;
  placement: SelectionMenuPlacement;
  context: TContext;
}

/**
 * Result of a selection menu render function
 * Contains the component to render and its props
 */
export interface SelectionMenuRenderResult {
  component: Component<any>;
  props: Record<string, unknown>;
}

/**
 * Render function type for selection menus - Svelte version
 * Returns a component + props object, or null/undefined to skip rendering
 */
export type SelectionMenuRenderFn<
  TContext extends SelectionMenuContextBase = SelectionMenuContextBase,
> = (props: SelectionMenuPropsBase<TContext>) => SelectionMenuRenderResult | null | undefined;

/**
 * Component type for selection menus - Svelte version
 * Alternative to render function, pass a component directly
 */
export type SelectionMenuComponent<
  TContext extends SelectionMenuContextBase = SelectionMenuContextBase,
> = Component<SelectionMenuPropsBase<TContext>>;
