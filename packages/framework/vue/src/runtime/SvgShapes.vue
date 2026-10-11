<!--
  Scene shapes as SVG elements: `@embedpdf/web`'s element descriptions (`svgShapesOf`), one
  element each, a clipping `svg` with its children. The annotation and form layers draw their
  scenes through it, inside an `<svg>` (Vue takes the namespace from it).
-->
<script setup lang="ts">
import type { CSSProperties } from 'vue';
import type { SvgShape } from '@embedpdf/web';

defineProps<{ shapes: readonly SvgShape[] }>();

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
