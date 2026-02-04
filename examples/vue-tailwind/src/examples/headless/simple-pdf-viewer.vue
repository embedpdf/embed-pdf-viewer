<script setup lang="ts">
import { usePdfiumEngine } from '@embedpdf/engines/vue';
import { EmbedPDF } from '@embedpdf/core/vue';
import { createPluginRegistration } from '@embedpdf/core';
import {
  DocumentManagerPluginPackage,
  DocumentContent,
} from '@embedpdf/plugin-document-manager/vue';
import { ViewportPluginPackage, Viewport } from '@embedpdf/plugin-viewport/vue';
import { ScrollPluginPackage, Scroller } from '@embedpdf/plugin-scroll/vue';
import { RenderPluginPackage, RenderLayer } from '@embedpdf/plugin-render/vue';
import { Loader2 } from 'lucide-vue-next';

// 1. Initialize the engine with the Vue composable
const { engine, isLoading } = usePdfiumEngine();

// 2. Register the plugins you need
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

  <!-- 3. Wrap your UI with the <EmbedPDF> provider -->
  <div v-else style="height: 500px; margin-top: 10px">
    <EmbedPDF :engine="engine" :plugins="plugins" v-slot="{ activeDocumentId }">
      <DocumentContent
        v-if="activeDocumentId"
        :document-id="activeDocumentId"
        v-slot="{ isLoaded }"
      >
        <Viewport
          v-if="isLoaded"
          :document-id="activeDocumentId"
          class="bg-gray-200 dark:bg-gray-800"
        >
          <Scroller :document-id="activeDocumentId">
            <template #default="{ page }">
              <div :style="{ width: page.width + 'px', height: page.height + 'px' }">
                <!-- The RenderLayer is responsible for drawing the page -->
                <RenderLayer :document-id="activeDocumentId" :page-index="page.pageIndex" />
              </div>
            </template>
          </Scroller>
        </Viewport>
      </DocumentContent>
    </EmbedPDF>
  </div>
</template>
