<script setup lang="ts">
import { usePdfiumEngine } from '@embedpdf/engines/vue';
import { EmbedPDF } from '@embedpdf/core/vue';
import { createPluginRegistration, PluginRegistry } from '@embedpdf/core';
import {
  DocumentManagerPluginPackage,
  DocumentManagerPlugin,
  DocumentContent,
} from '@embedpdf/plugin-document-manager/vue';
import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/vue';
import { ScrollPluginPackage } from '@embedpdf/plugin-scroll/vue';
import { RenderPluginPackage } from '@embedpdf/plugin-render/vue';
import { ZoomPluginPackage, ZoomMode } from '@embedpdf/plugin-zoom/vue';
import { TilingPluginPackage } from '@embedpdf/plugin-tiling/vue';
import TilingExampleContent from './tiling-example-content.vue';

const { engine, isLoading } = usePdfiumEngine();

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage),
  createPluginRegistration(ViewportPluginPackage),
  createPluginRegistration(ScrollPluginPackage),
  createPluginRegistration(RenderPluginPackage),
  createPluginRegistration(ZoomPluginPackage, { defaultZoomLevel: ZoomMode.FitPage }),
  createPluginRegistration(TilingPluginPackage, { tileSize: 768, overlapPx: 5 }),
];

const onInitialized = async (registry: PluginRegistry) => {
  registry
    .getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
    ?.provides()
    ?.openDocumentUrl({ url: 'https://snippet.embedpdf.com/ebook.pdf' });
};
</script>

<template>
  <div v-if="isLoading || !engine">Loading PDF Engine...</div>
  <EmbedPDF
    v-else
    :engine="engine"
    :plugins="plugins"
    :on-initialized="onInitialized"
    v-slot="{ activeDocumentId }"
  >
    <DocumentContent v-if="activeDocumentId" :document-id="activeDocumentId" v-slot="{ isLoaded }">
      <TilingExampleContent v-if="isLoaded" :document-id="activeDocumentId" />
    </DocumentContent>
  </EmbedPDF>
</template>
