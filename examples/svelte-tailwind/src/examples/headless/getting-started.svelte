<script lang="ts">
  import { usePdfiumEngine } from '@embedpdf/engines/svelte';
  import { EmbedPDF } from '@embedpdf/core/svelte';
  import { createPluginRegistration } from '@embedpdf/core';

  // Import the essential plugins and their components
  import { ViewportPluginPackage, Viewport } from '@embedpdf/plugin-viewport/svelte';
  import {
    Scroller,
    ScrollPluginPackage,
    type RenderPageProps,
  } from '@embedpdf/plugin-scroll/svelte';
  import {
    DocumentManagerPluginPackage,
    DocumentContent,
  } from '@embedpdf/plugin-document-manager/svelte';
  import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/svelte';
  import { Loader2 } from 'lucide-svelte';

  // 1. Initialize the engine with the Svelte store
  const pdfEngine = usePdfiumEngine();

  // 2. Register the plugins you need
  const plugins = [
    createPluginRegistration(DocumentManagerPluginPackage, {
      initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
    }),
    createPluginRegistration(ViewportPluginPackage),
    createPluginRegistration(ScrollPluginPackage),
    createPluginRegistration(RenderPluginPackage),
  ];
</script>

{#if pdfEngine.isLoading || !pdfEngine.engine}
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
  >
    <div class="flex h-[400px] items-center justify-center sm:h-[500px]">
      <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
        <Loader2 size={20} class="animate-spin" />
        <span class="text-sm">Loading PDF Engine...</span>
      </div>
    </div>
  </div>
{:else}
  <!-- 3. Wrap your UI with the <EmbedPDF> provider -->
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
  >
    <div class="h-[400px] sm:h-[500px]">
      <EmbedPDF engine={pdfEngine.engine} {plugins}>
        {#snippet children({ activeDocumentId })}
          {#if activeDocumentId}
            {@const documentId = activeDocumentId}
            <DocumentContent {documentId}>
              {#snippet children(documentContent)}
                {#if documentContent.isLoading}
                  <div class="flex h-full items-center justify-center bg-gray-200 dark:bg-gray-800">
                    <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                      <Loader2 size={20} class="animate-spin" />
                      <span class="text-sm">Loading document...</span>
                    </div>
                  </div>
                {:else if documentContent.isLoaded}
                  {#snippet renderPage(page: RenderPageProps)}
                    <div
                      style:width="{page.width}px"
                      style:height="{page.height}px"
                      style:position="relative"
                    >
                      <!-- The RenderLayer is responsible for drawing the page -->
                      <RenderLayer {documentId} pageIndex={page.pageIndex} />
                    </div>
                  {/snippet}
                  <Viewport {documentId} class="h-full bg-gray-200 dark:bg-gray-800">
                    <Scroller {documentId} {renderPage} />
                  </Viewport>
                {/if}
              {/snippet}
            </DocumentContent>
          {/if}
        {/snippet}
      </EmbedPDF>
    </div>
  </div>
{/if}
