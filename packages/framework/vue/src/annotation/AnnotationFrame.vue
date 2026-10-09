<!--
  The box an annotation draws into, placed, sized and turned like the
  annotation (`item.frame`) inside the page layer, which the page itself
  turns. The annotation's own drawing and any look of yours draw inside it.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { CSSProperties } from 'vue';
import type { RenderItem } from '@embedpdf/core-annotation';
import { frameInPixels } from '@embedpdf/web';
import type { PageContextValue } from '../runtime/page';

const props = withDefaults(
  defineProps<{
    item: RenderItem;
    page: PageContextValue;
    /** An interactive renderer takes the pointer: the layer's own `none` ends here. */
    interactive?: boolean;
    /** No pointer and no focus for the whole subtree: a renderer that only draws. */
    inert?: boolean;
  }>(),
  { interactive: false, inert: false },
);

defineSlots<{ default?(): unknown }>();

const style = computed((): CSSProperties => {
  const box = frameInPixels(props.item.frame, props.page.transform);
  return {
    position: 'absolute',
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    transform: box.transform,
    transformOrigin: 'center',
    // On the frame: a turned frame groups what is inside it, so blending on
    // an inner element would stop blending with the page.
    mixBlendMode: props.item.blend as CSSProperties['mixBlendMode'],
    pointerEvents: props.interactive ? 'auto' : 'none',
  };
});
</script>

<template>
  <div :inert="inert || undefined" :style="style">
    <slot />
  </div>
</template>
