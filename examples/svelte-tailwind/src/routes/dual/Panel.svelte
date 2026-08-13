<script lang="ts">
  import { EmbedPDF } from '@embedpdf/core/svelte';
  import { createPluginRegistration, PluginRegistry } from '@embedpdf/core';
  import type { PdfEngine } from '@embedpdf/models';
  import { ViewportPluginPackage, Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { ScrollPluginPackage, ScrollStrategy, Scroller } from '@embedpdf/plugin-scroll/svelte';
  import {
    DocumentManagerPluginPackage,
    DocumentManagerPlugin,
  } from '@embedpdf/plugin-document-manager/svelte';
  import {
    InteractionManagerPluginPackage,
    GlobalPointerProvider,
    PagePointerProvider,
  } from '@embedpdf/plugin-interaction-manager/svelte';
  import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/svelte';
  import RegistryProbe from './RegistryProbe.svelte';

  interface Props {
    label: string;
    url: string;
    engine: PdfEngine;
  }

  let { label, url, engine }: Props = $props();

  const plugins = [
    createPluginRegistration(ViewportPluginPackage, { viewportGap: 10 }),
    createPluginRegistration(ScrollPluginPackage, { defaultStrategy: ScrollStrategy.Vertical }),
    createPluginRegistration(DocumentManagerPluginPackage),
    createPluginRegistration(InteractionManagerPluginPackage),
    createPluginRegistration(RenderPluginPackage),
  ];

  const handleInitialized = async (registry: PluginRegistry) => {
    registry
      .getPlugin<DocumentManagerPlugin>(DocumentManagerPlugin.id)
      ?.provides()
      ?.openDocumentUrl({ url })
      .toPromise();
  };
</script>

<section class="flex min-w-0 flex-1 flex-col rounded border border-gray-300 bg-white">
  <header class="border-b border-gray-200 px-3 py-2 text-sm font-semibold">{label}</header>

  <EmbedPDF {engine} {plugins} onInitialized={handleInitialized}>
    {#snippet children({ pluginsReady, activeDocumentId })}
      <RegistryProbe {label} />

      <div class="min-h-0 flex-1">
        {#if !pluginsReady}
          <div class="flex h-full items-center justify-center text-sm text-gray-500">
            Initializing plugins…
          </div>
        {:else if !activeDocumentId}
          <div class="flex h-full items-center justify-center text-sm text-gray-500">
            Opening document…
          </div>
        {:else}
          <GlobalPointerProvider documentId={activeDocumentId}>
            <Viewport class="bg-gray-100" documentId={activeDocumentId}>
              <Scroller documentId={activeDocumentId}>
                {#snippet renderPage(page)}
                  <PagePointerProvider documentId={activeDocumentId} pageIndex={page.pageIndex}>
                    <RenderLayer
                      documentId={activeDocumentId}
                      pageIndex={page.pageIndex}
                      scale={1}
                      style="pointer-events: none"
                    />
                  </PagePointerProvider>
                {/snippet}
              </Scroller>
            </Viewport>
          </GlobalPointerProvider>
        {/if}
      </div>
    {/snippet}
  </EmbedPDF>
</section>
