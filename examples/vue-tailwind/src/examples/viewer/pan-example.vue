<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import {
  PDFViewer,
  type EmbedPdfContainer,
  type PluginRegistry,
  type PanPlugin,
  type PanScope,
} from '@embedpdf/vue-pdf-viewer';
import { Hand, MousePointer2 } from 'lucide-vue-next';

interface Props {
  themePreference?: 'light' | 'dark';
}

const props = withDefaults(defineProps<Props>(), {
  themePreference: 'light',
});

const container = ref<EmbedPdfContainer | null>(null);
const docPan = ref<PanScope | null>(null);
const isPanMode = ref(false);
const cleanups: (() => void)[] = [];

const handleInit = (c: EmbedPdfContainer) => {
  container.value = c;
};

const handleReady = (registry: PluginRegistry) => {
  const panPlugin = registry.getPlugin<PanPlugin>('pan')?.provides();
  const panScope = panPlugin?.forDocument('pan-doc');

  if (panScope) {
    docPan.value = panScope;
    isPanMode.value = panScope.isPanMode();

    const cleanup = panScope.onPanModeChange((isActive) => {
      isPanMode.value = isActive;
    });
    cleanups.push(cleanup);
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

const togglePanMode = () => {
  docPan.value?.togglePan();
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- External Controls -->
    <div
      class="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <span class="px-2 text-sm font-medium text-gray-600 dark:text-gray-300">
        Interaction Mode:
      </span>
      <button
        type="button"
        @click="togglePanMode"
        class="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors"
        :class="
          !isPanMode
            ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
            : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
        "
      >
        <MousePointer2 :size="16" />
        Select Text
      </button>
      <button
        type="button"
        @click="togglePanMode"
        class="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors"
        :class="
          isPanMode
            ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
            : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
        "
      >
        <Hand :size="16" />
        Pan (Hand Tool)
      </button>
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
          pan: {
            defaultMode: 'mobile',
          },
          documentManager: {
            initialDocuments: [
              {
                url: 'https://snippet.embedpdf.com/ebook.pdf',
                documentId: 'pan-doc',
              },
            ],
          },
        }"
        :style="{ width: '100%', height: '100%' }"
      />
    </div>
  </div>
</template>
