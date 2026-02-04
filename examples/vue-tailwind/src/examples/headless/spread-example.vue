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
import { SpreadPluginPackage, SpreadMode } from '@embedpdf/plugin-spread/vue';
import { ZoomMode, ZoomPluginPackage } from '@embedpdf/plugin-zoom/vue';
import SpreadExampleContent from './spread-example-content.vue';

const { engine, isLoading } = usePdfiumEngine();

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage, {
    initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
  }),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(ZoomPluginPackage, { defaultZoomLevel: ZoomMode.FitPage }),
  createPluginRegistration(SpreadPluginPackage, { defaultSpreadMode: SpreadMode.None }),
];
</script>

<template>
  <div v-if="isLoading || !engine">Loading PDF Engine...</div>
  <EmbedPDF v-else :engine="engine" :plugins="plugins" v-slot="{ activeDocumentId }">
    <DocumentContent v-if="activeDocumentId" :document-id="activeDocumentId" v-slot="{ isLoaded }">
      <SpreadExampleContent v-if="isLoaded" :document-id="activeDocumentId" />
    </DocumentContent>
  </EmbedPDF>
</template>
