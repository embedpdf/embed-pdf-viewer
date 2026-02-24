<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Rotation } from '@embedpdf/models';
  import type { TextSelectionStyle, MarqueeSelectionStyle } from '@embedpdf/plugin-selection';
  import type { SelectionSelectionMenuRenderFn, SelectionSelectionMenuProps } from '../types';
  import TextSelection from './TextSelection.svelte';
  import MarqueeSelection from './MarqueeSelection.svelte';

  interface SelectionLayerProps {
    /** Document ID */
    documentId: string;
    /** Index of the page this layer lives on */
    pageIndex: number;
    /** Scale of the page (optional, defaults to document scale) */
    scale?: number;
    /** Rotation of the page (optional, defaults to document rotation) */
    rotation?: Rotation;
    /**
     * @deprecated Use `textStyle.background` instead.
     * Background color for selection rectangles.
     */
    background?: string;
    /** Styling options for text selection highlights */
    textStyle?: TextSelectionStyle;
    /** Styling options for the marquee selection rectangle */
    marqueeStyle?: MarqueeSelectionStyle;
    /** Optional CSS class applied to the marquee rectangle */
    marqueeClass?: string;
    /** Render function for selection menu (schema-driven approach) */
    selectionMenu?: SelectionSelectionMenuRenderFn;
    /** Snippet for custom selection menu (slot-based approach) */
    selectionMenuSnippet?: Snippet<[SelectionSelectionMenuProps]>;
  }

  let {
    documentId,
    pageIndex,
    scale,
    rotation,
    background,
    textStyle,
    marqueeStyle,
    marqueeClass,
    selectionMenu,
    selectionMenuSnippet,
  }: SelectionLayerProps = $props();

  const resolvedTextBackground = $derived(textStyle?.background ?? background);
</script>

<TextSelection
  {documentId}
  {pageIndex}
  {scale}
  {rotation}
  background={resolvedTextBackground}
  {selectionMenu}
  {selectionMenuSnippet}
/>
<MarqueeSelection
  {documentId}
  {pageIndex}
  {scale}
  background={marqueeStyle?.background}
  borderColor={marqueeStyle?.borderColor}
  borderStyle={marqueeStyle?.borderStyle}
  class={marqueeClass}
/>
