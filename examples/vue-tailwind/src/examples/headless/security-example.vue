<script setup lang="ts">
import { usePdfiumEngine } from '@embedpdf/engines/vue';
import { EmbedPDF } from '@embedpdf/core/vue';
import { createPluginRegistration } from '@embedpdf/core';
import { DocumentManagerPluginPackage } from '@embedpdf/plugin-document-manager/vue';
import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/vue';
import { ScrollPluginPackage } from '@embedpdf/plugin-scroll/vue';
import { RenderPluginPackage } from '@embedpdf/plugin-render/vue';
import { ZoomPluginPackage, ZoomMode } from '@embedpdf/plugin-zoom/vue';
import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/vue';
import { PrintPluginPackage } from '@embedpdf/plugin-print/vue';
import { SelectionPluginPackage } from '@embedpdf/plugin-selection/vue';
import { Loader2 } from 'lucide-vue-next';
import SecurityExampleContent from './security-example-content.vue';

const { engine, isLoading } = usePdfiumEngine();

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [
      // Document 1: Full Access - ignores all PDF restrictions
      {
        url: 'https://snippet.embedpdf.com/ebook.pdf',
        name: 'Full Access',
        permissions: {
          enforceDocumentPermissions: false,
        },
      },
      // Document 2: Print Disabled - only printing is blocked
      {
        url: 'https://snippet.embedpdf.com/ebook.pdf',
        name: 'Print Disabled',
        autoActivate: false,
        permissions: {
          enforceDocumentPermissions: false,
          overrides: {
            print: false,
            printHighQuality: false,
          },
        },
      },
      // Document 3: Read-Only - most actions blocked
      {
        url: 'https://snippet.embedpdf.com/ebook.pdf',
        name: 'Read-Only',
        autoActivate: false,
        permissions: {
          enforceDocumentPermissions: false,
          overrides: {
            print: false,
            printHighQuality: false,
            copyContents: false,
            modifyContents: false,
            modifyAnnotations: false,
          },
        },
      },
    ],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(ZoomPluginPackage, {
    defaultZoomLevel: ZoomMode.FitPage,
  }),
  createPluginRegistration(InteractionManagerPluginPackage),
  createPluginRegistration(PrintPluginPackage),
  createPluginRegistration(SelectionPluginPackage),
];
</script>

<template>
  <div
    v-if="isLoading || !engine"
    class="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
  >
    <div class="flex h-[500px] items-center justify-center">
      <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
        <Loader2 :size="20" class="animate-spin" />
        <span class="text-sm">Loading PDF Engine...</span>
      </div>
    </div>
  </div>
  <EmbedPDF v-else :engine="engine" :plugins="plugins" v-slot="{ pluginsReady, activeDocumentId }">
    <SecurityExampleContent v-if="pluginsReady" :active-document-id="activeDocumentId" />
    <div v-else class="flex h-[500px] items-center justify-center">
      <Loader2 :size="20" class="animate-spin text-gray-400" />
    </div>
  </EmbedPDF>
</template>
