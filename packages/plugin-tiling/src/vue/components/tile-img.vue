<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, toRaw } from 'vue';
import { ignore, PdfErrorCode } from '@embedpdf/models';

import type { Tile } from '@embedpdf/plugin-tiling';
import { useTilingCapability } from '../hooks';

interface Props {
  documentId: string;
  pageIndex: number;
  tile: Tile;
  scale: number;
  dpr?: number;
}

const props = withDefaults(defineProps<Props>(), {
  dpr: () => (typeof window !== 'undefined' ? window.devicePixelRatio : 1),
});

const { provides: tilingCapability } = useTilingCapability();
const url = ref<string>();
const relScale = computed(() => props.scale / props.tile.srcScale);

// Track last rendered tile ID to prevent duplicates
let lastRenderedId: string | undefined;
let currentTask: any = null;

watch(
  [() => props.tile.id, () => props.documentId, tilingCapability],
  ([tileId, docId, capability]) => {
    if (!capability) return;

    const scope = capability.forDocument(docId);

    // Already rendered this exact tile
    if (lastRenderedId === tileId) return;

    // Cancel previous task if any
    if (currentTask) {
      currentTask.abort({ code: PdfErrorCode.Cancelled, message: 'switching tiles' });
      currentTask = null;
    }

    // Clean up old URL
    if (url.value) {
      URL.revokeObjectURL(url.value);
      url.value = undefined;
    }

    lastRenderedId = tileId;

    currentTask = scope.renderTile({
      pageIndex: props.pageIndex,
      tile: toRaw(props.tile),
      dpr: props.dpr,
    });

    currentTask.wait((blob: Blob) => {
      url.value = URL.createObjectURL(blob);
      currentTask = null;
    }, ignore);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (currentTask) {
    currentTask.abort({ code: PdfErrorCode.Cancelled, message: 'unmounting' });
  }
  if (url.value) {
    URL.revokeObjectURL(url.value);
  }
});
</script>

<template>
  <img
    v-if="url"
    :src="url"
    :style="{
      position: 'absolute',
      left: `${tile.screenRect.origin.x * relScale}px`,
      top: `${tile.screenRect.origin.y * relScale}px`,
      width: `${tile.screenRect.size.width * relScale}px`,
      height: `${tile.screenRect.size.height * relScale}px`,
      display: 'block',
    }"
  />
</template>
