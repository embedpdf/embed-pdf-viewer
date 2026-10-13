/** The props of the selection components. */
import type { Snippet } from 'svelte';
import type { AnchoredPlacement, SelectionClipboardOptions } from '@embedpdf/web';
import type { MaybeGetter } from '../runtime/values.svelte';
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
export interface SelectionClipboardProps
  extends Pick<SelectionClipboardOptions, 'prefetch' | 'onRefused'> {
  /**
   * Copy only while focus is inside this element, for a page with more than one viewer. Pass a
   * function (`() => area`, with `bind:this={area}`): copying works once the element has mounted.
   * Default: anywhere on the page.
   */
  target?: MaybeGetter<HTMLElement | null | undefined>;
}
