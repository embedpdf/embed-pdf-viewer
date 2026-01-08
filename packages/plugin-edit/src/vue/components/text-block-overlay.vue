<template>
  <div
    @click="handleClick"
    :style="{
      position: 'absolute',
      left: `${position.left}px`,
      top: `${position.top}px`,
      width: `${position.width}px`,
      height: `${position.height}px`,
      cursor: 'pointer',
      outline: isSelected ? '2px solid #2196F3' : 'none',
      outlineOffset: '2px',
      ...styleObject,
    }"
    v-bind="$attrs"
  >
    <img
      v-if="imageUrl"
      :src="imageUrl"
      @load="handleImageLoad"
      style="width: 100%; height: 100%; pointer-events: none"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, type CSSProperties } from 'vue';
import { ignore, PdfErrorCode, type PdfTextBlock, type Position } from '@embedpdf/models';
import { useDocumentState } from '@embedpdf/core/vue';
import { useEditCapability } from '../hooks/use-edit';

interface Props {
  documentId: string;
  pageIndex: number;
  blockIndex: number;
  block: PdfTextBlock;
  isSelected: boolean;
  offset: Position | null;
  scale?: number;
  style?: CSSProperties;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  select: [];
}>();

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

const position = computed(() => {
  const scale = actualScale.value;
  const baseX = props.block.inkBounds.origin.x * scale;
  const baseY = props.block.inkBounds.origin.y * scale;
  return {
    left: baseX + (props.offset?.x ?? 0) * scale,
    top: baseY + (props.offset?.y ?? 0) * scale,
    width: props.block.inkBounds.size.width * scale,
    height: props.block.inkBounds.size.height * scale,
  };
});

watch(
  [
    () => props.documentId,
    () => props.pageIndex,
    () => props.blockIndex,
    actualScale,
    editCapability,
  ],
  ([docId, pageIdx, blockIdx, scale, capability]) => {
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
    const task = scope.renderTextBlock(pageIdx, { blockIndex: blockIdx, scale });

    abortController = {
      abort: () => {
        task.abort({
          code: PdfErrorCode.Cancelled,
          message: 'canceled text block render task',
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

function handleClick() {
  emit('select');
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
