<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { ignore, PdfErrorCode } from '@embedpdf/models';
import { useDocumentState } from '@embedpdf/core/vue';
import { useRenderCapability } from '../hooks';

interface RenderLayerProps {
  /**
   * The ID of the document to render from
   */
  documentId: string;
  /**
   * The page index to render (0-based)
   */
  pageIndex: number;
  /**
   * Optional scale override. If not provided, uses document's current scale.
   */
  scale?: number;
  /**
   * Optional device pixel ratio override. If not provided, uses window.devicePixelRatio.
   */
  dpr?: number;
}

const props = defineProps<RenderLayerProps>();

const { provides: renderProvides } = useRenderCapability();
const documentState = useDocumentState(() => props.documentId);

const canvasRef = ref<HTMLCanvasElement | null>(null);
let currentBitmap: ImageBitmap | null = null;

// Get refresh version from core state
const refreshVersion = computed(() => {
  if (!documentState.value) return 0;
  return documentState.value.pageRefreshVersions[props.pageIndex] || 0;
});

// Determine actual render options: use overrides if provided, otherwise fall back to document state
const actualScale = computed(() => {
  if (props.scale !== undefined) return props.scale;
  return documentState.value?.scale ?? 1;
});

const actualDpr = computed(() => {
  if (props.dpr !== undefined) return props.dpr;
  return window.devicePixelRatio;
});

function paintBitmap(bitmap: ImageBitmap) {
  if (!canvasRef.value) return;
  try {
    const canvas = canvasRef.value;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('bitmaprenderer')!.transferFromImageBitmap(bitmap);
  } catch {
    // Bitmap was detached
  }
}

// Render page when dependencies change
watch(
  [
    () => props.documentId,
    () => props.pageIndex,
    actualScale,
    actualDpr,
    renderProvides,
    refreshVersion,
  ],
  ([docId, pageIdx, scale, dpr, capability], [prevDocId], onCleanup) => {
    if (!capability) {
      if (canvasRef.value) {
        const canvas = canvasRef.value;
        canvas.width = canvas.width; // clears the canvas
      }
      return;
    }

    // CRITICAL: Clear canvas immediately when documentId changes (not for zoom/scale)
    if (prevDocId !== undefined && prevDocId !== docId) {
      if (canvasRef.value) {
        const canvas = canvasRef.value;
        canvas.width = canvas.width; // clears the canvas
      }
    }

    const task = capability.forDocument(docId).renderPageBitmap({
      pageIndex: pageIdx,
      options: {
        scaleFactor: scale,
        dpr,
      },
    });

    task.wait((bitmap) => {
      if (currentBitmap) {
        currentBitmap.close();
      }
      currentBitmap = bitmap;
      paintBitmap(bitmap);
      currentBitmap = null; // transferred to canvas, don't close
    }, ignore);

    onCleanup(() => {
      task.abort({
        code: PdfErrorCode.Cancelled,
        message: 'canceled render task',
      });
      if (currentBitmap) {
        currentBitmap.close();
        currentBitmap = null;
      }
    });
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (currentBitmap) {
    currentBitmap.close();
    currentBitmap = null;
  }
});
</script>

<template>
  <canvas
    ref="canvasRef"
    :style="{ width: '100%', height: '100%' }"
    v-bind="$attrs"
  />
</template>
