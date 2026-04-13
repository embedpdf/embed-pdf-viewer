<script lang="ts">
  import { createPluginRegistration } from '@embedpdf/core';
  import { EmbedPDF } from '@embedpdf/core/svelte';
  import { usePdfiumEngine } from '@embedpdf/engines/svelte';
  import { AnnotationPluginPackage } from '@embedpdf/plugin-annotation/svelte';
  import {
    DocumentContent,
    DocumentManagerPluginPackage,
  } from '@embedpdf/plugin-document-manager/svelte';
  import { HistoryPluginPackage } from '@embedpdf/plugin-history/svelte';
  import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/svelte';
  import { RenderPluginPackage } from '@embedpdf/plugin-render/svelte';
  import { ScrollPluginPackage } from '@embedpdf/plugin-scroll/svelte';
  import { SelectionPluginPackage } from '@embedpdf/plugin-selection/svelte';
  import { StampPluginPackage } from '@embedpdf/plugin-stamp/svelte';
  import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/svelte';
  import { ZoomMode, ZoomPluginPackage } from '@embedpdf/plugin-zoom/svelte';
  import { Loader2 } from 'lucide-svelte';
  import StampExampleContent from './stamp-example-content.svelte';

  const CUSTOM_LIBRARY_ID = 'custom';
  const SIDEBAR_CATEGORY = 'sidebar';

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
    createPluginRegistration(ZoomPluginPackage, {
      defaultZoomLevel: ZoomMode.FitPage,
    }),
    createPluginRegistration(AnnotationPluginPackage, {
      annotationAuthor: 'EmbedPDF User',
    }),
    createPluginRegistration(StampPluginPackage, {
      defaultLibrary: {
        id: CUSTOM_LIBRARY_ID,
        name: 'Custom Stamps',
        categories: ['custom', SIDEBAR_CATEGORY],
      },
    }),
  ];
</script>

{#if pdfEngine.isLoading || !pdfEngine.engine}
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
  >
    <div class="flex h-[420px] items-center justify-center">
      <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 class="h-5 w-5 animate-spin" />
        <span>Loading PDF Engine...</span>
      </div>
    </div>
  </div>
{:else}
  <EmbedPDF engine={pdfEngine.engine} {plugins}>
    {#snippet children({ activeDocumentId })}
      {#if activeDocumentId}
        <DocumentContent documentId={activeDocumentId}>
          {#snippet children(documentContent)}
            {#if documentContent.isLoaded}
              <StampExampleContent documentId={activeDocumentId} />
            {:else}
              <div
                class="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
              >
                <div
                  class="flex h-[420px] items-center justify-center text-sm text-gray-500 dark:text-gray-400"
                >
                  Loading PDF document...
                </div>
              </div>
            {/if}
          {/snippet}
        </DocumentContent>
      {/if}
    {/snippet}
  </EmbedPDF>
{/if}
