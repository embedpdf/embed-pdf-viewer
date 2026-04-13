<script setup lang="ts">
import { ref, shallowRef, watch, onUnmounted } from 'vue';
import {
  PDFViewer,
  type EmbedPdfContainer,
  type PluginRegistry,
  type AnnotationPlugin,
  type AnnotationCapability,
  type AnnotationTool,
  type AnnotationTransferItem,
  PdfAnnotationSubtype,
  type PdfStampAnnoObject,
} from '@embedpdf/vue-pdf-viewer';
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
  MousePointer2,
} from 'lucide-vue-next';

interface Props {
  themePreference?: 'light' | 'dark';
}

const props = withDefaults(defineProps<Props>(), {
  themePreference: 'light',
});

const container = ref<EmbedPdfContainer | null>(null);
const annotationApi = ref<AnnotationCapability | null>(null);
const activeTool = ref<string | null>(null);
const annotationCount = ref(0);
const exported = shallowRef<AnnotationTransferItem[] | null>(null);
const status = ref<string | null>(null);
const cleanups: (() => void)[] = [];

const handleInit = (c: EmbedPdfContainer) => {
  container.value = c;
};

const handleReady = (registry: PluginRegistry) => {
  const api = registry.getPlugin<AnnotationPlugin>('annotation')?.provides();
  if (!api) return;

  annotationApi.value = api;

  api.addTool<AnnotationTool<PdfStampAnnoObject>>({
    id: 'stampCheckmark',
    name: 'Checkmark',
    interaction: { exclusive: true, cursor: 'crosshair' },
    matchScore: () => 0,
    defaults: {
      type: PdfAnnotationSubtype.STAMP,
      imageSrc: '/circle-checkmark.png',
      imageSize: { width: 30, height: 30 },
    },
    behavior: {
      showGhost: true,
      deactivateToolAfterCreate: true,
      selectAfterCreate: true,
    },
  });

  api.addTool<AnnotationTool<PdfStampAnnoObject>>({
    id: 'stampCross',
    name: 'Cross',
    interaction: { exclusive: true, cursor: 'crosshair' },
    matchScore: () => 0,
    defaults: {
      type: PdfAnnotationSubtype.STAMP,
      imageSrc: '/circle-cross.png',
      imageSize: { width: 30, height: 30 },
    },
    behavior: {
      showGhost: true,
      deactivateToolAfterCreate: true,
      selectAfterCreate: true,
    },
  });

  const cleanupTool = api.onActiveToolChange(({ tool }) => {
    activeTool.value = tool?.id || null;
  });
  cleanups.push(cleanupTool);

  const cleanupEvents = api.onAnnotationEvent((event) => {
    if (event.type === 'create' || event.type === 'delete' || event.type === 'loaded') {
      annotationCount.value = api.getAnnotations().length;
    }
  });
  cleanups.push(cleanupEvents);

  annotationCount.value = api.getAnnotations().length;
};

watch(
  () => props.themePreference,
  (preference) => {
    container.value?.setTheme({ preference });
  },
);

onUnmounted(() => {
  cleanups.forEach((cleanup) => cleanup());
});

const setTool = (toolId: string | null) => {
  annotationApi.value?.setActiveTool(toolId);
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

const tools = [
  { id: null, name: 'Select', icon: MousePointer2 },
  { id: 'stampCheckmark', name: 'Checkmark', icon: Check },
  { id: 'stampCross', name: 'Cross', icon: X },
  { id: 'ink', name: 'Pen', icon: Pencil },
  { id: 'square', name: 'Square', icon: Square },
  { id: 'highlight', name: 'Highlight', icon: Highlighter },
  { id: 'freeText', name: 'Text', icon: Type },
];
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Toolbar -->
    <div
      class="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
    >
      <!-- Annotation tools -->
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
          Tools
        </span>
        <div class="h-4 w-px bg-gray-300 dark:bg-gray-600" />
        <div class="flex items-center gap-1">
          <button
            v-for="tool in tools"
            :key="tool.id ?? 'select'"
            type="button"
            @click="setTool(activeTool === tool.id && tool.id !== null ? null : tool.id)"
            class="rounded p-2 transition-colors"
            :class="
              activeTool === tool.id
                ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
                : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
            "
            :title="tool.name"
          >
            <component :is="tool.icon" :size="16" />
          </button>
        </div>
      </div>

      <!-- Import/Export actions -->
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">
          Import / Export
        </span>
        <div class="h-4 w-px bg-gray-300 dark:bg-gray-600" />
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            @click="handleExport"
            :disabled="annotationCount === 0"
            class="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download :size="14" />
            Export ({{ annotationCount }})
          </button>
          <button
            type="button"
            @click="handleClear"
            :disabled="annotationCount === 0"
            class="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 :size="14" />
            Clear All
          </button>
          <button
            type="button"
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

    <!-- Viewer -->
    <div
      class="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
    >
      <PDFViewer
        @init="handleInit"
        @ready="handleReady"
        :config="{
          theme: { preference: themePreference },
          annotations: {
            annotationAuthor: 'Guest User',
            selectAfterCreate: true,
          },
          documentManager: {
            initialDocuments: [
              {
                url: 'https://snippet.embedpdf.com/ebook.pdf',
                documentId: 'import-export-doc',
              },
            ],
          },
        }"
        :style="{ width: '100%', height: '100%' }"
      />
    </div>
  </div>
</template>
