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
import { ZoomMode, ZoomPluginPackage } from '@embedpdf/plugin-zoom/vue';
import { createAiRuntime } from '@embedpdf/ai/web';
import { AiManagerPluginPackage } from '@embedpdf/plugin-ai-manager/vue';
import { LayoutAnalysisPluginPackage } from '@embedpdf/plugin-layout-analysis/vue';
import LayoutAnalysisExampleContent from './layout-analysis-example-content.vue';

const { engine, isLoading } = usePdfiumEngine();

const aiRuntime = createAiRuntime({
  backend: 'auto',
  cache: true,
});

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://arxiv.org/pdf/1706.03762' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(ZoomPluginPackage, {
    defaultZoomLevel: ZoomMode.FitPage,
  }),
  createPluginRegistration(AiManagerPluginPackage, {
    runtime: aiRuntime,
  }),
  createPluginRegistration(LayoutAnalysisPluginPackage, {
    layoutThreshold: 0.35,
    tableStructureThreshold: 0.8,
    tableStructure: false,
  }),
];
</script>

<template>
  <div v-if="isLoading || !engine" class="flex h-[400px] items-center justify-center">
    <span class="text-sm text-gray-500 dark:text-gray-400">Loading PDF Engine...</span>
  </div>
  <EmbedPDF v-else :engine="engine" :plugins="plugins" v-slot="{ activeDocumentId }">
    <DocumentContent v-if="activeDocumentId" :document-id="activeDocumentId" v-slot="{ isLoaded }">
      <LayoutAnalysisExampleContent v-if="isLoaded" :document-id="activeDocumentId" />
    </DocumentContent>
  </EmbedPDF>
</template>
