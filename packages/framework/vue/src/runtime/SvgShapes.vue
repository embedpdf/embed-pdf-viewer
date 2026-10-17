<!--
  Scene shapes as SVG elements: `@embedpdf/web`'s element descriptions (`svgShapesOf`), one
  element each, a clipping `svg` with its children, and the faces their text draws in mounted
  while they show. The annotation and form layers draw their scenes through it, inside an `<svg>`
  (Vue takes the namespace from it).
-->
<script setup lang="ts">
import { onUnmounted, watchEffect } from 'vue';
import type { CSSProperties } from 'vue';
import { createFontMounts, type SvgShape } from '@embedpdf/web';

const props = defineProps<{ shapes: readonly SvgShape[] }>();

// The faces of this level's text: a clipping `svg` mounts its own children's.
const mounts = createFontMounts();
onUnmounted(() => mounts.release());
watchEffect(() =>
  mounts.mount(props.shapes.flatMap((shape) => (shape.program ? [shape.program] : []))),
);

/** A shape's blend is CSS, never an attribute. */
const blendOf = (blend: string | undefined): CSSProperties | undefined =>
  blend ? { mixBlendMode: blend as CSSProperties['mixBlendMode'] } : undefined;
</script>

<template>
  <component
    :is="shape.tag"
    v-for="(shape, index) in shapes"
    :key="index"
    v-bind="shape.attributes"
    :style="blendOf(shape.blend)"
  >
    <SvgShapes v-if="shape.children" :shapes="shape.children" />
    <template v-else>{{ shape.text }}</template>
  </component>
</template>
