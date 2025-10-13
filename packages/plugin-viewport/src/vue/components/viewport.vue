<script setup lang="ts">
import { ref, watch, useAttrs } from 'vue';
import { useViewportCapability, useViewportRef } from '../hooks';

/* -------------------------------------------------- */
/* props & attrs                                      */
/* -------------------------------------------------- */
interface Props {
  /**
   * The ID of the document that this viewport displays
   */
  documentId: string;
}

const props = defineProps<Props>();
const attrs = useAttrs();

/* -------------------------------------------------- */
/* plugin + reactive viewport gap                     */
/* -------------------------------------------------- */
const { provides: viewportProvides } = useViewportCapability();
const viewportGap = ref(0);

watch(
  viewportProvides,
  (vp) => {
    if (vp) viewportGap.value = vp.getViewportGap();
  },
  { immediate: true },
);

/* -------------------------------------------------- */
/* element ref that wires up scroll / resize logic    */
/* -------------------------------------------------- */
const viewportRef = useViewportRef(props.documentId);
</script>

<template>
  <div
    ref="viewportRef"
    v-bind="attrs"
    :style="{ padding: `${viewportGap}px`, width: '100%', height: '100%', overflow: 'auto' }"
  >
    <slot />
  </div>
</template>
