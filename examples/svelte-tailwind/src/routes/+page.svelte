<script lang="ts">
  import { usePdfiumEngine } from '@embedpdf/engines/svelte';
  import {createPluginRegistration, type PluginBatchRegistrations, type PluginRegistry} from '@embedpdf/core';
  import {PdfAnnotationSubtype, type PdfStampAnnoObject, type Rotation} from '@embedpdf/models';
  import { EmbedPDF } from '@embedpdf/core/svelte';
  import { LoaderPluginPackage } from '@embedpdf/plugin-loader/svelte';
  import { ViewportPluginPackage } from '@embedpdf/plugin-viewport/svelte';
  import { Viewport } from '@embedpdf/plugin-viewport/svelte';
  import { RenderPluginPackage } from '@embedpdf/plugin-render/svelte';
  import { Scroller, ScrollPluginPackage } from '@embedpdf/plugin-scroll/svelte';
  import { RenderLayer } from '@embedpdf/plugin-render/svelte';
  import { MarqueeZoom } from '@embedpdf/plugin-zoom/svelte';
  import { ZoomPluginPackage } from '@embedpdf/plugin-zoom/svelte';
  import {
    InteractionManagerPluginPackage,
    GlobalPointerProvider,
    PagePointerProvider,
  } from '@embedpdf/plugin-interaction-manager/svelte';
  import { TilingPluginPackage, TilingLayer } from '@embedpdf/plugin-tiling/svelte';
  import { SelectionPluginPackage, SelectionLayer } from '@embedpdf/plugin-selection/svelte';
  import { SpreadPluginPackage } from '@embedpdf/plugin-spread/svelte';
  import { RotatePluginPackage, Rotate } from '@embedpdf/plugin-rotate/svelte';
  import { ExportPluginPackage } from '@embedpdf/plugin-export/svelte';
  import { FullscreenPluginPackage } from '@embedpdf/plugin-fullscreen/svelte';
  import { PanPluginPackage } from '@embedpdf/plugin-pan/svelte';
  import { ThumbnailPluginPackage } from '@embedpdf/plugin-thumbnail/svelte';
  import { SearchPluginPackage, SearchLayer } from '@embedpdf/plugin-search/svelte';
  import { PrintPluginPackage } from '@embedpdf/plugin-print/svelte';
  import {HistoryPluginPackage} from "@embedpdf/plugin-history/svelte";
  import {AnnotationLayer, AnnotationPluginPackage, type AnnotationTool} from "@embedpdf/plugin-annotation/svelte";
  import {AnnotationPlugin} from "@embedpdf/plugin-annotation";
  import Toolbar from '$lib/components/Toolbar.svelte';
  import PageControls from '$lib/components/PageControls.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import Search from '$lib/components/Search.svelte';
  import PrintDialog from '$lib/components/PrintDialog.svelte';
  import AnnotationSelectionMenu from '$lib/components/AnnotationSelectionMenu.svelte';

  type RenderPageProps = {
    width: number;
    height: number;
    pageIndex: number;
    scale: number;
    rotation: Rotation;
  };

  const pdfEngine = usePdfiumEngine();

  let isSidebarOpen = $state(false);
  let isSearchOpen = $state(false);
  let isPrintDialogOpen = $state(false);

  const toggleSidebar = () => {
    isSidebarOpen = !isSidebarOpen;
  };

  const toggleSearch = () => {
    isSearchOpen = !isSearchOpen;
  };

  const openPrintDialog = () => {
    isPrintDialogOpen = true;
  };

  const closePrintDialog = () => {
    isPrintDialogOpen = false;
  };

  const handleInitialized = async (registry: PluginRegistry) => {
    const annotation = registry.getPlugin<AnnotationPlugin>('annotation')?.provides();
    annotation?.addTool<AnnotationTool<PdfStampAnnoObject>>({
      id: 'stampApproved',
      name: 'Stamp Approved',
      interaction: {
        exclusive: false,
        cursor: 'crosshair',
      },
      matchScore: () => 0,
      defaults: {
        type: PdfAnnotationSubtype.STAMP,
        imageSrc:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Eo_circle_green_checkmark.svg/512px-Eo_circle_green_checkmark.svg.png',
        imageSize: { width: 20, height: 20 },
      },
    });
  };

  let plugins = $derived.by(() => {
    const basePlugins: PluginBatchRegistrations = [
      createPluginRegistration(LoaderPluginPackage, {
        loadingOptions: {
          type: 'url',
          pdfFile: {
            id: '1',
            url: 'https://snippet.embedpdf.com/ebook.pdf',
          },
        },
      }),
      createPluginRegistration(ViewportPluginPackage),
      createPluginRegistration(ScrollPluginPackage),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(TilingPluginPackage),
      createPluginRegistration(ZoomPluginPackage),
      createPluginRegistration(SelectionPluginPackage),
      createPluginRegistration(InteractionManagerPluginPackage),
      createPluginRegistration(SpreadPluginPackage),
      createPluginRegistration(RotatePluginPackage),
      createPluginRegistration(ExportPluginPackage),
      createPluginRegistration(FullscreenPluginPackage),
      createPluginRegistration(PanPluginPackage),
      createPluginRegistration(SearchPluginPackage),
      createPluginRegistration(PrintPluginPackage),
      createPluginRegistration(ThumbnailPluginPackage, {
        imagePadding: 10,
        labelHeight: 25,
      }),
        createPluginRegistration(InteractionManagerPluginPackage),
        createPluginRegistration(SelectionPluginPackage),
        createPluginRegistration(HistoryPluginPackage),
        createPluginRegistration(AnnotationPluginPackage, {
            annotationAuthor: 'EmbedPDF User',
        }),
    ];
    return basePlugins;
  });
