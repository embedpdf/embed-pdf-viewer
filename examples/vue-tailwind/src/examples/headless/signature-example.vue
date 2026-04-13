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
import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/vue';
import { SelectionPluginPackage } from '@embedpdf/plugin-selection/vue';
import { HistoryPluginPackage } from '@embedpdf/plugin-history/vue';
import { AnnotationPluginPackage } from '@embedpdf/plugin-annotation/vue';
import { SignaturePluginPackage, SignatureMode } from '@embedpdf/plugin-signature/vue';
import { ZoomPluginPackage, ZoomMode } from '@embedpdf/plugin-zoom/vue';
import { Loader2 } from 'lucide-vue-next';
import SignatureExampleContent from './signature-example-content.vue';

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
  createPluginRegistration(AnnotationPluginPackage),
  createPluginRegistration(ZoomPluginPackage, {
    defaultZoomLevel: ZoomMode.FitPage,
  }),
  createPluginRegistration(SignaturePluginPackage, {
    mode: SignatureMode.SignatureOnly,
    defaultSize: { width: 150, height: 50 },
  }),
];
</script>

<template>
  <div
    v-if="isLoading || !engine"
    class="flex h-[500px] items-center justify-center rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
  >
    <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
      <Loader2 :size="20" class="animate-spin" />
      <span class="text-sm">Loading PDF Engine...</span>
    </div>
  </div>
  <EmbedPDF v-else :engine="engine" :plugins="plugins" v-slot="{ activeDocumentId }">
    <DocumentContent v-if="activeDocumentId" :document-id="activeDocumentId" v-slot="{ isLoaded }">
      <SignatureExampleContent v-if="isLoaded" :document-id="activeDocumentId" />
    </DocumentContent>
  </EmbedPDF>
</template>
