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
const canvasRef = ref<HTMLCanvasElement | null>(null);
const hasContent = ref(false);
const relScale = computed(() => props.scale / props.tile.srcScale);

let currentBitmap: ImageBitmap | null = null;
let lastRenderedId: string | undefined;
let currentTask: any = null;

function paintBitmap(bitmap: ImageBitmap) {
  if (!canvasRef.value) return;
  try {
    const canvas = canvasRef.value;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('bitmaprenderer')!.transferFromImageBitmap(bitmap);
    hasContent.value = true;
  } catch {
    // Bitmap was detached
  }
}

watch(
  [() => props.tile.id, () => props.documentId, tilingCapability],
  ([tileId, docId, capability], [prevTileId, prevDocId]) => {
    if (!capability) return;

    const scope = capability.forDocument(docId);

    // CRITICAL: Clear state immediately when documentId changes
    if (prevDocId !== undefined && prevDocId !== docId) {
      hasContent.value = false;
      if (currentBitmap) {
        currentBitmap.close();
        currentBitmap = null;
      }
      if (currentTask) {
        currentTask.abort({ code: PdfErrorCode.Cancelled, message: 'switching documents' });
        currentTask = null;
      }
      lastRenderedId = undefined;
    }

    // Already rendered this exact tile (for same document)
    if (lastRenderedId === tileId && prevDocId === docId) return;

    // Cancel previous task if any
    if (currentTask) {
      currentTask.abort({ code: PdfErrorCode.Cancelled, message: 'switching tiles' });
      currentTask = null;
    }
    if (currentBitmap) {
      currentBitmap.close();
      currentBitmap = null;
      hasContent.value = false;
    }

    lastRenderedId = tileId;

    currentTask = scope.renderTile({
      pageIndex: props.pageIndex,
      tile: toRaw(props.tile),
      dpr: props.dpr,
    });

    currentTask.wait((bitmap: ImageBitmap) => {
      if (currentBitmap) {
        currentBitmap.close();
      }
      currentBitmap = bitmap;
      paintBitmap(bitmap);
      currentBitmap = null; // transferred to canvas, don't close
      currentTask = null;
    }, ignore);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (currentTask) {
    currentTask.abort({ code: PdfErrorCode.Cancelled, message: 'unmounting' });
  }
  if (currentBitmap) {
    currentBitmap.close();
    currentBitmap = null;
  }
});
</script>

<template>
  <canvas
    v-show="hasContent"
    ref="canvasRef"
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
