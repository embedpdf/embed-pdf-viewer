<script setup lang="ts">
import { createPluginRegistration } from '@embedpdf/core';
import { EmbedPDF } from '@embedpdf/core/vue';
import { usePdfiumEngine } from '@embedpdf/engines/vue';
import { AnnotationPluginPackage } from '@embedpdf/plugin-annotation/vue';
import {
  DocumentContent,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/vue';
import { HistoryPluginPackage } from '@embedpdf/plugin-history/vue';
import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/vue';
import { RenderPluginPackage } from '@embedpdf/plugin-render/vue';
import { ScrollPluginPackage } from '@embedpdf/plugin-scroll/vue';
import { SelectionPluginPackage } from '@embedpdf/plugin-selection/vue';
import { StampPluginPackage } from '@embedpdf/plugin-stamp/vue';
import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/vue';
import { ZoomMode, ZoomPluginPackage } from '@embedpdf/plugin-zoom/vue';
import { Loader2 } from 'lucide-vue-next';
import StampExampleContent from './stamp-example-content.vue';

const CUSTOM_LIBRARY_ID = 'custom';
const SIDEBAR_CATEGORY = 'sidebar';

const { engine, isLoading } = usePdfiumEngine();

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(InteractionManagerPluginPackage),
  createPluginRegistration(SelectionPluginPackage),
  createPluginRegistration(HistoryPluginPackage),
  createPluginRegistration(ZoomPluginPackage, {
    defaultZoomLevel: ZoomMode.FitPage,
  }),
  createPluginRegistration(AnnotationPluginPackage, {
    annotationAuthor: 'EmbedPDF User',
  }),
  createPluginRegistration(StampPluginPackage, {
    defaultLibrary: {
      id: CUSTOM_LIBRARY_ID,
      name: 'Custom Stamps',
      categories: ['custom', SIDEBAR_CATEGORY],
    },
  }),
];
</script>

<template>
  <div
    v-if="isLoading || !engine"
    class="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
  >
    <div class="flex h-[420px] items-center justify-center">
      <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 class="h-5 w-5 animate-spin" />
        <span>Loading PDF Engine...</span>
      </div>
    </div>
  </div>

  <EmbedPDF v-else :engine="engine" :plugins="plugins" v-slot="{ activeDocumentId }">
    <template v-if="activeDocumentId">
      <DocumentContent :document-id="activeDocumentId" v-slot="{ isLoaded }">
        <StampExampleContent v-if="isLoaded" :document-id="activeDocumentId" />
        <div
          v-else
          class="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
        >
          <div
            class="flex h-[420px] items-center justify-center text-sm text-gray-500 dark:text-gray-400"
          >
            Loading PDF document...
          </div>
        </div>
      </DocumentContent>
    </template>
  </EmbedPDF>
</template>
