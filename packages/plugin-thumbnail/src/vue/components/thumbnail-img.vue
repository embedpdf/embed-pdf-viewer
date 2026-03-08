<script setup lang="ts">
import { ref, watch } from 'vue';
import { useThumbnailCapability, useThumbnailPlugin } from '../hooks';
import type { ThumbMeta } from '@embedpdf/plugin-thumbnail';
import { ignore, PdfErrorCode } from '@embedpdf/models';

interface ThumbImgProps {
  /**
   * The ID of the document that this thumbnail belongs to
   */
  documentId: string;
  meta: ThumbMeta;
}

const props = defineProps<ThumbImgProps>();

const { provides: thumbs } = useThumbnailCapability();
const { plugin: thumbnailPlugin } = useThumbnailPlugin();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const hasContent = ref(false);
const refreshTick = ref(0);

// Watch for refresh events for this specific document
watch(
  [() => thumbnailPlugin.value, () => props.documentId, () => props.meta.pageIndex],
  ([plugin, docId, pageIdx], _, onCleanup) => {
    if (!plugin) return;

    const scope = plugin.provides().forDocument(docId);
    const unsubscribe = scope.onRefreshPages((pages) => {
      if (pages.includes(pageIdx)) {
        refreshTick.value++;
      }
    });

    onCleanup(unsubscribe);
  },
  { immediate: true },
);

function paintBitmap(bitmap: ImageBitmap) {
  if (!canvasRef.value) return;
  try {
    const canvas = canvasRef.value;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    hasContent.value = true;
  } catch {
    // Bitmap was closed
  }
}

// Render thumbnail when dependencies change
watch(
  [() => thumbs.value, () => props.documentId, () => props.meta.pageIndex, refreshTick],
  ([capability, docId, pageIdx], _, onCleanup) => {
    if (!capability) {
      hasContent.value = false;
      return;
    }

    const scope = capability.forDocument(docId);
    const task = scope.renderThumb(pageIdx, window.devicePixelRatio);

    task.wait((bitmap) => {
      paintBitmap(bitmap);
      // Do NOT close bitmap — LRU cache owns lifecycle
    }, ignore);

    onCleanup(() => {
      task.abort({
        code: PdfErrorCode.Cancelled,
        message: 'canceled render task',
      });
    });
  },
  { immediate: true },
);
</script>

<template>
  <canvas ref="canvasRef" :style="{ visibility: hasContent ? 'visible' : 'hidden' }" v-bind="$attrs" />
</template>