</script>

{#snippet RenderLayers({ pageIndex, height, width, rotation, scale }: RenderPageProps)}
  <RenderLayer {pageIndex} scale={1} />
  <TilingLayer {pageIndex} {scale} />
  <SelectionLayer {pageIndex} {scale} />
  <SearchLayer {pageIndex} {scale} />
  <MarqueeZoom {pageIndex} {scale} />
  <AnnotationLayer
    pageIndex={pageIndex}
    scale={scale}
    pageWidth={width}
    pageHeight={height}
    rotation={rotation}
  >
    {#snippet selectionMenu({ annotation, selected, menuWrapperProps })}
      {#if selected}
        <AnnotationSelectionMenu {menuWrapperProps} {annotation} />
      {/if}
    {/snippet}
  </AnnotationLayer>
{/snippet}

{#snippet RenderPageSnippet(props: RenderPageProps)}
  <div style:width={`${props.width}`} style:height={`${props.height}`} style:position="relative">
    <Rotate pageSize={{ width: props.width, height: props.height }}>
      <PagePointerProvider
        pageIndex={props.pageIndex}
        pageWidth={props.width}
        pageHeight={props.height}
        rotation={props.rotation}
        scale={props.scale}
      >
        {@render RenderLayers(props)}
      </PagePointerProvider>
    </Rotate>
  </div>
{/snippet}

{#if !pdfEngine.engine || pdfEngine.isLoading}
  <div class="flex h-screen items-center justify-center bg-gray-100">
    <div class="flex flex-col items-center gap-4">
      <svg
        class="h-12 w-12 animate-spin text-blue-600"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
        ></circle>
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
      <p class="text-sm text-gray-600">Loading PDF...</p>
    </div>
  </div>
{:else}
  <div id="view-page" class="flex h-screen flex-1 flex-col overflow-hidden">
    <EmbedPDF engine={pdfEngine.engine} logger={undefined} {plugins} onInitialized={handleInitialized}>
      <div class="flex h-full flex-col">
        <Toolbar
          {isSidebarOpen}
          onToggleSidebar={toggleSidebar}
          {isSearchOpen}
          onToggleSearch={toggleSearch}
          onOpenPrint={openPrintDialog}
        />
        <div class="flex flex-1 overflow-hidden">
          {#if isSidebarOpen}
            <div class="w-64 shrink-0 overflow-hidden border-r border-gray-200">
              <Sidebar />
            </div>
          {/if}
          <div class="flex-1 overflow-hidden">
            <GlobalPointerProvider>
              <Viewport class="h-full w-full overflow-auto select-none bg-gray-100">
                <Scroller {RenderPageSnippet} />
                <PageControls />
              </Viewport>
            </GlobalPointerProvider>
          </div>
          {#if isSearchOpen}
            <div class="w-80 shrink-0 overflow-hidden border-l border-gray-200">
              <Search />
            </div>
          {/if}
        </div>
      </div>
      <PrintDialog open={isPrintDialogOpen} onClose={closePrintDialog} />
    </EmbedPDF>
  </div>
{/if}
