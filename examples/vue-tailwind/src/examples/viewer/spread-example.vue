<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  PDFViewer,
  type EmbedPdfContainer,
  type PluginRegistry,
  type SpreadPlugin,
  type SpreadScope,
  SpreadMode,
} from '@embedpdf/vue-pdf-viewer';
import { File, BookOpen, Book } from 'lucide-vue-next';

interface Props {
  themePreference?: 'light' | 'dark';
}

const props = withDefaults(defineProps<Props>(), {
  themePreference: 'light',
});

const container = ref<EmbedPdfContainer | null>(null);
const docSpread = ref<SpreadScope | null>(null);
const currentMode = ref<SpreadMode>(SpreadMode.None);

const handleInit = (c: EmbedPdfContainer) => {
  container.value = c;
};

const handleReady = (registry: PluginRegistry) => {
  const spreadPlugin = registry.getPlugin<SpreadPlugin>('spread')?.provides();
  if (spreadPlugin) {
    docSpread.value = spreadPlugin.forDocument('spread-doc');
  }
};

watch(
  () => props.themePreference,
  (preference) => {
    container.value?.setTheme({ preference });
  },
);

const setSpreadMode = (mode: SpreadMode) => {
  docSpread.value?.setSpreadMode(mode);
  currentMode.value = mode;
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- External Controls -->
    <div
      class="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800"
    >
      <span class="px-2 text-sm font-medium text-gray-600 dark:text-gray-300"> Layout Mode: </span>
      <div class="flex gap-1">
        <button
          type="button"
          @click="setSpreadMode(SpreadMode.None)"
          class="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors"
          :class="
            currentMode === SpreadMode.None
              ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
              : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
          "
        >
          <File :size="16" />
          Single Page
        </button>
        <button
          type="button"
          @click="setSpreadMode(SpreadMode.Odd)"
          class="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors"
          :class="
            currentMode === SpreadMode.Odd
              ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
              : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
          "
        >
          <BookOpen :size="16" />
          Two-Page (Odd)
        </button>
        <button
          type="button"
          @click="setSpreadMode(SpreadMode.Even)"
          class="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors"
          :class="
            currentMode === SpreadMode.Even
              ? 'bg-white text-blue-600 shadow-sm dark:bg-gray-700 dark:text-blue-400'
              : 'text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
          "
        >
          <Book :size="16" />
          Two-Page (Even)
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
          spread: {
            defaultSpreadMode: SpreadMode.None,
          },
          documentManager: {
            initialDocuments: [
              {
                url: 'https://snippet.embedpdf.com/ebook.pdf',
                documentId: 'spread-doc',
              },
            ],
          },
        }"
        :style="{ width: '100%', height: '100%' }"
      />
    </div>
  </div>
</template>
