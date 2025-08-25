import { MenuWrapperProps } from '@embedpdf/utils/@framework';
import { Rect } from '@embedpdf/models';
import { RedactionItem } from '@embedpdf/plugin-redaction';

export interface SelectionMenuProps {
  menuWrapperProps: MenuWrapperProps;
  pageIndex: number;
  item: RedactionItem;
  selected: boolean;
  rect: Rect;
}
