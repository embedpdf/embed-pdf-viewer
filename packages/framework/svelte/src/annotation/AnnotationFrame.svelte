<!--
  The box an annotation draws into, placed, sized and turned like the annotation (`item.frame`)
  inside the page layer, which the page itself turns. The annotation's own drawing and any look
  of yours draw inside it.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { RenderItem } from '@embedpdf/core-annotation';
  import { frameInPixels } from '@embedpdf/web';
  import type { PageContextValue } from '../runtime/page';

  let {
    item,
    page,
    interactive = false,
    inert = false,
    children,
  }: {
    item: RenderItem;
    page: PageContextValue;
    /** An interactive renderer takes the pointer: the layer's own `none` ends here. */
    interactive?: boolean;
    /** No pointer and no focus for anything inside: a look that only draws. */
    inert?: boolean;
    children: Snippet;
  } = $props();

  const box = $derived(frameInPixels(item.frame, page.transform));
</script>

<!-- The blend is on the frame: a turned frame groups what is inside it, so blending on an inner
     element would stop blending with the page. -->
<div
  {inert}
  style:position="absolute"
  style:left="{box.left}px"
  style:top="{box.top}px"
  style:width="{box.width}px"
  style:height="{box.height}px"
  style:transform={box.transform}
  style:transform-origin="center"
  style:mix-blend-mode={item.blend}
  style:pointer-events={interactive ? 'auto' : 'none'}
>
  {@render children()}
</div>
