<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { AnnotationLayer, useAnnotationCapability } from '@embedpdf/plugin-annotation/vue';
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/vue';
import { SelectionLayer } from '@embedpdf/plugin-selection/vue';
import { Check, X, Pencil, Square, Highlighter, Trash2 } from 'lucide-vue-next';

const props = defineProps<{
  documentId: string;
}>();

const activeTool = ref<string | null>(null);
const canDelete = ref(false);

const { provides: annotationCapability } = useAnnotationCapability();
const annotationApi = computed(() => annotationCapability.value?.forDocument(props.documentId));

const tools = [
  { id: 'stampCheckmark', name: 'Checkmark', icon: Check },
  { id: 'stampCross', name: 'Cross', icon: X },
  { id: 'ink', name: 'Pen', icon: Pencil },
  { id: 'square', name: 'Square', icon: Square },
  { id: 'highlight', name: 'Highlight', icon: Highlighter },
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

const handleDeleteFromMenu = (pageIndex: number, id: string) => {
  annotationApi.value?.deleteAnnotation(pageIndex, id);
};
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
    style="user-select: none"
  >
    <!-- Toolbar -->
    <div
      class="flex flex-wrap items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
        Tools
      </span>
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
      <div class="flex items-center gap-1.5">
        <button
          v-for="tool in tools"
          :key="tool.id"
          @click="handleToolClick(tool.id)"
          :class="[
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium shadow-sm transition-all',
            activeTool === tool.id
              ? 'bg-blue-500 text-white ring-1 ring-blue-600'
              : 'bg-white text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-100',
          ]"
          :title="tool.name"
        >
          <component :is="tool.icon" :size="14" />
          <span class="hidden sm:inline">{{ tool.name }}</span>
        </button>
      </div>
      <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
      <button
        @click="handleDelete"
        :disabled="!canDelete"
        class="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 :size="14" />
        <span class="hidden sm:inline">Delete</span>
      </button>
    </div>

    <!-- PDF Viewer Area -->
    <div class="relative h-[450px] sm:h-[550px]">
      <Viewport :document-id="documentId" class="absolute inset-0 bg-gray-200 dark:bg-gray-800">
        <Scroller :document-id="documentId">
          <template #default="{ page }">
            <PagePointerProvider :document-id="documentId" :page-index="page.pageIndex">
              <RenderLayer
                :document-id="documentId"
                :page-index="page.pageIndex"
                :scale="1"
                style="pointer-events: none"
              />
              <SelectionLayer :document-id="documentId" :page-index="page.pageIndex" />
              <AnnotationLayer :document-id="documentId" :page-index="page.pageIndex">
                <template #selection-menu="{ selected, context, menuWrapperProps, rect }">
                  <div v-if="selected" v-bind="menuWrapperProps">
                    <div
                      class="rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
                      :style="{
                        position: 'absolute',
                        top: `${rect.size.height + 8}px`,
                        pointerEvents: 'auto',
                        cursor: 'default',
                      }"
                    >
                      <div class="flex items-center gap-1 px-2 py-1">
                        <button
                          @click="
                            handleDeleteFromMenu(
                              context.annotation.object.pageIndex,
                              context.annotation.object.id,
                            )
                          "
                          class="flex items-center justify-center rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-red-400"
                          aria-label="Delete annotation"
                          title="Delete annotation"
                        >
                          <Trash2 :size="16" />
                        </button>
                      </div>
                    </div>
                  </div>
                </template>
              </AnnotationLayer>
            </PagePointerProvider>
          </template>
        </Scroller>
      </Viewport>
    </div>
  </div>
</template>
