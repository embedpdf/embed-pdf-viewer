import { Rect } from '@embedpdf/models';
import { MenuWrapperProps } from '@embedpdf/utils/@framework';
import { SelectionMenuPlacement } from '@embedpdf/plugin-selection';

export interface SelectionMenuProps {
  rect: Rect;
  menuWrapperProps: MenuWrapperProps;
  placement: SelectionMenuPlacement;
}
