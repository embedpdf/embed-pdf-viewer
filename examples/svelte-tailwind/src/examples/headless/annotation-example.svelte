<script lang="ts">
  import { usePdfiumEngine } from '@embedpdf/engines/svelte';
  import { EmbedPDF } from '@embedpdf/core/svelte';
  import { createPluginRegistration, type PluginRegistry } from '@embedpdf/core';
  import {
    DocumentManagerPluginPackage,
    DocumentContent,
  } from '@embedpdf/plugin-document-manager/svelte';
  import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/svelte';
  import { ScrollPluginPackage } from '@embedpdf/plugin-scroll/svelte';
  import { RenderPluginPackage } from '@embedpdf/plugin-render/svelte';
  import {
    type AnnotationPlugin,
    AnnotationPluginPackage,
    type AnnotationTool,
  } from '@embedpdf/plugin-annotation/svelte';
  import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/svelte';
  import { SelectionPluginPackage } from '@embedpdf/plugin-selection/svelte';
  import { HistoryPluginPackage } from '@embedpdf/plugin-history/svelte';
  import { PdfAnnotationSubtype, type PdfStampAnnoObject } from '@embedpdf/models';
  import AnnotationExampleContent from './annotation-example-content.svelte';

  const pdfEngine = usePdfiumEngine();

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
  };
</script>

{#if pdfEngine.isLoading || !pdfEngine.engine}
  <div>Loading PDF Engine...</div>
{:else}
  <EmbedPDF engine={pdfEngine.engine} {plugins} onInitialized={handleInitialized}>
    {#snippet children({ activeDocumentId })}
      {#if activeDocumentId}
        <DocumentContent documentId={activeDocumentId}>
          {#snippet children(documentContent)}
            {#if documentContent.isLoaded}
              <AnnotationExampleContent documentId={activeDocumentId} />
            {/if}
          {/snippet}
        </DocumentContent>
      {/if}
    {/snippet}
  </EmbedPDF>
{/if}
