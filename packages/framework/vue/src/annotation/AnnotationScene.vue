<!--
  An annotation's scene, filling its frame: drawn upright in it, the frame
  turns it. The core computed the box and the painted scene; `@embedpdf/web`
  describes each scene node as one SVG element (its tag, its attributes under
  their SVG names, its text), so there is no per-kind logic and no bounds math
  here: one loop draws every kind.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { CSSProperties } from 'vue';
import { MITER_LIMIT, scene } from '@embedpdf/core-annotation';
import type { RenderItem } from '@embedpdf/core-annotation';
import { ghostOpacity, sceneViewBox, svgShapesOf } from '@embedpdf/web';

const props = defineProps<{ item: RenderItem }>();

// Nothing to draw until the annotation has area (the 0×0 draft at mouse-down).
const viewBox = computed(() => sceneViewBox(props.item.box));
const shapes = computed(() => svgShapesOf(scene(props.item), { miterLimit: MITER_LIMIT }));
const style = computed(
  (): CSSProperties => ({
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    overflow: 'visible',
    pointerEvents: 'none',
    // A ghost is see-through as a whole, so its fill and stroke don't stack.
    ...(props.item.source === 'ghost'
      ? { opacity: ghostOpacity(props.item.ghostOpacity ?? 0.5) }
      : {}),
  }),
);
/** A shape's blend is CSS, never an attribute. */
const blendOf = (blend: string | undefined): CSSProperties | undefined =>
  blend ? { mixBlendMode: blend as CSSProperties['mixBlendMode'] } : undefined;
</script>

<template>
  <svg v-if="viewBox" :viewBox="viewBox" :style="style">
    <component
      :is="shape.tag"
      v-for="(shape, index) in shapes"
      :key="index"
      v-bind="shape.attributes"
      :style="blendOf(shape.blend)"
      >{{ shape.text }}</component
    >
  </svg>
</template>
