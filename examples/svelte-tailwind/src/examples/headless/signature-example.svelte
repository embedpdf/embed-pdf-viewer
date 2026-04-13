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
  import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/svelte';
  import { SelectionPluginPackage } from '@embedpdf/plugin-selection/svelte';
  import { HistoryPluginPackage } from '@embedpdf/plugin-history/svelte';
  import { AnnotationPluginPackage } from '@embedpdf/plugin-annotation/svelte';
  import { SignaturePluginPackage, SignatureMode } from '@embedpdf/plugin-signature/svelte';
  import { ZoomMode, ZoomPluginPackage } from '@embedpdf/plugin-zoom/svelte';
  import { Loader2 } from 'lucide-svelte';
  import SignatureExampleContent from './signature-example-content.svelte';

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
    createPluginRegistration(AnnotationPluginPackage),
    createPluginRegistration(ZoomPluginPackage, {
      defaultZoomLevel: ZoomMode.FitPage,
    }),
    createPluginRegistration(SignaturePluginPackage, {
      mode: SignatureMode.SignatureOnly,
      defaultSize: { width: 150, height: 50 },
    }),
  ];
</script>

{#if pdfEngine.isLoading || !pdfEngine.engine}
  <div
    class="flex h-[500px] items-center justify-center rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
  >
    <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
      <Loader2 size={20} class="animate-spin" />
      <span class="text-sm">Loading PDF Engine...</span>
    </div>
  </div>
{:else}
  <EmbedPDF engine={pdfEngine.engine} {plugins}>
    {#snippet children({ activeDocumentId })}
      {#if activeDocumentId}
        <DocumentContent documentId={activeDocumentId}>
          {#snippet children(documentContent)}
            {#if documentContent.isLoaded}
              <SignatureExampleContent documentId={activeDocumentId} />
            {/if}
          {/snippet}
        </DocumentContent>
      {/if}
    {/snippet}
  </EmbedPDF>
{/if}
