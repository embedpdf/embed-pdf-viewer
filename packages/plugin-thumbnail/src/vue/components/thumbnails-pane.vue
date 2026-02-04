<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useThumbnailPlugin } from '../hooks';
import type { WindowState } from '@embedpdf/plugin-thumbnail';

interface ThumbnailsPaneProps {
  /**
   * The ID of the document that this thumbnail pane displays
   */
  documentId: string;
}

const props = defineProps<ThumbnailsPaneProps>();

const { plugin: thumbnailPlugin } = useThumbnailPlugin();
const viewportRef = ref<HTMLDivElement | null>(null);

// Store window data along with the documentId it came from
const windowData = ref<{
  window: WindowState | null;
  docId: string | null;
}>({ window: null, docId: null });

// Only use the window if it matches the current documentId
const windowState = ref<WindowState | null>(null);

watch(
  windowData,
  (data) => {
    windowState.value = data.docId === props.documentId ? data.window : null;
  },
  { deep: true },
);

// Subscribe to window updates for this document
watch(
  [() => thumbnailPlugin.value, () => props.documentId],
  ([plugin, docId], _, onCleanup) => {
    if (!plugin) {
      windowData.value = { window: null, docId: null };
      return;
    }

    const scope = plugin.provides().forDocument(docId);

    // Get initial window state immediately
    const initialWindow = scope.getWindow();
    if (initialWindow) {
      windowData.value = { window: initialWindow, docId };
    }

    // Subscribe to future updates
    const unsubscribe = scope.onWindow((newWindow) => {
      windowData.value = { window: newWindow, docId };
    });

    // Clear state when documentId changes or component unmounts
    onCleanup(() => {
      unsubscribe();
      windowData.value = { window: null, docId: null };
    });
  },
  { immediate: true },
);

// Setup scroll listener
watch(
  [viewportRef, () => thumbnailPlugin.value, () => props.documentId],
  ([vp, plugin, docId], _, onCleanup) => {
    if (!vp || !plugin) return;

    const scope = plugin.provides().forDocument(docId);

    const onScroll = () => scope.updateWindow(vp.scrollTop, vp.clientHeight);
    vp.addEventListener('scroll', onScroll);

    // Setup resize observer for viewport changes
    // Wrap in requestAnimationFrame to prevent "ResizeObserver loop" errors
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        scope.updateWindow(vp.scrollTop, vp.clientHeight);
      });
    });
    resizeObserver.observe(vp);

    // Initial update
    scope.updateWindow(vp.scrollTop, vp.clientHeight);

    onCleanup(() => {
      vp.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
    });
  },
  { immediate: true },
);

// Kick-start after window state changes
watch(
  [viewportRef, () => thumbnailPlugin.value, () => props.documentId, windowState],
  ([vp, plugin, docId]) => {
    if (!vp || !plugin) return;

    const scope = plugin.provides().forDocument(docId);
    scope.updateWindow(vp.scrollTop, vp.clientHeight);
  },
);

// Setup scrollTo subscription
watch(
  [viewportRef, () => thumbnailPlugin.value, () => props.documentId, () => !!windowState.value],
  ([vp, plugin, docId, window], _, onCleanup) => {
    if (!vp || !plugin || !window) return;

    const scope = plugin.provides().forDocument(docId);
    const unsubscribe = scope.onScrollTo(({ top, behavior }) => {
      // Wait for Vue to finish rendering the content before scrolling
      nextTick(() => {
        vp.scrollTo({ top, behavior });
      });
    });

    onCleanup(unsubscribe);
  },
  { immediate: true },
);

const paddingY = ref(0);

watch(
  () => thumbnailPlugin.value,
  (plugin) => {
    paddingY.value = plugin?.cfg.paddingY ?? 0;
  },
  { immediate: true },
);
</script>

<template>
  <div
    ref="viewportRef"
    :style="{
      overflowY: 'auto',
      position: 'relative',
      paddingTop: `${paddingY}px`,
      paddingBottom: `${paddingY}px`,
      height: '100%',
    }"
    v-bind="$attrs"
  >
    <div :style="{ height: `${windowState?.totalHeight ?? 0}px`, position: 'relative' }">
      <template v-for="m in windowState?.items ?? []" :key="m.pageIndex">
        <slot :meta="m" />
      </template>
    </div>
  </div>
</template>
