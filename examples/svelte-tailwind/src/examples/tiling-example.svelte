<script lang="ts">
  import { usePdfiumEngine } from '@embedpdf/engines/svelte';
  import { EmbedPDF } from '@embedpdf/core/svelte';
  import { createPluginRegistration, type PluginRegistry } from '@embedpdf/core';
  import {
    DocumentManagerPluginPackage,
    DocumentManagerPlugin,
    DocumentContext,
    DocumentContent,
  } from '@embedpdf/plugin-document-manager/svelte';
  import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/svelte';
  import { ScrollPluginPackage } from '@embedpdf/plugin-scroll/svelte';
  import { RenderPluginPackage } from '@embedpdf/plugin-render/svelte';
  import { ZoomPluginPackage, ZoomMode } from '@embedpdf/plugin-zoom/svelte';
  import { TilingPluginPackage } from '@embedpdf/plugin-tiling/svelte';
  import TilingExampleContent from './tiling-example-content.svelte';

  const pdfEngine = usePdfiumEngine();

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

{#if pdfEngine.isLoading || !pdfEngine.engine}
  <div>Loading PDF Engine...</div>
{:else}
  <EmbedPDF engine={pdfEngine.engine} {plugins} {onInitialized}>
    <DocumentContext>
      {#snippet children(context)}
        {#if context.activeDocumentId}
          {@const documentId = context.activeDocumentId}
          <DocumentContent {documentId}>
            {#snippet children(documentContent)}
              {#if documentContent.isLoaded}
                <TilingExampleContent {documentId} />
              {/if}
            {/snippet}
          </DocumentContent>
        {/if}
      {/snippet}
    </DocumentContext>
  </EmbedPDF>
{/if}
