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
  import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/svelte';
  import { CapturePluginPackage } from '@embedpdf/plugin-capture/svelte';
  import CaptureExampleContent from './capture-example-content.svelte';

  const pdfEngine = usePdfiumEngine();

  const plugins = [
    createPluginRegistration(DocumentManagerPluginPackage),
    createPluginRegistration(ViewportPluginPackage),
    createPluginRegistration(ScrollPluginPackage),
    createPluginRegistration(RenderPluginPackage),
    createPluginRegistration(InteractionManagerPluginPackage),
    createPluginRegistration(CapturePluginPackage, { scale: 2.0, imageType: 'image/png' }),
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
                <CaptureExampleContent {documentId} />
              {/if}
            {/snippet}
          </DocumentContent>
        {/if}
      {/snippet}
    </DocumentContext>
  </EmbedPDF>
{/if}
