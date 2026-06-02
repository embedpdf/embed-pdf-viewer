<template>
  <defs>
    <pattern
      :id="id"
      patternUnits="userSpaceOnUse"
      :width="spacing"
      :height="spacing"
      patternTransform="rotate(45)"
    >
      <line :x1="0" :y1="0" :x2="0" :y2="spacing" :stroke="color" :stroke-width="lineW" :opacity="0.4" />
    </pattern>
  </defs>
</template>

<script lang="ts">
export default { inheritAttrs: false };
</script>

<script setup lang="ts">
import { computed } from 'vue';

const HATCH_SPACING_PX = 7;
const HATCH_LINE_PX = 1;

const props = defineProps<{ id: string; color: string; scale: number }>();
const s = computed(() => (props.scale > 0 ? props.scale : 1));
const spacing = computed(() => HATCH_SPACING_PX / s.value);
const lineW = computed(() => HATCH_LINE_PX / s.value);
</script>
