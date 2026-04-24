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
  import { TilingPluginPackage } from '@embedpdf/plugin-tiling/svelte';
  import { ZoomPluginPackage, ZoomMode } from '@embedpdf/plugin-zoom/svelte';
  import { RotatePluginPackage } from '@embedpdf/plugin-rotate/svelte';
  import {
    type AnnotationPlugin,
    AnnotationPluginPackage,
  } from '@embedpdf/plugin-annotation/svelte';
  import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/svelte';
  import { SelectionPluginPackage } from '@embedpdf/plugin-selection/svelte';
  import { HistoryPluginPackage } from '@embedpdf/plugin-history/svelte';
  import { Rotation } from '@embedpdf/models';
  import { Loader2 } from 'lucide-svelte';
  import AnnotationFlagsExampleContent from './annotation-flags-example-content.svelte';
  import { DEMO_ANNOTATIONS } from './annotation-flags-example-seeds';

  const pdfEngine = usePdfiumEngine();

  const plugins = [
    createPluginRegistration(DocumentManagerPluginPackage, {
      initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
    }),
    createPluginRegistration(ViewportPluginPackage),
    createPluginRegistration(ScrollPluginPackage),
    createPluginRegistration(RenderPluginPackage),
    createPluginRegistration(TilingPluginPackage),
    createPluginRegistration(InteractionManagerPluginPackage),
    createPluginRegistration(SelectionPluginPackage),
    createPluginRegistration(HistoryPluginPackage),
    createPluginRegistration(ZoomPluginPackage, {
      defaultZoomLevel: ZoomMode.FitPage,
    }),
    createPluginRegistration(RotatePluginPackage, {
      defaultRotation: Rotation.Degree0,
    }),
    createPluginRegistration(AnnotationPluginPackage, {
      annotationAuthor: 'EmbedPDF User',
    }),
  ];

  const handleInitialized = async (registry: PluginRegistry) => {
    const annotation = registry.getPlugin<AnnotationPlugin>('annotation')?.provides();
    if (!annotation) return;

    annotation.importAnnotations(
      DEMO_ANNOTATIONS.map(({ id, seed }) => ({ annotation: { ...seed, id } })),
    );
  };
</script>

{#if pdfEngine.isLoading || !pdfEngine.engine}
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
  >
    <div class="flex h-[400px] items-center justify-center">
      <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
        <Loader2 size={20} class="animate-spin" />
        <span class="text-sm">Loading PDF Engine...</span>
      </div>
    </div>
  </div>
{:else}
  <EmbedPDF engine={pdfEngine.engine} {plugins} onInitialized={handleInitialized}>
    {#snippet children({ activeDocumentId })}
      {#if activeDocumentId}
        <DocumentContent documentId={activeDocumentId}>
          {#snippet children(documentContent)}
            {#if documentContent.isLoaded}
              <AnnotationFlagsExampleContent documentId={activeDocumentId} />
            {/if}
          {/snippet}
        </DocumentContent>
      {/if}
    {/snippet}
  </EmbedPDF>
{/if}
