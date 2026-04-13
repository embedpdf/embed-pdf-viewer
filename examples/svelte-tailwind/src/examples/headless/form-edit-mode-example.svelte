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
  import { HistoryPluginPackage } from '@embedpdf/plugin-history/svelte';
  import { AnnotationPluginPackage, LockModeType } from '@embedpdf/plugin-annotation/svelte';
  import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/svelte';
  import { SelectionPluginPackage } from '@embedpdf/plugin-selection/svelte';
  import { ZoomPluginPackage, ZoomMode } from '@embedpdf/plugin-zoom/svelte';
  import { FormPluginPackage } from '@embedpdf/plugin-form/svelte';
  import FormEditModeExampleContent from './form-edit-mode-example-content.svelte';

  const pdfEngine = usePdfiumEngine();

  const plugins = [
    createPluginRegistration(DocumentManagerPluginPackage, {
      initialDocuments: [{ url: '/form.pdf' }],
    }),
    createPluginRegistration(ViewportPluginPackage),
    createPluginRegistration(ScrollPluginPackage),
    createPluginRegistration(RenderPluginPackage),
    createPluginRegistration(ZoomPluginPackage, {
      defaultZoomLevel: ZoomMode.FitPage,
    }),
    createPluginRegistration(InteractionManagerPluginPackage),
    createPluginRegistration(SelectionPluginPackage),
    createPluginRegistration(HistoryPluginPackage),
    createPluginRegistration(AnnotationPluginPackage, {
      locked: { type: LockModeType.Include, categories: ['form'] },
    }),
    createPluginRegistration(FormPluginPackage),
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
              <FormEditModeExampleContent documentId={activeDocumentId} />
            {/if}
          {/snippet}
        </DocumentContent>
      {/if}
    {/snippet}
  </EmbedPDF>
{/if}
