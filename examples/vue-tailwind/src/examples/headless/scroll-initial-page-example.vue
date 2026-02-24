<script setup lang="ts">
import { ref } from 'vue';
import { usePdfiumEngine } from '@embedpdf/engines/vue';
import { EmbedPDF } from '@embedpdf/core/vue';
import { createPluginRegistration } from '@embedpdf/core';
import {
  DocumentManagerPluginPackage,
  DocumentContent,
} from '@embedpdf/plugin-document-manager/vue';
import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/vue';
import { ScrollPluginPackage } from '@embedpdf/plugin-scroll/vue';
import { RenderPluginPackage } from '@embedpdf/plugin-render/vue';
import ScrollInitialPageExampleContent from './scroll-initial-page-example-content.vue';
import { Play } from 'lucide-vue-next';

// The page to scroll to when the document loads
const INITIAL_PAGE = 3;

const { engine, isLoading } = usePdfiumEngine();
const showViewer = ref(false);

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
];
</script>

<template>
  <!-- Initial state: Button to load the viewer -->
  <div
    v-if="!showViewer"
    class="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
  >
    <div class="flex h-[400px] flex-col items-center justify-center gap-4">
      <p class="text-center text-sm text-gray-600 dark:text-gray-400">
        Click the button below to load the PDF viewer.
        <br />
        It will automatically scroll to
        <span class="font-semibold text-blue-600 dark:text-blue-400">page {{ INITIAL_PAGE }}</span>
        on load.
      </p>
      <button
        @click="showViewer = true"
        class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-600"
      >
        <Play :size="16" />
        Load Viewer & Scroll to Page {{ INITIAL_PAGE }}
      </button>
    </div>
  </div>

  <!-- Loading state -->
  <div
    v-else-if="isLoading || !engine"
    class="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
  >
    <div class="flex h-[400px] items-center justify-center">
      <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
        <div class="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
        <span class="text-sm">Loading PDF Engine...</span>
      </div>
    </div>
  </div>

  <!-- Viewer loaded -->
  <EmbedPDF v-else :engine="engine" :plugins="plugins" v-slot="{ activeDocumentId }">
    <DocumentContent v-if="activeDocumentId" :document-id="activeDocumentId" v-slot="{ isLoaded }">
      <ScrollInitialPageExampleContent
        v-if="isLoaded"
        :document-id="activeDocumentId"
        :initial-page="INITIAL_PAGE"
      />
    </DocumentContent>
  </EmbedPDF>
</template>
