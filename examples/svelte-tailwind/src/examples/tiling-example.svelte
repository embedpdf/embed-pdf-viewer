<script lang="ts">
  import { usePdfiumEngine } from '@embedpdf/engines/svelte';
  import { EmbedPDF } from '@embedpdf/core/svelte';
  import { createPluginRegistration } from '@embedpdf/core';
  import { LoaderPluginPackage } from '@embedpdf/plugin-loader/svelte';
  import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/svelte';
  import { ScrollPluginPackage } from '@embedpdf/plugin-scroll/svelte';
  import { RenderPluginPackage } from '@embedpdf/plugin-render/svelte';
  import { ZoomPluginPackage, ZoomMode } from '@embedpdf/plugin-zoom/svelte';
  import { TilingPluginPackage } from '@embedpdf/plugin-tiling/svelte';
  import TilingExampleContent from './tiling-example-content.svelte';

  const pdfEngine = usePdfiumEngine();

  const plugins = [
    createPluginRegistration(LoaderPluginPackage, {
      loadingOptions: {
        type: 'url',
        pdfFile: { id: 'example-pdf', url: 'https://snippet.embedpdf.com/ebook.pdf' },
      },
    }),
    createPluginRegistration(ViewportPluginPackage),
    createPluginRegistration(ScrollPluginPackage),
    createPluginRegistration(RenderPluginPackage),
    createPluginRegistration(ZoomPluginPackage, { defaultZoomLevel: ZoomMode.FitPage }),
    createPluginRegistration(TilingPluginPackage, { tileSize: 768, overlapPx: 5 }),
  ];
</script>

{#if pdfEngine.isLoading || !pdfEngine.engine}
  <div>Loading PDF Engine...</div>
{:else}
  <EmbedPDF engine={pdfEngine.engine} {plugins}>
    <TilingExampleContent />
  </EmbedPDF>
{/if}
