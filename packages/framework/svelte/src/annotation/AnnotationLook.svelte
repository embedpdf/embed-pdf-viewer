<!--
  Your look for one annotation, inside its frame. A scaled look (the default) draws at the
  annotation's 100% size in a box of that size, which this scales with the page from its top-left
  corner, so text and borders scale too; `useRichTextEditor()` inside reads that scale. A look
  with `scale: false` draws at its size on screen.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { RenderItem } from '@embedpdf/core-annotation';
  import type { Annotation } from '@embedpdf/plugin-annotation';
  import { frameInPixels, lookFrameOf } from '@embedpdf/web';
  import type { PageContextValue } from '../runtime/page';
  import type { AnnotationRenderer } from './props';
  import { setLookScale } from './text-box.svelte';

  let {
    entry,
    annotation,
    item,
    page,
    native,
    appearance,
    interactive,
  }: {
    entry: Extract<AnnotationRenderer, { for: unknown }>;
    annotation: Annotation;
    item: RenderItem;
    page: PageContextValue;
    native: Snippet;
    appearance: { url: string } | null;
    interactive: boolean;
  } = $props();

  const pixels = $derived(frameInPixels(item.frame, page.transform));
  const scaled = $derived(entry.scale !== false);
  const frame = $derived(lookFrameOf(pixels, scaled));
  const Look = $derived(entry.component);
  setLookScale(() => (scaled ? pixels.scale : 1));
</script>

{#snippet look()}
  <Look
    {annotation}
    {frame}
    {native}
    {appearance}
    hovered={item.hovered ?? false}
    selected={item.selected}
    {interactive}
  />
{/snippet}

{#if scaled}
  <div
    style:position="absolute"
    style:left="0"
    style:top="0"
    style:width="{pixels.design.width}px"
    style:height="{pixels.design.height}px"
    style:transform="scale({pixels.scale})"
    style:transform-origin="0 0"
  >
    {@render look()}
  </div>
{:else}
  {@render look()}
{/if}
