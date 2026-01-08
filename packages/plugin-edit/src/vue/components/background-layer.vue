<template>
  <img
    v-if="imageUrl"
    :src="imageUrl"
    @load="handleImageLoad"
    :style="{
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      ...styleObject,
    }"
    v-bind="$attrs"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, type CSSProperties } from 'vue';
import { ignore, PdfErrorCode } from '@embedpdf/models';
import { useDocumentState } from '@embedpdf/core/vue';
import { useEditCapability } from '../hooks/use-edit';

interface Props {
  documentId: string;
  pageIndex: number;
  scale?: number;
  style?: CSSProperties;
}

const props = defineProps<Props>();

const { provides: editCapability } = useEditCapability();
const documentState = useDocumentState(() => props.documentId);

const imageUrl = ref<string | null>(null);
let urlRef: string | null = null;
let abortController: { abort: () => void } | null = null;

const styleObject = computed(() => props.style || {});

const actualScale = computed(() => {
  if (props.scale !== undefined) return props.scale;
  return documentState.value?.scale ?? 1;
});

watch(
  [() => props.documentId, () => props.pageIndex, actualScale, editCapability],
  ([docId, pageIdx, scale, capability]) => {
    // Cleanup previous
    if (urlRef) {
      URL.revokeObjectURL(urlRef);
      urlRef = null;
    }
    if (abortController) {
      abortController.abort();
      abortController = null;
    }

    if (!capability || !docId) {
      imageUrl.value = null;
      return;
    }

    const scope = capability.forDocument(docId);
    const task = scope.renderBackground(pageIdx, { scale });

    abortController = {
      abort: () => {
        task.abort({
          code: PdfErrorCode.Cancelled,
          message: 'canceled background render task',
        });
      },
    };

    task.wait((blob) => {
      const url = URL.createObjectURL(blob);
      urlRef = url;
      imageUrl.value = url;
      abortController = null;
    }, ignore);
  },
  { immediate: true },
);

function handleImageLoad() {
  if (urlRef) {
    URL.revokeObjectURL(urlRef);
    urlRef = null;
  }
}

onUnmounted(() => {
  if (urlRef) {
    URL.revokeObjectURL(urlRef);
    urlRef = null;
  }
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
});
</script>
