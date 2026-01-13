<script lang="ts">
  import { usePdfiumEngine } from '@embedpdf/engines/svelte';
  import { EmbedPDF } from '@embedpdf/core/svelte';
  import { createPluginRegistration } from '@embedpdf/core';
  import { DocumentManagerPluginPackage } from '@embedpdf/plugin-document-manager/svelte';
  import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/svelte';
  import { ScrollPluginPackage } from '@embedpdf/plugin-scroll/svelte';
  import { RenderPluginPackage } from '@embedpdf/plugin-render/svelte';
  import { ZoomPluginPackage, ZoomMode } from '@embedpdf/plugin-zoom/svelte';
  import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/svelte';
  import { PrintPluginPackage } from '@embedpdf/plugin-print/svelte';
  import { SelectionPluginPackage } from '@embedpdf/plugin-selection/svelte';
  import { Loader2 } from 'lucide-svelte';
  import SecurityExampleContent from './security-example-content.svelte';

  const pdfEngine = usePdfiumEngine();

  const plugins = [
    createPluginRegistration(DocumentManagerPluginPackage, {
      initialDocuments: [
        // Document 1: Full Access - ignores all PDF restrictions
        {
          url: 'https://snippet.embedpdf.com/ebook.pdf',
          name: 'Full Access',
          permissions: {
            enforceDocumentPermissions: false,
          },
        },
        // Document 2: Print Disabled - only printing is blocked
        {
          url: 'https://snippet.embedpdf.com/ebook.pdf',
          name: 'Print Disabled',
          autoActivate: false,
          permissions: {
            enforceDocumentPermissions: false,
            overrides: {
              print: false,
              printHighQuality: false,
            },
          },
        },
        // Document 3: Read-Only - most actions blocked
        {
          url: 'https://snippet.embedpdf.com/ebook.pdf',
          name: 'Read-Only',
          autoActivate: false,
          permissions: {
            enforceDocumentPermissions: false,
            overrides: {
              print: false,
              printHighQuality: false,
              copyContents: false,
              modifyContents: false,
              modifyAnnotations: false,
            },
          },
        },
      ],
    }),
    createPluginRegistration(ViewportPluginPackage),
    createPluginRegistration(ScrollPluginPackage),
    createPluginRegistration(RenderPluginPackage),
    createPluginRegistration(ZoomPluginPackage, {
      defaultZoomLevel: ZoomMode.FitPage,
    }),
    createPluginRegistration(InteractionManagerPluginPackage),
    createPluginRegistration(PrintPluginPackage),
    createPluginRegistration(SelectionPluginPackage),
  ];
</script>

{#if pdfEngine.isLoading || !pdfEngine.engine}
  <div
    class="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900"
  >
    <div class="flex h-[500px] items-center justify-center">
      <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
        <Loader2 size={20} class="animate-spin" />
        <span class="text-sm">Loading PDF Engine...</span>
      </div>
    </div>
  </div>
{:else}
  <EmbedPDF engine={pdfEngine.engine} {plugins}>
    {#snippet children({ pluginsReady, activeDocumentId })}
      {#if pluginsReady}
        <SecurityExampleContent {activeDocumentId} />
      {:else}
        <div class="flex h-[500px] items-center justify-center">
          <Loader2 size={20} class="animate-spin text-gray-400" />
        </div>
      {/if}
    {/snippet}
  </EmbedPDF>
{/if}
