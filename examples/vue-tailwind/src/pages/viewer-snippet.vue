<template>
  <div class="flex h-screen flex-col bg-slate-900">
    <!-- Header -->
    <header
      class="flex items-center justify-between border-b border-slate-700 bg-slate-800 px-4 py-3"
    >
      <div class="flex items-center gap-4">
        <a
          href="#/"
          class="flex items-center gap-2 text-slate-300 transition-colors hover:text-white"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          <span class="text-sm font-medium">Back</span>
        </a>
        <div class="h-6 w-px bg-slate-600"></div>
        <h1 class="text-lg font-semibold text-white">Snippet PDF Viewer</h1>
      </div>
      <div class="flex items-center gap-2">
        <span class="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-400">
          @embedpdf/vue-pdf-viewer
        </span>
      </div>
    </header>

    <!-- Viewer Container -->
    <div class="flex-1 overflow-hidden">
      <PDFViewer
        ref="viewerRef"
        :config="viewerConfig"
        class="h-full w-full"
        @init="handleInit"
        @ready="handleReady"
      />
    </div>

    <!-- Footer Info -->
    <footer class="border-t border-slate-700 bg-slate-800 px-4 py-2">
      <div class="flex items-center justify-between text-xs text-slate-400">
        <span>
          This viewer uses the
          <code class="rounded bg-slate-700 px-1.5 py-0.5 font-mono text-emerald-400"
            >PDFViewer</code
          >
          snippet component - the simplest way to embed a PDF viewer.
        </span>
        <span v-if="isReady" class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full bg-emerald-500"></span>
          Ready
        </span>
        <span v-else class="flex items-center gap-1.5">
          <span class="h-2 w-2 animate-pulse rounded-full bg-amber-500"></span>
          Loading...
        </span>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  PDFViewer,
  type PDFViewerConfig,
  type PluginRegistry,
  type EmbedPdfContainer,
} from '@embedpdf/vue-pdf-viewer';

/**
 * Snippet Viewer Page
 *
 * This is the simplest way to embed a PDF viewer in your Vue application.
 * The PDFViewer component from @embedpdf/vue-pdf-viewer handles all the
 * complexity of setting up the engine, plugins, and UI.
 *
 * Just provide a config object and you're done!
 */

const viewerRef = ref<InstanceType<typeof PDFViewer> | null>(null);
const isReady = ref(false);

const viewerConfig: PDFViewerConfig = {
  src: 'https://snippet.embedpdf.com/ebook.pdf',
  theme: {
    preference: 'dark',
  },
};

const handleInit = (container: EmbedPdfContainer) => {
  console.log('PDF Viewer initialized', container);
};

const handleReady = (registry: PluginRegistry) => {
  console.log('PDF Viewer ready with registry', registry);
  isReady.value = true;
};
</script>
