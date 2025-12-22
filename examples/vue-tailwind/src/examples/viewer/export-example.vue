<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  PDFViewer,
  type EmbedPdfContainer,
  type PluginRegistry,
  type ExportPlugin,
  type ExportScope,
} from '@embedpdf/vue-pdf-viewer';
import { Download, CloudUpload, Loader2, Check } from 'lucide-vue-next';

interface Props {
  themePreference?: 'light' | 'dark';
}

const props = withDefaults(defineProps<Props>(), {
  themePreference: 'light',
});

const container = ref<EmbedPdfContainer | null>(null);
const exportScope = ref<ExportScope | null>(null);
const isSaving = ref(false);
const saveStatus = ref<'idle' | 'success'>('idle');

const handleInit = (c: EmbedPdfContainer) => {
  container.value = c;
};

const handleReady = (registry: PluginRegistry) => {
  const exportPlugin = registry.getPlugin<ExportPlugin>('export')?.provides();
  if (exportPlugin) {
    exportScope.value = exportPlugin.forDocument('ebook');
  }
};

watch(
  () => props.themePreference,
  (preference) => {
    container.value?.setTheme({ preference });
  },
);

const handleDownload = () => {
  exportScope.value?.download();
};

const handleSaveToServer = async () => {
  if (!exportScope.value) return;

  isSaving.value = true;

  const arrayBuffer = await exportScope.value.saveAsCopy().toPromise();

  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
  const file = new File([blob], 'saved-document.pdf');

  // Mock Upload
  await new Promise((resolve) => setTimeout(resolve, 1500));

  console.log(`Successfully prepared ${file.size} bytes for upload.`);
  saveStatus.value = 'success';
  setTimeout(() => (saveStatus.value = 'idle'), 3000);
  isSaving.value = false;
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- External Controls -->
    <div
      class="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      <button
        type="button"
        @click="handleDownload"
        class="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
      >
        <Download :size="16" />
        Download PDF
      </button>

      <div class="h-6 w-px bg-gray-300 dark:bg-gray-600"></div>

      <button
        type="button"
        @click="handleSaveToServer"
        :disabled="isSaving"
        class="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
      >
        <Loader2 v-if="isSaving" :size="16" class="animate-spin" />
        <Check v-else-if="saveStatus === 'success'" :size="16" />
        <CloudUpload v-else :size="16" />
        {{ isSaving ? 'Saving...' : saveStatus === 'success' ? 'Saved!' : 'Save to Server' }}
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
          documentManager: {
            initialDocuments: [
              {
                url: 'https://snippet.embedpdf.com/ebook.pdf',
                documentId: 'ebook',
              },
            ],
          },
          export: {
            defaultFileName: 'my-ebook.pdf',
          },
        }"
        :style="{ width: '100%', height: '100%' }"
      />
    </div>
  </div>
</template>
