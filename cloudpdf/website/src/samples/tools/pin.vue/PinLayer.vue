<script setup lang="ts">
import { computed } from 'vue';
import { pageRefsEqual } from '@embedpdf/vue/runtime';
import type { PageContextValue } from '@embedpdf/vue/runtime';
import type { Pin } from './pins';

// The pins on one page, placed in its pixels at the last moment.
const props = defineProps<{ page: PageContextValue; pins: readonly Pin[] }>();

const placed = computed(() =>
  props.pins
    .filter((pin) => pageRefsEqual(pin.page, props.page.ref))
    .map((pin) => ({ id: pin.id, at: props.page.transform.toPixels(pin.point) })),
);
</script>

<template>
  <span
    v-for="pin in placed"
    :key="pin.id"
    class="pin"
    :style="{ left: `${pin.at.x}px`, top: `${pin.at.y}px` }"
  >
    {{ pin.id }}
  </span>
</template>
