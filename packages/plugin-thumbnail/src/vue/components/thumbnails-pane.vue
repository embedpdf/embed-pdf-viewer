<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watchEffect, nextTick, useAttrs } from 'vue';
import { useThumbnailPlugin } from '../hooks';
import type { WindowState } from '@embedpdf/plugin-thumbnail';

const attrs = useAttrs();

const { plugin: thumbnailPlugin } = useThumbnailPlugin();
const viewportRef = ref<HTMLDivElement | null>(null);
const windowState = ref<WindowState | null>(null);

let offWindow: (() => void) | null = null;
let offScrollTo: (() => void) | null = null;

watchEffect((onCleanup) => {
  if (!thumbnailPlugin.value) return;
  offWindow?.();
  offWindow = thumbnailPlugin.value.onWindow((w) => (windowState.value = w));
  onCleanup(() => offWindow?.());
});

// Setup scroll listener on mount
onMounted(() => {
  const vp = viewportRef.value;
  if (!vp || !thumbnailPlugin.value) return;

  const onScroll = () => thumbnailPlugin.value!.updateWindow(vp.scrollTop, vp.clientHeight);
  vp.addEventListener('scroll', onScroll);

  // Setup resize observer for viewport changes
  const resizeObserver = new ResizeObserver(() => {
    thumbnailPlugin.value!.updateWindow(vp.scrollTop, vp.clientHeight);
  });
  resizeObserver.observe(vp);

  // initial push
  thumbnailPlugin.value.updateWindow(vp.scrollTop, vp.clientHeight);

  onBeforeUnmount(() => {
    vp.removeEventListener('scroll', onScroll);
    resizeObserver.disconnect();
  });
});

// Setup scrollTo subscription only after window is ready
watchEffect((onCleanup) => {
  const vp = viewportRef.value;
  if (!vp || !thumbnailPlugin.value || !windowState.value) return;

  offScrollTo = thumbnailPlugin.value.onScrollTo(({ top, behavior }) => {
    // Wait for Vue to finish rendering the content before scrolling
    nextTick(() => {
      vp.scrollTo({ top, behavior });
    });
  });

  onCleanup(() => offScrollTo?.());
});

onBeforeUnmount(() => {
  offWindow?.();
  offScrollTo?.();
});
</script>

<template>
  <div
    ref="viewportRef"
    :style="{
      overflowY: 'auto',
      position: 'relative',
      paddingTop: (thumbnailPlugin?.cfg?.paddingY ?? 0) + 'px',
      paddingBottom: (thumbnailPlugin?.cfg?.paddingY ?? 0) + 'px',
      height: '100%',
    }"
    v-bind="attrs"
  >
    <div :style="{ height: (windowState?.totalHeight ?? 0) + 'px', position: 'relative' }">
      <!-- ✅ Use a template v-for to render the default scoped slot -->
      <template v-for="m in windowState?.items ?? []" :key="m.pageIndex">
        <slot :meta="m" />
      </template>
    </div>
  </div>
</template>
