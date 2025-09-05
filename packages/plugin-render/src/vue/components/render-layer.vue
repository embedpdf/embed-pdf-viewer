<script setup lang="ts">
import { ref, watch, onBeforeUnmount, computed } from 'vue';
import { ignore, PdfErrorCode, PdfErrorReason, Task } from '@embedpdf/models';

import { useRenderCapability, useRenderPlugin } from '../hooks';

interface Props {
  pageIndex: number;
  /**
   * The scale factor for rendering the page.
   */
  scale?: number;
  /**
   * @deprecated Use `scale` instead. Will be removed in the next major release.
   */
  scaleFactor?: number;
  dpr?: number;
}

const props = defineProps<Props>();

// Handle deprecation: prefer scale over scaleFactor, but fall back to scaleFactor if scale is not provided
const actualScale = computed(() => props.scale ?? props.scaleFactor ?? 1);

const { provides: renderProvides } = useRenderCapability();
const { plugin: renderPlugin } = useRenderPlugin();

const imageUrl = ref<string | null>(null);
const refreshTick = ref(0);

let currentBlobUrl: string | null = null;
let currentTask: Task<Blob, PdfErrorReason> | null = null;

/* ------------------------------------------ */
/* Helper function to abort current task */
/* ------------------------------------------ */
function abortCurrentTask() {
  if (currentTask && !currentBlobUrl) {
    currentTask.abort({
      code: PdfErrorCode.Cancelled,
      message: 'canceled render task',
    });
  }
}

/* ------------------------------------------ */
/* render whenever pageIndex/scale/dpr/tick change */
/* ------------------------------------------ */
function revoke() {
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
}

function startRender() {
  abortCurrentTask();
  revoke();
  currentTask = null;

  if (!renderProvides.value) return;

  const task = renderProvides.value.renderPage({
    pageIndex: props.pageIndex,
    options: {
      scaleFactor: actualScale.value,
      dpr: props.dpr || window.devicePixelRatio,
    },
  });

  currentTask = task;

  task.wait((blob) => {
    currentBlobUrl = URL.createObjectURL(blob);
    imageUrl.value = currentBlobUrl;
    currentTask = null;
  }, ignore);
}

// Watch for external refresh events
watch(
  renderPlugin,
  (pluginInstance, _, onCleanup) => {
    if (pluginInstance) {
      const unsubscribe = pluginInstance.onRefreshPages((pages: number[]) => {
        if (pages.includes(props.pageIndex)) {
          refreshTick.value++;
        }
      });
      onCleanup(unsubscribe);
    }
  },
  { immediate: true },
);

// Watch for changes that require a re-render
watch(
  () => [props.pageIndex, actualScale.value, props.dpr, renderProvides.value, refreshTick.value],
  startRender,
  { immediate: true },
);

/* ------------------------------------------ */
onBeforeUnmount(() => {
  abortCurrentTask();
  revoke();
});
</script>

<template>
  <img v-if="imageUrl" :src="imageUrl" :style="{ width: '100%', height: '100%' }" @load="revoke" />
</template>
