import type {
  SelectionMenuPropsBase,
  SelectionMenuRenderFn,
  SelectionMenuRenderResult,
} from '@embedpdf/utils/svelte';
import type { RedactionItem } from '@embedpdf/plugin-redaction';

export interface RedactionSelectionContext {
  type: 'redaction';
  item: RedactionItem;
  pageIndex: number;
}

export type RedactionSelectionMenuProps = SelectionMenuPropsBase<RedactionSelectionContext>;
export type RedactionSelectionMenuRenderFn = SelectionMenuRenderFn<RedactionSelectionContext>;

// Re-export for convenience
export type { SelectionMenuRenderResult };
