<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  PDFViewer,
  type EmbedPdfContainer,
  type PluginRegistry,
  type PrintPlugin,
  type PrintScope,
} from '@embedpdf/vue-pdf-viewer';
import { Printer } from 'lucide-vue-next';

interface Props {
  themePreference?: 'light' | 'dark';
}

const props = withDefaults(defineProps<Props>(), {
  themePreference: 'light',
});

const container = ref<EmbedPdfContainer | null>(null);
const docPrint = ref<PrintScope | null>(null);
const isPrinting = ref(false);

const handleInit = (c: EmbedPdfContainer) => {
  container.value = c;
};

const handleReady = (registry: PluginRegistry) => {
  const printPlugin = registry.getPlugin<PrintPlugin>('print')?.provides();
  if (printPlugin) {
    docPrint.value = printPlugin.forDocument('ebook');
  }
};

watch(
  () => props.themePreference,
  (preference) => {
    container.value?.setTheme({ preference });
  },
);

const handlePrint = () => {
  if (isPrinting.value || !docPrint.value) return;

  isPrinting.value = true;

  docPrint.value.print().wait(
    () => (isPrinting.value = false),
    (err) => {
      console.error('Print failed', err);
      isPrinting.value = false;
    },
  );
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- External Controls -->
    <div
      class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      <div class="flex items-center gap-4">
        <button
          type="button"
          @click="handlePrint"
          :disabled="isPrinting"
          class="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-gray-700"
        >
          <Printer :size="18" />
          {{ isPrinting ? 'Preparing...' : 'Print Document' }}
        </button>

        <span v-if="isPrinting" class="animate-pulse text-sm text-gray-500 dark:text-gray-400">
          Generating print version...
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
