<script lang="ts">
  import { usePdfiumEngine } from '@embedpdf/engines/svelte';
  import { EmbedPDF } from '@embedpdf/core/svelte';
  import { createPluginRegistration } from '@embedpdf/core';
  import {
    DocumentManagerPluginPackage,
    DocumentContent,
  } from '@embedpdf/plugin-document-manager/svelte';
  import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/svelte';
  import { ScrollPluginPackage } from '@embedpdf/plugin-scroll/svelte';
  import { RenderPluginPackage } from '@embedpdf/plugin-render/svelte';
  import { PrintPluginPackage } from '@embedpdf/plugin-print/svelte';
  import PrintExampleContent from './print-example-content.svelte';

  const pdfEngine = usePdfiumEngine();

  const plugins = [
    createPluginRegistration(DocumentManagerPluginPackage, {
      initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
    }),
    createPluginRegistration(ViewportPluginPackage),
    createPluginRegistration(ScrollPluginPackage),
    createPluginRegistration(RenderPluginPackage),
    createPluginRegistration(PrintPluginPackage),
  ];
</script>

{#if pdfEngine.isLoading || !pdfEngine.engine}
  <div>Loading PDF Engine...</div>
{:else}
  <EmbedPDF engine={pdfEngine.engine} {plugins}>
    {#snippet children({ activeDocumentId })}
      {#if activeDocumentId}
        <DocumentContent documentId={activeDocumentId}>
          {#snippet children(documentContent)}
            {#if documentContent.isLoaded}
              <PrintExampleContent documentId={activeDocumentId} />
            {/if}
          {/snippet}
        </DocumentContent>
      {/if}
    {/snippet}
  </EmbedPDF>
{/if}
