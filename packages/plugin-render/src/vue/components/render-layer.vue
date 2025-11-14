<script setup lang="ts">
import { ref, computed, watch } from 'vue';
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

const imageUrl = ref<string | null>(null);
let urlRef: string | null = null;
let hasLoaded = false;

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
      imageUrl.value = null;
      return;
    }

    // CRITICAL: Clear image immediately when documentId changes (not for zoom/scale)
    if (prevDocId !== undefined && prevDocId !== docId) {
      imageUrl.value = null;
      if (urlRef && hasLoaded) {
        URL.revokeObjectURL(urlRef);
        urlRef = null;
        hasLoaded = false;
      }
    }

    // Revoke old URL before creating new one (if it's been loaded)
    if (urlRef && hasLoaded && prevDocId === docId) {
      URL.revokeObjectURL(urlRef);
      urlRef = null;
      hasLoaded = false;
    }

    const task = capability.forDocument(docId).renderPage({
      pageIndex: pageIdx,
      options: {
        scaleFactor: scale,
        dpr,
      },
    });

    task.wait((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      urlRef = objectUrl;
      imageUrl.value = objectUrl;
      hasLoaded = false;
    }, ignore);

    onCleanup(() => {
      if (urlRef) {
        // Only revoke if image has loaded
        if (hasLoaded) {
          URL.revokeObjectURL(urlRef);
          urlRef = null;
          hasLoaded = false;
        }
      } else {
        // Task still in progress, abort it
        task.abort({
          code: PdfErrorCode.Cancelled,
          message: 'canceled render task',
        });
      }
    });
  },
  { immediate: true },
);

function handleImageLoad() {
  hasLoaded = true;
}
</script>

<template>
  <img
    v-if="imageUrl"
    :src="imageUrl"
    :style="{ width: '100%', height: '100%' }"
    @load="handleImageLoad"
    v-bind="$attrs"
  />
</template>
