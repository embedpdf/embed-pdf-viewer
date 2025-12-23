<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  PDFViewer,
  type EmbedPdfContainer,
  type PluginRegistry,
  type DocumentManagerPlugin,
} from '@embedpdf/vue-pdf-viewer';

interface Props {
  themePreference?: 'light' | 'dark';
}

const props = withDefaults(defineProps<Props>(), {
  themePreference: 'light',
});

const container = ref<EmbedPdfContainer | null>(null);
const registry = ref<PluginRegistry | null>(null);
const isReady = ref(false);
const isLoading = ref(false);
const metadata = ref<{
  title?: string | null;
  author?: string | null;
  subject?: string | null;
  creator?: string | null;
  producer?: string | null;
  creationDate?: Date | null;
  modificationDate?: Date | null;
} | null>(null);
const pageCount = ref<number | null>(null);

const handleInit = (c: EmbedPdfContainer) => {
  container.value = c;
};

const handleReady = (r: PluginRegistry) => {
  registry.value = r;
  isReady.value = true;
};

watch(
  () => props.themePreference,
  (preference) => {
    container.value?.setTheme({ preference });
  },
);

const getDocumentInfo = async () => {
  if (!registry.value) return;

  isLoading.value = true;

  try {
    const documentManager = registry.value
      .getPlugin<DocumentManagerPlugin>('document-manager')
      ?.provides();
    const engine = registry.value.getEngine();

    if (engine && documentManager) {
      const document = documentManager.getActiveDocument();
      if (document) {
        pageCount.value = document.pageCount;
        const meta = await engine.getMetadata(document).toPromise();
        metadata.value = meta;
      }
    }
  } catch (error) {
    console.error('Error getting document info:', error);
  } finally {
    isLoading.value = false;
  }
};

const formatDate = (date?: Date | null) => {
  if (!date) return '—';
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Controls -->
    <div
      class="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      <div class="flex flex-wrap items-center gap-4">
        <div class="flex items-center gap-2">
          <span
            class="inline-block h-2 w-2 rounded-full"
            :class="isReady ? 'bg-green-500' : 'bg-yellow-500'"
          ></span>
          <span class="text-sm text-gray-600 dark:text-gray-300">
            {{ isReady ? 'Engine ready' : 'Loading...' }}
          </span>
        </div>

        <button
          type="button"
          @click="getDocumentInfo"
          :disabled="!isReady || isLoading"
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {{ isLoading ? 'Loading...' : 'Get Document Info' }}
        </button>
      </div>

      <!-- Metadata Display -->
      <div
        v-if="metadata"
        class="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-gray-200 bg-white p-4 text-sm sm:grid-cols-3 dark:border-gray-600 dark:bg-gray-700"
      >
        <div>
          <span
            class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Title
          </span>
          <p class="truncate text-gray-900 dark:text-gray-100">
            {{ metadata.title || '—' }}
          </p>
        </div>
        <div>
          <span
            class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Author
          </span>
          <p class="truncate text-gray-900 dark:text-gray-100">
            {{ metadata.author || '—' }}
          </p>
        </div>
        <div>
          <span
            class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Pages
          </span>
          <p class="text-gray-900 dark:text-gray-100">
            {{ pageCount ?? '—' }}
          </p>
        </div>
        <div>
          <span
            class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Creator
          </span>
          <p class="truncate text-gray-900 dark:text-gray-100">
            {{ metadata.creator || '—' }}
          </p>
        </div>
        <div>
          <span
            class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Created
          </span>
          <p class="text-gray-900 dark:text-gray-100">
            {{ formatDate(metadata.creationDate) }}
          </p>
        </div>
        <div>
          <span
            class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Modified
          </span>
          <p class="text-gray-900 dark:text-gray-100">
            {{ formatDate(metadata.modificationDate) }}
          </p>
        </div>
      </div>
    </div>

    <!-- Viewer Container -->
    <div
      class="h-[500px] w-full overflow-hidden rounded-xl border border-gray-300 shadow-lg dark:border-gray-600"
    >
      <PDFViewer
        @init="handleInit"
        @ready="handleReady"
        :config="{
          src: 'https://snippet.embedpdf.com/ebook.pdf',
          theme: { preference: themePreference },
        }"
        :style="{ width: '100%', height: '100%' }"
      />
    </div>
  </div>
</template>
