import { SelectionMenuRenderFn, SelectionMenuPropsBase } from '@embedpdf/utils/@framework';

export interface SelectionSelectionContext {
  type: 'selection';
  pageIndex: number;
}

export type SelectionSelectionMenuRenderFn = SelectionMenuRenderFn<SelectionSelectionContext>;
export type SelectionSelectionMenuProps = SelectionMenuPropsBase<SelectionSelectionContext>;
