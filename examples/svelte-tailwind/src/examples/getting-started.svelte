<script lang="ts">
  import { usePdfiumEngine } from '@embedpdf/engines/svelte';
  import { EmbedPDF } from '@embedpdf/core/svelte';
  import { createPluginRegistration, type PluginRegistry } from '@embedpdf/core';

  // Import the essential plugins and their components
  import { ViewportPluginPackage, Viewport } from '@embedpdf/plugin-viewport/svelte';
  import {
    Scroller,
    ScrollPluginPackage,
    type RenderPageProps,
  } from '@embedpdf/plugin-scroll/svelte';
  import {
    DocumentManagerPluginPackage,
    DocumentManagerPlugin,
    DocumentContext,
    DocumentContent,
  } from '@embedpdf/plugin-document-manager/svelte';
  import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/svelte';

  // 1. Initialize the engine with the Svelte store
  const pdfEngine = usePdfiumEngine();

  // 2. Register the plugins you need
  const plugins = [
    createPluginRegistration(DocumentManagerPluginPackage),
    createPluginRegistration(ViewportPluginPackage),
    createPluginRegistration(ScrollPluginPackage),
    createPluginRegistration(RenderPluginPackage),
  ];

  // 3. Load the document when the plugins are initialized
  const onInitialized = async (registry: PluginRegistry) => {
    registry
      .getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
      ?.provides()
      ?.openDocumentUrl({ url: 'https://snippet.embedpdf.com/ebook.pdf' });
  };
</script>

<div style="height: 500px; border: 1px solid black; margin-top: 10px;">
  {#if pdfEngine.isLoading || !pdfEngine.engine}
    <div style="display: flex; justify-content: center; align-items: center; height: 100%;">
      Loading PDF Engine...
    </div>
  {:else}
    <EmbedPDF engine={pdfEngine.engine} {plugins} {onInitialized}>
      <DocumentContext>
        {#snippet children(context)}
          {#if context.activeDocumentId}
            {@const documentId = context.activeDocumentId}
            <DocumentContent {documentId}>
              {#snippet children(documentContent)}
                {#if documentContent.isLoaded}
                  {#snippet renderPage(page: RenderPageProps)}
                    <div
                      style:width="{page.width}px"
                      style:height="{page.height}px"
                      style:position="relative"
                    >
                      <RenderLayer {documentId} pageIndex={page.pageIndex} />
                    </div>
                  {/snippet}
                  <Viewport {documentId} style="background-color: #f1f3f5;">
                    <Scroller {documentId} {renderPage} />
                  </Viewport>
                {/if}
              {/snippet}
            </DocumentContent>
          {/if}
        {/snippet}
      </DocumentContext>
    </EmbedPDF>
  {/if}
</div>
