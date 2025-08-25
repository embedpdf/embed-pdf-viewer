import { Rect } from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { JSX } from '@framework';
import { MenuWrapperProps } from '@embedpdf/utils/@framework';

export type ResizeDirection = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none';

export interface SelectionMenuProps {
  annotation: TrackedAnnotation;
  selected: boolean;
  rect: Rect;
  menuWrapperProps: MenuWrapperProps;
}

export type SelectionMenu = (props: SelectionMenuProps) => JSX.Element;
