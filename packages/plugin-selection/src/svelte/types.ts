import { Rect } from '@embedpdf/models';
import { SelectionMenuPlacement } from '@embedpdf/plugin-selection';
import { MenuWrapperProps } from '@embedpdf/utils/svelte';

export interface SelectionMenuProps {
  rect: Rect;
  menuWrapperProps: MenuWrapperProps;
  placement: SelectionMenuPlacement;
}
