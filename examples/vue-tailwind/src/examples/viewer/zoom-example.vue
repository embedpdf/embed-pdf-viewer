<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  PDFViewer,
  type EmbedPdfContainer,
  type PluginRegistry,
  type ZoomPlugin,
  ZoomMode,
} from '@embedpdf/vue-pdf-viewer';
import { ZoomIn, ZoomOut } from 'lucide-vue-next';

interface Props {
  themePreference?: 'light' | 'dark';
}

const props = withDefaults(defineProps<Props>(), {
  themePreference: 'light',
});

const container = ref<EmbedPdfContainer | null>(null);
const registry = ref<PluginRegistry | null>(null);

const handleInit = (c: EmbedPdfContainer) => {
  container.value = c;
};

const handleReady = (r: PluginRegistry) => {
  registry.value = r;
};

watch(
  () => props.themePreference,
  (preference) => {
    container.value?.setTheme({ preference });
  },
);

const getZoomPlugin = () => {
  return registry.value?.getPlugin<ZoomPlugin>('zoom')?.provides();
};

const handleZoomIn = () => {
  getZoomPlugin()?.forDocument('zoom-doc').zoomIn();
};

const handleZoomOut = () => {
  getZoomPlugin()?.forDocument('zoom-doc').zoomOut();
};

const handleFitWidth = () => {
  getZoomPlugin()?.forDocument('zoom-doc').requestZoom(ZoomMode.FitWidth);
};

const handleFitPage = () => {
  getZoomPlugin()?.forDocument('zoom-doc').requestZoom(ZoomMode.FitPage);
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- External Controls -->
    <div
      class="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <span class="px-2 text-sm font-medium text-gray-600 dark:text-gray-300">
        External Controls:
      </span>
      <div class="flex gap-1">
        <button
          type="button"
          @click="handleZoomIn"
          class="rounded p-2 hover:bg-gray-200 dark:hover:bg-gray-700"
          title="Zoom In"
        >
          <ZoomIn :size="18" />
        </button>
        <button
          type="button"
          @click="handleZoomOut"
          class="rounded p-2 hover:bg-gray-200 dark:hover:bg-gray-700"
          title="Zoom Out"
        >
          <ZoomOut :size="18" />
        </button>
        <div class="mx-2 h-6 w-px self-center bg-gray-300 dark:bg-gray-600"></div>
        <button
          type="button"
          @click="handleFitWidth"
          class="rounded px-3 py-1.5 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Fit Width
        </button>
        <button
          type="button"
          @click="handleFitPage"
          class="rounded px-3 py-1.5 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          Fit Page
        </button>
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
          zoom: {
            defaultZoomLevel: ZoomMode.FitPage,
          },
          documentManager: {
            initialDocuments: [
              {
                url: 'https://snippet.embedpdf.com/ebook.pdf',
                documentId: 'zoom-doc',
              },
            ],
          },
        }"
        :style="{ width: '100%', height: '100%' }"
      />
    </div>
  </div>
</template>
