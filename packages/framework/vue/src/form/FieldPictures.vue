<!--
  Widgets as they look now, each at its place (`placeOf`): where the widget
  stands, in the page layer or inside its own box. A picture and the painter's
  drawing both fill the rect the widget stands in, with its turn in them. One
  component draws them all, so new pictures are one update, however many.
-->
<script setup lang="ts">
import type { CSSProperties } from 'vue';
import SvgShapes from '../runtime/SvgShapes.vue';
import type { ShownLook } from './field-looks';

defineProps<{
  looks: readonly ShownLook[];
  /** Where a look goes: `position`, `left`, `top`, `width` and `height`, and a turn to undo. */
  placeOf: (look: ShownLook) => CSSProperties;
}>();
</script>

<template>
  <template v-for="look in looks" :key="look.key">
    <img
      v-if="look.kind === 'picture'"
      :src="look.url"
      alt=""
      draggable="false"
      :style="{
        ...placeOf(look),
        // A global `img { max-width: 100% }` reset would clamp it.
        maxWidth: 'none',
        maxHeight: 'none',
        pointerEvents: 'none',
      }"
    />
    <svg
      v-else
      :viewBox="look.viewBox"
      :style="{ ...placeOf(look), overflow: 'visible', pointerEvents: 'none' }"
    >
      <SvgShapes :shapes="look.shapes" />
    </svg>
  </template>
</template>
