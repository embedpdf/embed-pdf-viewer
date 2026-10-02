/** The props of the selection components. */
import type { Snippet } from 'svelte';
import type { AnchoredPlacement, SelectionClipboardOptions } from '@embedpdf/web';
import type { StageTokenProp } from '../stage/stage-scope';

export interface SelectionMenuProps {
  /** The menu: buttons that call `useSelection()`, `copySelection()`, an annotation's markup. */
  children: Snippet;
  /** The gap in screen pixels between the selection and the menu. Default 8. */
  gap?: number;
  /** Where the menu sits next to the selection. Default `'top'`. */
  placement?: AnchoredPlacement;
}

export interface SelectionHandlesProps {
  /** The stage lens this overlay is on: the enclosing `<Stage>`'s by default. */
  token?: StageTokenProp;
}

/** The props of `<SelectionClipboard>`. */
export type SelectionClipboardProps = Pick<SelectionClipboardOptions, 'prefetch'>;
