<script setup lang="ts">
import { computed } from 'vue';
import { pageRefsEqual } from '@embedpdf/vue/runtime';
import type { PageContextValue } from '@embedpdf/vue/runtime';
import type { Dot } from './dots';

const props = defineProps<{ page: PageContextValue; dots: readonly Dot[] }>();

const placed = computed(() =>
  props.dots
    .filter((dot) => pageRefsEqual(dot.page, props.page.ref))
    .map((dot) => ({ id: dot.id, color: dot.color, at: props.page.transform.toPixels(dot.point) })),
);
</script>

<template>
  <span
    v-for="dot in placed"
    :key="dot.id"
    class="dot"
    :style="{ left: `${dot.at.x}px`, top: `${dot.at.y}px`, background: dot.color }"
  />
</template>
