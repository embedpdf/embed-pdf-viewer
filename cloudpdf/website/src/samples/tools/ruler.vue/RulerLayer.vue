<script setup lang="ts">
import { computed } from 'vue';
import { pageRefsEqual } from '@embedpdf/vue/runtime';
import type { PageContextValue } from '@embedpdf/vue/runtime';
import { lengthOf } from './measurement';
import type { Measurement } from './measurement';

// The measured line on its page, placed in the page's pixels.
const props = defineProps<{ page: PageContextValue; measurement: Measurement | null }>();

const line = computed(() => {
  const { measurement, page } = props;
  if (!measurement || !pageRefsEqual(measurement.page, page.ref)) return null;
  return {
    from: page.transform.toPixels(measurement.from),
    to: page.transform.toPixels(measurement.to),
    label: lengthOf(measurement),
  };
});
</script>

<template>
  <template v-if="line">
    <svg class="ruler-layer">
      <line
        class="ruler-line"
        :x1="line.from.x"
        :y1="line.from.y"
        :x2="line.to.x"
        :y2="line.to.y"
      />
      <circle class="ruler-end" :cx="line.from.x" :cy="line.from.y" :r="4" />
      <circle class="ruler-end" :cx="line.to.x" :cy="line.to.y" :r="4" />
    </svg>
    <span
      class="ruler-label"
      :style="{
        left: `${(line.from.x + line.to.x) / 2}px`,
        top: `${(line.from.y + line.to.y) / 2}px`,
      }"
    >
      {{ line.label }}
    </span>
  </template>
</template>
