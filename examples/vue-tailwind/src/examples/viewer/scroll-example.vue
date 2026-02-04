<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import {
  PDFViewer,
  type EmbedPdfContainer,
  type PluginRegistry,
  type ScrollPlugin,
  type ScrollCapability,
} from '@embedpdf/vue-pdf-viewer';
import { ArrowLeft, ArrowRight } from 'lucide-vue-next';

interface Props {
  themePreference?: 'light' | 'dark';
}

const props = withDefaults(defineProps<Props>(), {
  themePreference: 'light',
});

const container = ref<EmbedPdfContainer | null>(null);
const currentPage = ref(1);
const totalPages = ref(1);
const scroll = ref<ScrollCapability | null>(null);
const cleanups: (() => void)[] = [];

const handleInit = (c: EmbedPdfContainer) => {
  container.value = c;
};

const handleReady = (registry: PluginRegistry) => {
  const scrollCapability = registry.getPlugin<ScrollPlugin>('scroll')?.provides();
  if (!scrollCapability) return;

  scroll.value = scrollCapability;

  cleanups.push(
    scrollCapability.onLayoutReady((event) => {
      currentPage.value = event.pageNumber;
      totalPages.value = event.totalPages;
    }),
  );

  cleanups.push(
    scrollCapability.onPageChange((event) => {
      currentPage.value = event.pageNumber;
      totalPages.value = event.totalPages;
    }),
  );
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

const getDoc = () => scroll.value?.forDocument('ebook');
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- External Controls -->
    <div
      class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800"
    >
      <!-- Navigation -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          @click="getDoc()?.scrollToPreviousPage()"
          :disabled="currentPage <= 1"
          class="rounded p-2 hover:bg-gray-200 disabled:opacity-50 dark:hover:bg-gray-700"
        >
          <ArrowLeft :size="20" />
        </button>
        <span class="font-mono text-sm font-medium">
          Page {{ currentPage }} / {{ totalPages }}
        </span>
        <button
          type="button"
          @click="getDoc()?.scrollToNextPage()"
          :disabled="currentPage >= totalPages"
          class="rounded p-2 hover:bg-gray-200 disabled:opacity-50 dark:hover:bg-gray-700"
        >
          <ArrowRight :size="20" />
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
          documentManager: {
            initialDocuments: [
              {
                url: 'https://snippet.embedpdf.com/ebook.pdf',
                documentId: 'ebook',
              },
            ],
          },
          scroll: {
            defaultPageGap: 20,
          },
        }"
        :style="{ width: '100%', height: '100%' }"
      />
    </div>
  </div>
</template>
