<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { AnnotationLayer, useAnnotationCapability } from '@embedpdf/plugin-annotation/vue';
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/vue';
import { SelectionLayer } from '@embedpdf/plugin-selection/vue';

const activeTool = ref<string | null>(null);
const canDelete = ref(false);

const { provides: annotationApi } = useAnnotationCapability();

const tools = [
  { id: 'stampCheckmark', name: 'Checkmark (stamp)' },
  { id: 'stampCross', name: 'Cross (stamp)' },
  { id: 'ink', name: 'Pen' },
  { id: 'square', name: 'Square' },
  { id: 'highlight', name: 'Highlight' },
];

let unsubscribeToolChange: (() => void) | undefined;
let unsubscribeStateChange: (() => void) | undefined;

onMounted(() => {
  if (!annotationApi.value) return;

  unsubscribeToolChange = annotationApi.value.onActiveToolChange((tool) => {
    activeTool.value = tool?.id ?? null;
  });

  unsubscribeStateChange = annotationApi.value.onStateChange((state) => {
    canDelete.value = !!state.selectedUid;
  });
});

onUnmounted(() => {
  unsubscribeToolChange?.();
  unsubscribeStateChange?.();
});

const handleToolClick = (toolId: string) => {
  annotationApi.value?.setActiveTool(activeTool.value === toolId ? null : toolId);
};

const handleDelete = () => {
  const selection = annotationApi.value?.getSelectedAnnotation();
  if (selection) {
    annotationApi.value?.deleteAnnotation(selection.object.pageIndex, selection.object.id);
  }
};
</script>

<template>
  <div style="height: 600px; display: flex; flex-direction: column; user-select: none">
    <div
      class="mb-4 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-sm"
    >
      <button
        v-for="tool in tools"
        :key="tool.id"
        @click="handleToolClick(tool.id)"
        :class="[
          'rounded-md px-3 py-1 text-sm font-medium transition-colors',
          activeTool === tool.id ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200',
        ]"
      >
        {{ tool.name }}
      </button>
      <div class="h-6 w-px bg-gray-200"></div>
      <button
        @click="handleDelete"
        :disabled="!canDelete"
        class="rounded-md bg-red-500 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-red-300"
      >
        Delete Selected
      </button>
    </div>
    <div class="flex-grow" style="position: relative">
      <Viewport style="width: 100%; height: 100%; position: absolute; background-color: #f1f3f5">
        <Scroller>
          <template #default="{ page }">
            <PagePointerProvider
              :page-index="page.pageIndex"
              :page-width="page.width"
              :page-height="page.height"
              :rotation="page.rotation"
              :scale="page.scale"
            >
              <RenderLayer :page-index="page.pageIndex" style="pointer-events: none" />
              <SelectionLayer :page-index="page.pageIndex" :scale="page.scale" />
              <AnnotationLayer
                :page-index="page.pageIndex"
                :scale="page.scale"
                :page-width="page.width"
                :page-height="page.height"
                :rotation="page.rotation"
              />
            </PagePointerProvider>
          </template>
        </Scroller>
      </Viewport>
    </div>
  </div>
</template>
