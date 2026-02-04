<script setup lang="ts">
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
import { TilingPluginPackage } from '@embedpdf/plugin-tiling/vue';
import { ZoomPluginPackage, ZoomMode } from '@embedpdf/plugin-zoom/vue';
import { Loader2 } from 'lucide-vue-next';
import DocumentManagerExampleContent from './document-manager-example-content.vue';

const { engine, isLoading } = usePdfiumEngine();

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [
      { url: 'https://snippet.embedpdf.com/ebook.pdf' },
      { url: 'https://snippet.embedpdf.com/ebook.pdf', autoActivate: false },
    ],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(TilingPluginPackage),
  createPluginRegistration(ZoomPluginPackage, {
    defaultZoomLevel: ZoomMode.FitPage,
  }),
];
</script>

<template>
  <div
    v-if="isLoading || !engine"
    class="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
  >
    <div class="flex h-[400px] items-center justify-center">
      <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
        <Loader2 :size="20" class="animate-spin" />
        <span class="text-sm">Loading PDF Engine...</span>
      </div>
    </div>
  </div>
  <EmbedPDF v-else :engine="engine" :plugins="plugins" v-slot="{ pluginsReady, activeDocumentId }">
    <div
      v-if="pluginsReady"
      class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
    >
      <DocumentManagerExampleContent :active-document-id="activeDocumentId" />
    </div>
    <div
      v-else
      class="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
    >
      <div class="flex h-[400px] items-center justify-center">
        <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <Loader2 :size="20" class="animate-spin" />
          <span class="text-sm">Initializing plugins...</span>
        </div>
      </div>
    </div>
  </EmbedPDF>
</template>
