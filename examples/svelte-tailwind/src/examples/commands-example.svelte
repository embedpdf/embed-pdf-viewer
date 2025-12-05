<script lang="ts">
  import { usePdfiumEngine } from '@embedpdf/engines/svelte';
  import { EmbedPDF } from '@embedpdf/core/svelte';
  import { createPluginRegistration, type GlobalStoreState } from '@embedpdf/core';
  import {
    DocumentManagerPluginPackage,
    DocumentContent,
  } from '@embedpdf/plugin-document-manager/svelte';
  import {
    ViewportPluginPackage,
    VIEWPORT_PLUGIN_ID,
    type ViewportState,
  } from '@embedpdf/plugin-viewport/svelte';
  import {
    ScrollPluginPackage,
    SCROLL_PLUGIN_ID,
    type ScrollState,
    type ScrollPlugin,
  } from '@embedpdf/plugin-scroll/svelte';
  import { RenderPluginPackage } from '@embedpdf/plugin-render/svelte';
  import {
    ZoomPluginPackage,
    ZoomMode,
    ZOOM_PLUGIN_ID,
    type ZoomState,
  } from '@embedpdf/plugin-zoom/svelte';
  import { CommandsPluginPackage, type Command } from '@embedpdf/plugin-commands/svelte';
  import { Loader2 } from 'lucide-svelte';
  import CommandsExampleContent from './commands-example-content.svelte';

  const pdfEngine = usePdfiumEngine();

  // Define app state type
  type State = GlobalStoreState<{
    [ZOOM_PLUGIN_ID]: ZoomState;
    [VIEWPORT_PLUGIN_ID]: ViewportState;
    [SCROLL_PLUGIN_ID]: ScrollState;
  }>;

  // Define Commands
  const myCommands: Record<string, Command<State>> = {
    'nav.prev': {
      id: 'nav.prev',
      label: 'Previous Page',
      shortcuts: ['arrowleft', 'k'],
      action: ({ registry, documentId }) => {
        registry
          .getPlugin<ScrollPlugin>('scroll')
          ?.provides()
          ?.forDocument(documentId)
          .scrollToPreviousPage();
      },
      disabled: ({ state, documentId }) => {
        const scrollState = state.plugins.scroll.documents[documentId];
        return scrollState ? scrollState.currentPage <= 1 : true;
      },
    },
    'nav.next': {
      id: 'nav.next',
      label: 'Next Page',
      shortcuts: ['arrowright', 'j'],
      action: ({ registry, documentId }) => {
        registry
          .getPlugin<ScrollPlugin>('scroll')
          ?.provides()
          ?.forDocument(documentId)
          .scrollToNextPage();
      },
      disabled: ({ state, documentId }) => {
        const scrollState = state.plugins.scroll.documents[documentId];
        return scrollState ? scrollState.currentPage >= scrollState.totalPages : true;
      },
    },
    'doc.alert': {
      id: 'doc.alert',
      label: 'Show Info',
      shortcuts: ['ctrl+i', 'meta+i'],
      action: ({ state, documentId }) => {
        const page = state.plugins.scroll.documents[documentId]?.currentPage;
        if (!page) return;
        alert(`You are currently reading page ${page}`);
      },
    },
  };

  const plugins = [
    createPluginRegistration(DocumentManagerPluginPackage, {
      initialDocuments: [{ url: 'https://snippet.embedpdf.com/ebook.pdf' }],
    }),
    createPluginRegistration(ViewportPluginPackage),
    createPluginRegistration(ScrollPluginPackage),
    createPluginRegistration(RenderPluginPackage),
    createPluginRegistration(ZoomPluginPackage, {
      defaultZoomLevel: ZoomMode.FitPage,
    }),
    createPluginRegistration(CommandsPluginPackage, {
      commands: myCommands,
    }),
  ];
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
  <EmbedPDF engine={pdfEngine.engine} {plugins}>
    {#snippet children({ activeDocumentId })}
      {#if activeDocumentId}
        <DocumentContent documentId={activeDocumentId}>
          {#snippet children(documentContent)}
            {#if documentContent.isLoading}
              <div
                class="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
              >
                <div class="flex h-[400px] items-center justify-center">
                  <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                    <Loader2 size={20} class="animate-spin" />
                    <span class="text-sm">Loading document...</span>
                  </div>
                </div>
              </div>
            {:else if documentContent.isLoaded}
              <div
                class="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900"
              >
                <CommandsExampleContent documentId={activeDocumentId} />
              </div>
            {/if}
          {/snippet}
        </DocumentContent>
      {/if}
    {/snippet}
  </EmbedPDF>
{/if}
