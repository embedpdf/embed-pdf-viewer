<!--
  Scene shapes as SVG elements: `@embedpdf/web`'s element descriptions (`svgShapesOf`), one
  element each, a clipping `svg` with its children, and the faces their text draws in mounted
  while they show. The annotation and form layers draw their scenes through it, inside an `<svg>`
  (Vue takes the namespace from it).
-->
<script setup lang="ts">
import type { SvgShape } from '@embedpdf/web';
import { useFontMounts } from './font-mounts';

const props = defineProps<{ shapes: readonly SvgShape[] }>();

// The faces of this level's text: a clipping `svg` mounts its own children's.
useFontMounts(() => props.shapes.flatMap((shape) => (shape.program ? [shape.program] : [])));
</script>

<template>
  <component
    :is="shape.tag"
    v-for="(shape, index) in shapes"
    :key="index"
    v-bind="shape.attributes"
    :style="shape.style"
  >
    <SvgShapes v-if="shape.children" :shapes="shape.children" />
    <template v-else>{{ shape.text }}</template>
  </component>
</template>
