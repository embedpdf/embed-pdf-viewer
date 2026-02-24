<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import {
  PDFViewer,
  type EmbedPdfContainer,
  type PluginRegistry,
  type SelectionPlugin,
  type SelectionScope,
} from '@embedpdf/vue-pdf-viewer';
import { Copy, X } from 'lucide-vue-next';

interface Props {
  themePreference?: 'light' | 'dark';
}

const props = withDefaults(defineProps<Props>(), {
  themePreference: 'light',
});

const container = ref<EmbedPdfContainer | null>(null);
const selection = ref<SelectionScope | null>(null);
const hasSelection = ref(false);
const lastAction = ref<string | null>(null);
const cleanups: (() => void)[] = [];

const handleInit = (c: EmbedPdfContainer) => {
  container.value = c;
};

const handleReady = (registry: PluginRegistry) => {
  const selectionPlugin = registry.getPlugin<SelectionPlugin>('selection')?.provides();
  const docSelection = selectionPlugin?.forDocument('ebook');

  if (docSelection) {
    selection.value = docSelection;

    const cleanup = docSelection.onSelectionChange((currentSelection) => {
      hasSelection.value = !!currentSelection;
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

const handleCopy = () => {
  selection.value?.copyToClipboard();
  lastAction.value = 'Copied to clipboard!';
  setTimeout(() => (lastAction.value = null), 2000);
};

const handleClear = () => {
  selection.value?.clear();
  lastAction.value = 'Selection cleared';
  setTimeout(() => (lastAction.value = null), 2000);
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- External Controls -->
    <div
      class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2">
          <button
            type="button"
            @click="handleCopy"
            :disabled="!hasSelection"
            class="flex items-center gap-2 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-700 dark:disabled:text-gray-500"
          >
            <Copy :size="16" />
            Copy
          </button>
          <button
            type="button"
            @click="handleClear"
            :disabled="!hasSelection"
            class="flex items-center gap-2 rounded bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          >
            <X :size="16" />
            Clear
          </button>
        </div>
        <span v-if="lastAction" class="text-sm text-green-600 dark:text-green-400">
          {{ lastAction }}
        </span>
      </div>
      <div class="text-xs text-gray-500">Select text in the PDF to enable buttons</div>
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
          documentManager: {
            initialDocuments: [
              {
                url: 'https://snippet.embedpdf.com/ebook.pdf',
                documentId: 'ebook',
              },
            ],
          },
        }"
        :style="{ width: '100%', height: '100%' }"
      />
    </div>
  </div>
</template>
