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
import {
  AnnotationPlugin,
  AnnotationPluginPackage,
  AnnotationTool,
} from '@embedpdf/plugin-annotation/vue';
import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/vue';
import { SelectionPluginPackage } from '@embedpdf/plugin-selection/vue';
import { HistoryPluginPackage } from '@embedpdf/plugin-history/vue';
import type { PluginRegistry } from '@embedpdf/core';
import AnnotationCustomUIContent from './annotation-custom-ui-example-content.vue';
import { PdfAnnotationSubtype, PdfStampAnnoObject } from '@embedpdf/models';

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
  createPluginRegistration(AnnotationPluginPackage, {
    annotationAuthor: 'EmbedPDF User',
  }),
];

const handleInitialized = async (registry: PluginRegistry) => {
  const annotation = registry.getPlugin<AnnotationPlugin>('annotation')?.provides();

  annotation?.addTool<AnnotationTool<PdfStampAnnoObject>>({
    id: 'stampImage',
    name: 'Image Stamp',
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
    },
    matchScore: () => 0,
    defaults: {
      type: PdfAnnotationSubtype.STAMP,
      imageSrc: '/circle-checkmark.png',
      imageSize: { width: 40, height: 40 },
    },
  });
};
</script>

<template>
  <div v-if="isLoading || !engine">Loading PDF Engine...</div>
  <EmbedPDF
    v-else
    :engine="engine"
    :plugins="plugins"
    :on-initialized="handleInitialized"
    v-slot="{ activeDocumentId }"
  >
    <DocumentContent v-if="activeDocumentId" :document-id="activeDocumentId" v-slot="{ isLoaded }">
      <AnnotationCustomUIContent v-if="isLoaded" :document-id="activeDocumentId" />
    </DocumentContent>
  </EmbedPDF>
</template>
