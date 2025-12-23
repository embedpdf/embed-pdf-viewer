<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import {
  PDFViewer,
  type EmbedPdfContainer,
  type PluginRegistry,
  type AnnotationPlugin,
  type AnnotationCapability,
} from '@embedpdf/vue-pdf-viewer';
import { Highlighter, Pen, Square, MousePointer2 } from 'lucide-vue-next';

interface Props {
  themePreference?: 'light' | 'dark';
}

const props = withDefaults(defineProps<Props>(), {
  themePreference: 'light',
});

const container = ref<EmbedPdfContainer | null>(null);
const annotationCapability = ref<AnnotationCapability | null>(null);
const activeTool = ref<string | null>(null);
const lastEvent = ref('Ready');
const cleanups: (() => void)[] = [];

const handleInit = (c: EmbedPdfContainer) => {
  container.value = c;
};

const handleReady = (registry: PluginRegistry) => {
  const annotationPlugin = registry.getPlugin<AnnotationPlugin>('annotation')?.provides();

  if (annotationPlugin) {
    annotationCapability.value = annotationPlugin;

    const cleanupTool = annotationPlugin.onActiveToolChange(({ tool }) => {
      activeTool.value = tool?.id || null;
    });
    cleanups.push(cleanupTool);

    const cleanupEvents = annotationPlugin.onAnnotationEvent((event) => {
      if (event.type === 'create') {
        lastEvent.value = `Created annotation on page ${event.pageIndex + 1}`;
      } else if (event.type === 'delete') {
        lastEvent.value = `Deleted annotation from page ${event.pageIndex + 1}`;
      }
    });
    cleanups.push(cleanupEvents);
  }
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
  annotationCapability.value?.setActiveTool(toolId);
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- External Controls -->
    <div
      class="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-600 dark:text-gray-300"> Tools: </span>
          <div class="flex gap-1">
            <button
              type="button"
              @click="setTool(null)"
              class="rounded p-2 transition-colors"
              :class="
                activeTool === null
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
                  : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
              "
              title="Select / None"
            >
              <MousePointer2 :size="18" />
            </button>
            <button
              type="button"
              @click="setTool('highlight')"
              class="rounded p-2 transition-colors"
              :class="
                activeTool === 'highlight'
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
                  : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
              "
              title="Highlighter"
            >
              <Highlighter :size="18" />
            </button>
            <button
              type="button"
              @click="setTool('ink')"
              class="rounded p-2 transition-colors"
              :class="
                activeTool === 'ink'
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
                  : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
              "
              title="Pen (Ink)"
            >
              <Pen :size="18" />
            </button>
            <button
              type="button"
              @click="setTool('square')"
              class="rounded p-2 transition-colors"
              :class="
                activeTool === 'square'
                  ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
                  : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
              "
              title="Square"
            >
              <Square :size="18" />
            </button>
          </div>
        </div>
        <div class="text-xs text-gray-500 dark:text-gray-400">Log: {{ lastEvent }}</div>
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
                documentId: 'annotation-doc',
              },
            ],
          },
        }"
        :style="{ width: '100%', height: '100%' }"
      />
    </div>
  </div>
</template>
