<script setup lang="ts">
import { usePdfiumEngine } from '@embedpdf/engines/vue';
import { EmbedPDF } from '@embedpdf/core/vue';
import { createPluginRegistration } from '@embedpdf/core';
import {
  DocumentManagerPluginPackage,
  DocumentManagerPlugin,
  DocumentContext,
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
import AnnotationExampleContent from './annotation-example-content.vue';
import { PdfAnnotationSubtype, PdfStampAnnoObject } from '@embedpdf/models';

const { engine, isLoading } = usePdfiumEngine();

const plugins = [
  createPluginRegistration(DocumentManagerPluginPackage),
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
    id: 'stampCheckmark',
    name: 'Checkmark',
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
    },
    matchScore: () => 0,
    defaults: {
      type: PdfAnnotationSubtype.STAMP,
      imageSrc: '/circle-checkmark.png',
      imageSize: { width: 30, height: 30 },
    },
  });

  annotation?.addTool<AnnotationTool<PdfStampAnnoObject>>({
    id: 'stampCross',
    name: 'Cross',
    interaction: {
      exclusive: false,
      cursor: 'crosshair',
    },
    matchScore: () => 0,
    defaults: {
      type: PdfAnnotationSubtype.STAMP,
      imageSrc: '/circle-cross.png',
      imageSize: { width: 30, height: 30 },
    },
  });

  registry
    .getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
    ?.provides()
    ?.openDocumentUrl({ url: 'https://snippet.embedpdf.com/ebook.pdf' });
};
</script>

<template>
  <div v-if="isLoading || !engine">Loading PDF Engine...</div>
  <EmbedPDF v-else :engine="engine" :plugins="plugins" :on-initialized="handleInitialized">
    <DocumentContext v-slot="{ activeDocumentId }">
      <DocumentContent
        v-if="activeDocumentId"
        :document-id="activeDocumentId"
        v-slot="{ isLoaded }"
      >
        <AnnotationExampleContent v-if="isLoaded" :document-id="activeDocumentId" />
      </DocumentContent>
    </DocumentContext>
  </EmbedPDF>
</template>
