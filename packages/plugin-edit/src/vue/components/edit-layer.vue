<template>
  <div :style="{ position: 'relative', ...styleObject }" v-bind="$attrs">
    <template v-if="!pageState || pageState.detectionStatus !== 'detected'">
      <div
        v-if="pageState?.detectionStatus === 'detecting'"
        style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #666;
          font-size: 14px;
        "
      >
        Detecting text blocks...
      </div>
      <div
        v-else-if="pageState?.detectionStatus === 'error'"
        style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #f44336;
          font-size: 14px;
        "
      >
        Detection failed
      </div>
    </template>
    <template v-else>
      <!-- Background layer -->
      <BackgroundLayer
        :document-id="documentId"
        :page-index="pageIndex"
        :scale="actualScale"
        :style="{ position: 'absolute', top: 0, left: 0 }"
      />

      <!-- Text block overlays -->
      <TextBlockOverlay
        v-for="(block, idx) in pageState.textBlocks"
        :key="block.index"
        :document-id="documentId"
        :page-index="pageIndex"
        :block-index="idx"
        :block="block"
        :is-selected="pageState.selectedBlockIndex === idx"
        :offset="pageState.blockOffsets[idx] ?? null"
        :scale="actualScale"
        @select="handleBlockSelect(idx)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, type CSSProperties } from 'vue';
import { useDocumentState } from '@embedpdf/core/vue';
import { useEditPlugin, useEditCapability } from '../hooks/use-edit';
import type { EditPageState } from '@embedpdf/plugin-edit';
import BackgroundLayer from './background-layer.vue';
import TextBlockOverlay from './text-block-overlay.vue';

interface Props {
  documentId: string;
  pageIndex: number;
  scale?: number;
  rotation?: number;
  style?: CSSProperties;
}

const props = defineProps<Props>();

const { plugin: editPlugin } = useEditPlugin();
const { provides: editCapability } = useEditCapability();
const documentState = useDocumentState(() => props.documentId);

const pageState = ref<EditPageState | null>(null);
let unregister: (() => void) | null = null;

const styleObject = computed(() => props.style || {});

const actualScale = computed(() => {
  if (props.scale !== undefined) return props.scale;
  return documentState.value?.scale ?? 1;
});

watch(
  [() => editPlugin, () => props.documentId, () => props.pageIndex],
  ([plugin, docId, pageIdx]) => {
    // Cleanup previous registration
    if (unregister) {
      unregister();
      unregister = null;
    }

    if (!plugin || !docId) {
      pageState.value = null;
      return;
    }

    unregister =
      plugin.value?.registerEditOnPage({
        documentId: docId,
        pageIndex: pageIdx,
        onStateChange: (state) => {
          pageState.value = state;
        },
      }) ?? null;
  },
  { immediate: true },
);

function handleBlockSelect(blockIndex: number) {
  editCapability.value?.forDocument(props.documentId).selectBlock(props.pageIndex, blockIndex);
}

onUnmounted(() => {
  if (unregister) {
    unregister();
    unregister = null;
  }
});
</script>
