import { SelectionMenuPropsBase, SelectionMenuRenderFn } from '@embedpdf/utils/vue';
import { RedactionItem } from '@embedpdf/plugin-redaction';

export interface RedactionSelectionContext {
  type: 'redaction';
  item: RedactionItem;
  pageIndex: number;
}

export type RedactionSelectionMenuProps = SelectionMenuPropsBase<RedactionSelectionContext>;
export type RedactionSelectionMenuRenderFn = SelectionMenuRenderFn<RedactionSelectionContext>;
