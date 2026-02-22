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
  import { ZoomMode, ZoomPluginPackage } from '@embedpdf/plugin-zoom/svelte';
  import { createAiRuntime } from '@embedpdf/ai/web';
  import { AiManagerPluginPackage } from '@embedpdf/plugin-ai-manager/svelte';
  import { LayoutAnalysisPluginPackage } from '@embedpdf/plugin-layout-analysis/svelte';
  import LayoutAnalysisExampleContent from './layout-analysis-example-content.svelte';

  const pdfEngine = usePdfiumEngine();

  const aiRuntime = createAiRuntime({
    backend: 'auto',
    cache: true,
  });

  const plugins = [
    createPluginRegistration(DocumentManagerPluginPackage, {
      initialDocuments: [{ url: 'https://arxiv.org/pdf/1706.03762' }],
    }),
    createPluginRegistration(ViewportPluginPackage),
    createPluginRegistration(ScrollPluginPackage),
    createPluginRegistration(RenderPluginPackage),
    createPluginRegistration(ZoomPluginPackage, {
      defaultZoomLevel: ZoomMode.FitPage,
    }),
    createPluginRegistration(AiManagerPluginPackage, {
      runtime: aiRuntime,
    }),
    createPluginRegistration(LayoutAnalysisPluginPackage, {
      layoutThreshold: 0.35,
      tableStructureThreshold: 0.8,
      tableStructure: false,
    }),
  ];
</script>

{#if pdfEngine.isLoading || !pdfEngine.engine}
  <div class="flex h-[400px] items-center justify-center">
    <span class="text-sm text-gray-500 dark:text-gray-400">Loading PDF Engine...</span>
  </div>
{:else}
  <EmbedPDF engine={pdfEngine.engine} {plugins}>
    {#snippet children({ activeDocumentId })}
      {#if activeDocumentId}
        <DocumentContent documentId={activeDocumentId}>
          {#snippet children(documentContent)}
            {#if documentContent.isLoaded}
              <LayoutAnalysisExampleContent documentId={activeDocumentId} />
            {/if}
          {/snippet}
        </DocumentContent>
      {/if}
    {/snippet}
  </EmbedPDF>
{/if}
