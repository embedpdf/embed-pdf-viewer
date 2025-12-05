<script lang="ts">
  import { usePdfiumEngine } from '@embedpdf/engines/svelte';
  import { EmbedPDF } from '@embedpdf/core/svelte';
  import { createPluginRegistration, type PluginRegistry } from '@embedpdf/core';
  import {
    DocumentManagerPluginPackage,
    type DocumentManagerPlugin,
  } from '@embedpdf/plugin-document-manager/svelte';
  import {
    ViewManagerPluginPackage,
    type ViewManagerPlugin,
  } from '@embedpdf/plugin-view-manager/svelte';
  import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/svelte';
  import { ScrollPluginPackage, ScrollStrategy } from '@embedpdf/plugin-scroll/svelte';
  import { RenderPluginPackage } from '@embedpdf/plugin-render/svelte';
  import { ZoomPluginPackage, ZoomMode } from '@embedpdf/plugin-zoom/svelte';
  import { Loader2 } from 'lucide-svelte';
  import ViewManagerExampleContent from './view-manager-example-content.svelte';

  const pdfEngine = usePdfiumEngine();

  const plugins = [
    createPluginRegistration(DocumentManagerPluginPackage),
    createPluginRegistration(ViewManagerPluginPackage, { defaultViewCount: 2 }),
    createPluginRegistration(ViewportPluginPackage),
    createPluginRegistration(ZoomPluginPackage, {
      defaultZoomLevel: ZoomMode.FitPage,
    }),
    createPluginRegistration(ScrollPluginPackage, {
      defaultStrategy: ScrollStrategy.Vertical,
    }),
    createPluginRegistration(RenderPluginPackage),
  ];

  const handleInitialized = async (registry: PluginRegistry) => {
    const docPlugin = registry.getPlugin<DocumentManagerPlugin>('document-manager')?.provides();
    const viewPlugin = registry.getPlugin<ViewManagerPlugin>('view-manager')?.provides();

    if (docPlugin && viewPlugin) {
      const views = viewPlugin.getAllViews();

      // Open first document and add to first view
      const { documentId: doc1 } = await docPlugin
        .openDocumentUrl({ url: 'https://snippet.embedpdf.com/ebook.pdf' })
        .toPromise();

      if (views[0]) {
        viewPlugin.addDocumentToView(views[0].id, doc1);
        viewPlugin.setViewActiveDocument(views[0].id, doc1);
      }

      // Open second document and add to second view
      const { documentId: doc2 } = await docPlugin
        .openDocumentUrl({ url: 'https://snippet.embedpdf.com/ebook.pdf' })
        .toPromise();

      if (views[1]) {
        viewPlugin.addDocumentToView(views[1].id, doc2);
        viewPlugin.setViewActiveDocument(views[1].id, doc2);
      }
    }
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
    {#snippet children()}
      <div
        class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
      >
        <ViewManagerExampleContent />
      </div>
    {/snippet}
  </EmbedPDF>
{/if}
