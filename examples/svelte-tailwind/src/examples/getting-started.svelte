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
  import { LoaderPluginPackage } from '@embedpdf/plugin-loader/svelte';
  import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/svelte';

  // 1. Initialize the engine with the Svelte store
  const pdfEngine = usePdfiumEngine();

  // 2. Register the plugins you need
  const plugins = [
    createPluginRegistration(LoaderPluginPackage, {
      loadingOptions: {
        type: 'url',
        pdfFile: {
          id: 'example-pdf',
          url: 'https://snippet.embedpdf.com/ebook.pdf',
        },
      },
    }),
    createPluginRegistration(ViewportPluginPackage),
    createPluginRegistration(ScrollPluginPackage),
    createPluginRegistration(RenderPluginPackage),
  ];
</script>

{#snippet RenderPageSnippet(page: RenderPageProps)}
  <div style:width="{page.width}px" style:height="{page.height}px" style:position="relative">
    <RenderLayer pageIndex={page.pageIndex} />
  </div>
{/snippet}

<div style="height: 500px; border: 1px solid black; margin-top: 10px;">
  {#if pdfEngine.isLoading || !pdfEngine.engine}
    <div style="display: flex; justify-content: center; align-items: center; height: 100%;">
      Loading PDF Engine...
    </div>
  {:else}
    <EmbedPDF engine={pdfEngine.engine} {plugins}>
      <Viewport style="background-color: #f1f3f5;">
        <Scroller {RenderPageSnippet} />
      </Viewport>
    </EmbedPDF>
  {/if}
</div>
