<script setup lang="ts">
import { ref, shallowRef, onMounted, onUnmounted, computed } from 'vue';
import { Viewport } from '@embedpdf/plugin-viewport/vue';
import { Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderLayer } from '@embedpdf/plugin-render/vue';
import { AnnotationLayer, useAnnotationCapability } from '@embedpdf/plugin-annotation/vue';
import type { AnnotationTransferItem } from '@embedpdf/plugin-annotation';
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/vue';
import { SelectionLayer } from '@embedpdf/plugin-selection/vue';
import {
  Check,
  X,
  Pencil,
  Square,
  Highlighter,
  Type,
  Download,
  Upload,
  Trash2,
} from 'lucide-vue-next';

const props = defineProps<{
  documentId: string;
}>();

const activeTool = ref<string | null>(null);
const exported = shallowRef<AnnotationTransferItem[] | null>(null);
const status = ref<string | null>(null);
const annotationCount = ref(0);

const { provides: annotationCapability } = useAnnotationCapability();
const annotationApi = computed(() => annotationCapability.value?.forDocument(props.documentId));

const tools = [
  { id: 'stampCheckmark', name: 'Checkmark', icon: Check },
  { id: 'stampCross', name: 'Cross', icon: X },
  { id: 'ink', name: 'Pen', icon: Pencil },
  { id: 'square', name: 'Square', icon: Square },
  { id: 'highlight', name: 'Highlight', icon: Highlighter },
  { id: 'freeText', name: 'Text', icon: Type },
];

let unsubscribeToolChange: (() => void) | undefined;
let unsubscribeStateChange: (() => void) | undefined;

onMounted(() => {
  if (!annotationApi.value) return;

  unsubscribeToolChange = annotationApi.value.onActiveToolChange((tool) => {
    activeTool.value = tool?.id ?? null;
  });

  unsubscribeStateChange = annotationApi.value.onStateChange((state) => {
    annotationCount.value = Object.values(state.pages).reduce((sum, uids) => sum + uids.length, 0);
  });
});

onUnmounted(() => {
  unsubscribeToolChange?.();
  unsubscribeStateChange?.();
});

const handleToolClick = (toolId: string) => {
  annotationApi.value?.setActiveTool(activeTool.value === toolId ? null : toolId);
};

const handleExport = () => {
  if (!annotationApi.value) return;
  annotationApi.value.exportAnnotations().wait(
    (result) => {
      exported.value = result;
      status.value = `Exported ${result.length} annotation${result.length !== 1 ? 's' : ''}`;
    },
    () => {
      status.value = 'Export failed';
    },
  );
};

const handleClear = () => {
  if (!annotationApi.value) return;
  annotationApi.value.deleteAllAnnotations();
  status.value = 'Cleared all annotations';
};

const handleImport = () => {
  if (!annotationApi.value || !exported.value) return;
  annotationApi.value.importAnnotations(exported.value);
  status.value = `Imported ${exported.value.length} annotation${exported.value.length !== 1 ? 's' : ''}`;
};
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
    style="user-select: none"
  >
    <!-- Toolbar -->
    <div
      class="flex flex-col gap-2 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <!-- Annotation tools -->
      <div class="flex flex-wrap items-center gap-3">
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
      </div>

      <!-- Import/Export actions -->
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
          Import / Export
        </span>
        <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
        <div class="flex items-center gap-1.5">
          <button
            @click="handleExport"
            :disabled="annotationCount === 0"
            class="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download :size="14" />
            Export ({{ annotationCount }})
          </button>
          <button
            @click="handleClear"
            :disabled="annotationCount === 0"
            class="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 :size="14" />
            Clear All
          </button>
          <button
            @click="handleImport"
            :disabled="!exported"
            class="inline-flex items-center gap-1.5 rounded-md bg-blue-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload :size="14" />
            Import{{ exported ? ` (${exported.length})` : '' }}
          </button>
        </div>

        <span v-if="status" class="text-xs text-gray-500 dark:text-gray-400">
          {{ status }}
        </span>
      </div>
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
              <AnnotationLayer :document-id="documentId" :page-index="page.pageIndex" />
            </PagePointerProvider>
          </template>
        </Scroller>
      </Viewport>
    </div>
  </div>
</template>
