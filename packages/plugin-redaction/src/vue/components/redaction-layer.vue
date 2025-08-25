<template>
  <PendingRedactions
    :page-index="pageIndex"
    :scale="scale"
    :rotation="rotation"
    :bbox-stroke="bboxStroke"
  >
    <template #selection-menu="slotProps">
      <slot name="selection-menu" v-bind="slotProps" />
    </template>
  </PendingRedactions>
  <MarqueeRedact :page-index="pageIndex" :scale="scale" />
  <SelectionRedact :page-index="pageIndex" :scale="scale" />
</template>

<script setup lang="ts">
import type { Rotation } from '@embedpdf/models';
import PendingRedactions from './pending-redactions.vue';
import MarqueeRedact from './marquee-redact.vue';
import SelectionRedact from './selection-redact.vue';

interface RedactionLayerProps {
  pageIndex: number;
  scale: number;
  rotation?: Rotation;
  bboxStroke?: string;
}

withDefaults(defineProps<RedactionLayerProps>(), {
  rotation: 0,
  bboxStroke: 'rgba(0,0,0,0.8)',
});
</script>
